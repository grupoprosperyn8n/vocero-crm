import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { alertEstadoForStageKind, type AlertStatus } from "@/lib/alerts";
import type { PipelineCardDto, SgsaAlertDto, StageDto } from "@/lib/types";
import { listAlerts } from "@/server/alerts/service";
import { changeAlertStatusFromCrm } from "@/server/alerts/status-flow";
import { moveLeadToStage } from "@/server/leads/stage-history";

/**
 * 030 — «macheado» entre las tarjetas-alerta del pipeline y la tabla ALERTA
 * del sistema: mismas condiciones de trabajo y estado.
 *
 *  · PUSH: mover una tarjeta toca el estado REAL (última etapa = CONCLUIDA,
 *    ancla perdida = ANULADA, etapa abierta = EN_PROGRESO), por el mismo
 *    camino que la ruta de estado de Alertas.
 *  · PULL: al abrir el tablero, la alerta manda — si el sistema dice
 *    CONCLUIDA/ANULADA (PWA incluida) la tarjeta se acomoda sola.
 */

type Session = { userId: string; organizationId: string; role: string };

type CachedAlert = { estado: string; alert: SgsaAlertDto };

const CACHE_MS = 20_000;
let cache: { at: number; byRef: Map<string, CachedAlert> } | null = null;

/** La usan las rutas que cambian estados fuera del tablero (ack / status). */
export function invalidateAlertEstadoCache(): void {
  cache = null;
}

/**
 * Mapa ref→alerta de TODO el sistema (pendientes + historial), cacheado 20s
 * para que abrir el tablero siga siendo instantáneo. Best-effort: sin backend
 * el tablero se muestra igual, sin sincronizar.
 */
async function alertCacheByRef(force = false): Promise<Map<string, CachedAlert> | null> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.byRef;
  try {
    const [pend, hist] = await Promise.all([listAlerts(false), listAlerts(true)]);
    const byRef = new Map<string, CachedAlert>();
    for (const a of [...pend.alerts, ...hist.alerts]) {
      const entry: CachedAlert = { estado: a.estado, alert: a };
      if (a.airtableRecordId) byRef.set(a.airtableRecordId, entry);
      byRef.set(a.id, entry);
    }
    cache = { at: Date.now(), byRef };
    return byRef;
  } catch {
    return null;
  }
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
      .where(
        scoped(schema.lead.organizationId, organizationId, eq(schema.lead.id, leadId))
      );
  } catch {
    // El estado se refleja en la respuesta igual; la próxima apertura reintenta.
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
 * PULL — manda la ALERTA: si su estado cambió en el sistema (concluida o
 * anulada desde la PWA, o movida desde Alertas), la tarjeta se acomoda sola.
 * Devuelve las tarjetas ya corregidas (y sin cambios si no hay backend).
 */
export async function pullAlertSync(input: {
  organizationId: string;
  stages: StageDto[];
  cards: PipelineCardDto[];
}): Promise<{ cards: PipelineCardDto[]; changes: AlertCardSyncChange[] }> {
  const alertCards = input.cards.filter((c) => c.sourceKind === "alert" && c.sgsaRef);
  if (!alertCards.length) return { cards: input.cards, changes: [] };
  const byRef = await alertCacheByRef();
  if (!byRef) return { cards: input.cards, changes: [] };

  const cards = [...input.cards];
  const changes: AlertCardSyncChange[] = [];
  const openStages = input.stages.filter((s) => s.kind === "open");
  const wonStage = input.stages.find((s) => s.kind === "won");
  const lostStage = input.stages.find((s) => s.kind === "lost");

  for (const card of alertCards) {
    const entry = byRef.get(card.sgsaRef ?? "");
    if (!entry) continue; // la alerta ya no está en el sistema: no se toca
    const meta = (card.meta ?? {}) as Record<string, unknown>;
    if (meta.estado === entry.estado) continue; // ya macheada

    const current = input.stages.find((s) => s.id === card.stageId);
    const desired: "open" | "won" | "lost" =
      entry.estado === "CONCLUIDA" ? "won" : entry.estado === "ANULADA" ? "lost" : "open";
    const target =
      desired === "open"
        ? openStages[openStages.length - 1] // «En curso»: el trabajo se retoma donde estaba
        : desired === "won"
          ? wonStage
          : lostStage;

    const newMeta = { ...meta, estado: entry.estado, estadoAt: new Date().toISOString() };
    let newStageId = card.stageId;

    // Solo se mueve si CAMBIA de tipo de etapa (concluir/reabrir); dentro de
    // las abiertas el orden es del dueño y no se toca.
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
        // El estado se refleja igual; el movimiento se reintenta al reabrir.
      }
    }
    if (newStageId === card.stageId) await updateCardMeta(input.organizationId, card.id, newMeta);

    const idx = cards.findIndex((c) => c.id === card.id);
    if (idx >= 0) cards[idx] = { ...cards[idx]!, stageId: newStageId, meta: newMeta };
    changes.push({
      cardId: card.id,
      from: (meta.estado as string | undefined) ?? null,
      to: entry.estado,
      movedTo: newStageId,
    });
  }
  return { cards, changes };
}

/**
 * PUSH — manda la TARJETA: mover una tarjeta-alerta toca el estado REAL en el
 * sistema. Si el sistema no lo acepta, el movimiento se rechaza: prometer
 * «concluida» en la tarjeta y no cumplirlo en la tabla sería peor que no
 * dejar mover.
 */
export async function pushCardAlertEstado(input: {
  session: Session;
  card: { id: string; sourceKind: string | null; sgsaRef: string | null; meta: unknown };
  toStageKind: "open" | "won" | "lost";
}): Promise<{ ok: true; estado: AlertStatus; changed: boolean } | { ok: false; message: string }> {
  if (input.card.sourceKind !== "alert" || !input.card.sgsaRef) {
    return { ok: false, message: "La tarjeta no es una alerta" };
  }
  const estado = alertEstadoForStageKind(input.toStageKind);
  const meta = (input.card.meta ?? {}) as Record<string, unknown>;
  if (meta.estado === estado) return { ok: true, estado, changed: false };

  const byRef = await alertCacheByRef(true); // escribir exige datos frescos
  const entry = byRef?.get(input.card.sgsaRef);
  if (!entry) {
    return {
      ok: false,
      message: "No se encontró la alerta en el sistema — no se pudo sincronizar",
    };
  }
  try {
    await changeAlertStatusFromCrm({
      session: input.session,
      alertStoreId: entry.alert.id,
      estado,
    });
  } catch {
    return {
      ok: false,
      message: "El sistema no aceptó el cambio de estado — reintentá en un momento",
    };
  }
  entry.estado = estado; // el mapa cacheado queda al día
  return { ok: true, estado, changed: true };
}
