import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { alertEstadoForStageKind, type AlertStatus } from "@/lib/alerts";
import type { PipelineCardDto, StageDto } from "@/lib/types";
import { REC_ID_RE, airtableRecordsByIds } from "@/server/alerts/airtable-read";
import { listAlerts } from "@/server/alerts/service";
import { changeAlertStatusFromCrm } from "@/server/alerts/status-flow";
import { moveLeadToStage } from "@/server/leads/stage-history";

type Session = { userId: string; organizationId: string; role: string };

/* ── caché de ESTADOS (Airtable) ──────────────────────────────────────────────
   Mini-TTL para que abrir el tablero siga siendo instantáneo con varias cargas
   seguidas; se tira cuando un cambio de estado acaba de pasar por acá. */
const ESTADOS_TTL_MS = 15_000;
let estadosCache: { at: number; map: Map<string, string> } | null = null;

/** Lo usan ack/status al cambiar estados fuera del tablero. */
export function invalidateAlertEstadoCache(): void {
  estadosCache = null;
}

function normalizarEstado(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

/**
 * PULL — el estado REAL de las alertas de esas tarjetas, leído de la tabla
 * ALERTAS (Airtable manda). Best-effort: si no responde, `null` y el tablero
 * se muestra sin sincronizar.
 */
async function estadosDeTarjetas(refs: string[]): Promise<Map<string, string> | null> {
  const recs = [...new Set(refs.filter((r) => REC_ID_RE.test(r)))];
  if (!recs.length) return new Map();
  const fresh = estadosCache && Date.now() - estadosCache.at < ESTADOS_TTL_MS;
  try {
    if (fresh && estadosCache) {
      const cacheRef = estadosCache;
      const missing = recs.filter((r) => !cacheRef.map.has(r));
      if (missing.length) {
        const rows = await airtableRecordsByIds("ALERTAS", missing, ["ESTADO"]);
        for (const r of rows) cacheRef.map.set(r.id, normalizarEstado(r.fields["ESTADO"]));
      }
      return cacheRef.map;
    }
    const rows = await airtableRecordsByIds("ALERTAS", recs, ["ESTADO"]);
    const map = new Map<string, string>();
    for (const r of rows) map.set(r.id, normalizarEstado(r.fields["ESTADO"]));
    estadosCache = { at: Date.now(), map };
    return map;
  } catch {
    // Con lo cacheado alcanza; sin caché, el tablero sale sin sincronizar.
    return estadosCache?.map ?? null;
  }
}

/** Estado del sistema → qué tipo de etapa le corresponde (o null: no se toca). */
function desiredKindFor(estado: string): "open" | "won" | "lost" | null {
  if (estado === "CONCLUIDA") return "won";
  if (estado === "ANULADA") return "lost";
  if (estado === "PENDIENTE" || estado === "EN_PROGRESO" || estado === "TURNO_CONFIRMADO") return "open";
  return null;
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
 * anulada desde la PWA, o movida desde Alertas), la tarjeta se acomoda sola.
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
  const estados = await estadosDeTarjetas(alertCards.map((c) => c.sgsaRef!));
  if (!estados) return { cards: input.cards, changes: [] };

  const cards = [...input.cards];
  const changes: AlertCardSyncChange[] = [];
  const openStages = input.stages.filter((s) => s.kind === "open");
  const wonStage = input.stages.find((s) => s.kind === "won");
  const lostStage = input.stages.find((s) => s.kind === "lost");

  for (const card of alertCards) {
    const estado = estados.get(card.sgsaRef!);
    if (!estado) continue; // el registro ya no está en la tabla: no se toca
    const meta = (card.meta ?? {}) as Record<string, unknown>;
    if (meta.estado === estado) continue; // ya macheada

    const kind = desiredKindFor(estado);
    if (!kind) continue; // estado desconocido: mejor no inventar
    const current = input.stages.find((s) => s.id === card.stageId);
    const target =
      kind === "open"
        ? estado === "PENDIENTE"
          ? openStages[0]
          : openStages[openStages.length - 1]
        : kind === "won"
          ? wonStage
          : lostStage;

    const newMeta = { ...meta, estado, estadoAt: new Date().toISOString() };
    let newStageId = card.stageId;

    if (target && current && target.id !== card.stageId && target.kind !== current.kind) {
      try {
        const res = await moveLeadToStage({
          organizationId: input.organizationId,
          leadId: card.id,
          toStageId: target.id,
          actorUserId: card.ownerUserId ?? null,
          source: "sistema",
          lossReason: target.kind === "lost" ? "otro" : null,
          lossNote: target.kind === "lost" ? "Alerta anulada en el sistema" : null,
          extra: { meta: newMeta },
        });
        if (res.ok) newStageId = target.id;
      } catch {
        // el estado igual se refleja; la próxima apertura reintenta el movimiento
      }
    }
    if (newStageId === card.stageId) await updateCardMeta(input.organizationId, card.id, newMeta);
    const idx = cards.findIndex((c) => c.id === card.id);
    if (idx >= 0) cards[idx] = { ...cards[idx]!, stageId: newStageId, meta: newMeta };
    changes.push({
      cardId: card.id,
      from: (meta.estado as string | undefined) ?? null,
      to: estado,
      movedTo: newStageId,
    });
  }
  return { cards, changes };
}

async function updateCardMeta(
  organizationId: string,
  leadId: string,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    await getDb()
      .update(schema.lead)
      .set({ meta, updatedAt: new Date() })
      .where(scoped(schema.lead.organizationId, organizationId, eq(schema.lead.id, leadId)));
  } catch (err) {
    console.error("[pipeline] no se pudo guardar el estado de la tarjeta:", err);
  }
}

/**
 * PUSH — manda la TARJETA: mover una tarjeta-alerta toca el estado REAL en el
 * sistema, por el mismo camino que la ruta de estado («una sola puerta»). Si
 * el sistema no lo acepta, el movimiento se rechaza: prometer «concluida» y
 * no cumplirlo sería peor que no dejar mover.
 */
export async function pushCardAlertEstado(input: {
  session: Session;
  card: { id: string; sourceKind: string | null; sgsaRef: string | null; meta: unknown };
  toStageKind: "open" | "won" | "lost";
}): Promise<{ ok: true; estado: AlertStatus; changed: boolean } | { ok: false; message: string }> {
  if (input.card.sourceKind !== "alert" || !input.card.sgsaRef) {
    return { ok: false, message: "La tarjeta no es una alerta del sistema" };
  }
  const ref = input.card.sgsaRef;
  const estado = alertEstadoForStageKind(input.toStageKind);
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
  } catch {
    return {
      ok: false,
      message: "El sistema no aceptó el cambio de estado — reintentá en un momento",
    };
  }
  invalidateAlertEstadoCache();
  return { ok: true, estado, changed: true };
}
