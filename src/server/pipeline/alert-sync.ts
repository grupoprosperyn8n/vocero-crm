import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { estadoForStage, priorityValueForPrioridad, stageForEstado } from "@/lib/alerts";
import type { PipelineCardDto, StageDto } from "@/lib/types";
import { REC_ID_RE, airtableRecordsByIds } from "@/server/alerts/airtable-read";
import { listAlerts } from "@/server/alerts/service";
import { AlertBusyError, changeAlertStatusFromCrm } from "@/server/alerts/status-flow";
import { moveLeadToStage } from "@/server/leads/stage-history";

type Session = { userId: string; organizationId: string; role: string };

/* ── caché del estado real (Airtable) ─────────────────────────────────────────
   Mini-TTL para que abrir el tablero siga siendo instantáneo con varias cargas
   seguidas; se tira cuando un cambio de estado acaba de pasar por acá. */
const ESTADOS_TTL_MS = 15_000;
let estadosCache: { at: number; map: Map<string, EstadoSistema> } | null = null;

/** Lo usan ack/status al cambiar estados fuera del tablero. */
export function invalidateAlertEstadoCache(): void {
  estadosCache = null;
}

/** Lo que el sistema dice de una alerta: estado + prioridad (chip «macheado»). */
type EstadoSistema = { estado: string; prioridad: string | null };

function normalizarEstado(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

function normalizarPrioridad(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function leerSistema(fields: Record<string, unknown>): EstadoSistema {
  return {
    estado: normalizarEstado(fields["ESTADO"]),
    prioridad: normalizarPrioridad(fields["PRIORIDAD"]),
  };
}

/**
 * PULL — el estado REAL de las alertas de esas tarjetas, leído de la tabla
 * ALERTAS (Airtable manda), junto con su prioridad para el chip. Best-effort:
 * si no responde, `null` y el tablero se muestra sin sincronizar.
 */
async function sistemaDeTarjetas(refs: string[]): Promise<Map<string, EstadoSistema> | null> {
  const recs = [...new Set(refs.filter((r) => REC_ID_RE.test(r)))];
  if (!recs.length) return new Map();
  const fresh = estadosCache && Date.now() - estadosCache.at < ESTADOS_TTL_MS;
  try {
    if (fresh && estadosCache) {
      const cacheRef = estadosCache;
      const missing = recs.filter((r) => !cacheRef.map.has(r));
      if (missing.length) {
        const rows = await airtableRecordsByIds("ALERTAS", missing, ["ESTADO", "PRIORIDAD"]);
        for (const r of rows) cacheRef.map.set(r.id, leerSistema(r.fields));
      }
      return cacheRef.map;
    }
    const rows = await airtableRecordsByIds("ALERTAS", recs, ["ESTADO", "PRIORIDAD"]);
    const map = new Map<string, EstadoSistema>();
    for (const r of rows) map.set(r.id, leerSistema(r.fields));
    estadosCache = { at: Date.now(), map };
    return map;
  } catch {
    // Con lo cacheado alcanza; sin caché, el tablero sale sin sincronizar.
    return estadosCache?.map ?? null;
  }
}

export type AlertCardSyncChange = {
  cardId: string;
  from: string | null;
  to: string;
  /** Etapa en la que quedó la tarjeta (la misma si no hubo movimiento). */
  movedTo: string;
};

/**
 * PULL — manda la ALERTA. Si su estado cambió en el sistema (concluida o
 * anulada desde la PWA, o movida desde Alertas), la tarjeta se acomoda sola en
 * la columna de ese estado; la prioridad se refresca para el chip.
 * Best-effort: sin datos devuelve las tarjetas intactas.
 */
export async function pullAlertSync(input: {
  organizationId: string;
  stages: StageDto[];
  cards: PipelineCardDto[];
}): Promise<{ cards: PipelineCardDto[]; changes: AlertCardSyncChange[] }> {
  const alertCards = input.cards.filter(
    (c) => c.sourceKind === "alert" && c.sgsaRef && REC_ID_RE.test(c.sgsaRef)
  );
  if (!alertCards.length) return { cards: input.cards, changes: [] };
  const sistema = await sistemaDeTarjetas(alertCards.map((c) => c.sgsaRef!));
  if (!sistema) return { cards: input.cards, changes: [] };

  const cards = [...input.cards];
  const changes: AlertCardSyncChange[] = [];

  for (const card of alertCards) {
    const info = sistema.get(card.sgsaRef!);
    if (!info || !info.estado) continue; // el registro ya no está en la tabla: no se toca
    const meta = (card.meta ?? {}) as Record<string, unknown>;
    const prioridad =
      info.prioridad ?? (typeof meta.prioridad === "string" ? meta.prioridad : null);
    // 031c — la prioridad del CRM (cajón y chip) es ESPEJO de la de la alerta:
    // alta/media/baja/null. Si difiere, este mismo pase la corrige acá.
    const priority = priorityValueForPrioridad(prioridad);
    const priorityChanged = card.priority !== priority;
    if (meta.estado === info.estado && meta.prioridad === prioridad && !priorityChanged) {
      continue; // ya macheada
    }

    // El estado del sistema elige la columna; DESACTIVADA / REVISADA no tienen
    // columna propia: la tarjeta queda donde está y solo se refresca el chip.
    const target = stageForEstado(input.stages, info.estado);
    const newMeta = {
      ...meta,
      estado: info.estado,
      prioridad,
      estadoAt: new Date().toISOString(),
    };
    const priorityExtra: Record<string, unknown> = priorityChanged
      ? { priority, priorityUpdatedAt: priority === null ? null : new Date() }
      : {};
    let newStageId = card.stageId;

    if (target && target.id !== card.stageId) {
      try {
        const res = await moveLeadToStage({
          organizationId: input.organizationId,
          leadId: card.id,
          toStageId: target.id,
          actorUserId: card.ownerUserId ?? null,
          source: "sistema",
          lossReason: target.kind === "lost" ? "otro" : null,
          lossNote: target.kind === "lost" ? "Alerta anulada en el sistema" : null,
          extra: { meta: newMeta, ...priorityExtra },
        });
        if (res.ok) newStageId = target.id;
      } catch {
        // el estado igual se refleja; la próxima apertura reintenta el movimiento
      }
    }
    if (newStageId === card.stageId) {
      await updateCardSync(input.organizationId, card.id, newMeta, priorityExtra);
    }
    const idx = cards.findIndex((c) => c.id === card.id);
    if (idx >= 0) {
      cards[idx] = { ...cards[idx]!, stageId: newStageId, meta: newMeta, priority };
    }
    changes.push({
      cardId: card.id,
      from: (meta.estado as string | undefined) ?? null,
      to: info.estado,
      movedTo: newStageId,
    });
  }
  return { cards, changes };
}

async function updateCardSync(
  organizationId: string,
  leadId: string,
  meta: Record<string, unknown>,
  extra: Record<string, unknown>
): Promise<void> {
  try {
    await getDb()
      .update(schema.lead)
      .set({ meta, ...extra, updatedAt: new Date() })
      .where(scoped(schema.lead.organizationId, organizationId, eq(schema.lead.id, leadId)));
  } catch (err) {
    console.error("[pipeline] no se pudo guardar el estado de la tarjeta:", err);
  }
}

/**
 * PUSH — manda la TARJETA: mover una tarjeta-alerta toca el estado REAL en el
 * sistema, por el mismo camino que la ruta de estado («una sola puerta»). El
 * estado lo manda la ETAPA destino (031): su `estado` propio o, si es vieja,
 * el ancla (`won` = CONCLUIDA, `lost` = ANULADA, abierta = EN_PROGRESO). Si el
 * sistema no lo acepta, el movimiento se rechaza: prometer «concluida» y no
 * cumplirlo sería peor que no dejar mover.
 */
export async function pushCardAlertEstado(input: {
  session: Session;
  card: { id: string; sourceKind: string | null; sgsaRef: string | null; meta: unknown };
  toStage: { kind: "open" | "won" | "lost"; estado?: string | null };
}): Promise<{ ok: true; estado: string; changed: boolean } | { ok: false; message: string }> {
  if (input.card.sourceKind !== "alert" || !input.card.sgsaRef) {
    return { ok: false, message: "La tarjeta no es una alerta del sistema" };
  }
  const ref = input.card.sgsaRef;
  const estado = estadoForStage(input.toStage);
  const meta = (input.card.meta ?? {}) as Record<string, unknown>;
  if (meta.estado === estado) return { ok: true, estado, changed: false }; // ya macheada

  // Store id: el guardado al crear la tarjeta; si falta (tarjetas viejas), se
  // lo busca en las listas del backend mientras la alerta siga apareciendo.
  let storeId =
    typeof meta.alertStoreId === "string" && meta.alertStoreId ? meta.alertStoreId : null;
  if (!storeId) {
    try {
      const [pend, hist] = await Promise.all([listAlerts(false), listAlerts(true)]);
      const hit = [...pend.alerts, ...hist.alerts].find(
        (a) => a.airtableRecordId === ref || a.id === ref
      );
      storeId = hit?.id ?? null;
    } catch {
      storeId = null;
    }
  }
  if (!storeId) {
    return {
      ok: false,
      message: "No se encontró la alerta en el sistema — no se pudo sincronizar",
    };
  }
  try {
    await changeAlertStatusFromCrm({ session: input.session, alertStoreId: storeId, estado });
  } catch (err) {
    if (err instanceof AlertBusyError) return { ok: false, message: err.message };
    return {
      ok: false,
      message: "El sistema no aceptó el cambio de estado — reintentá en un momento",
    };
  }
  invalidateAlertEstadoCache();
  return { ok: true, estado, changed: true };
}
