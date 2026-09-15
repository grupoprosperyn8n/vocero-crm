import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { publish } from "@/server/events/bus";
import { moveLeadToStage } from "@/server/leads/stage-history";
import { pushCardAlertEstado } from "@/server/pipeline/alert-sync";
import { getBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  /**
   * Opcionales desde que el lead tiene monto: capturar dinero es un gesto
   * distinto de mover la tarjeta, y exigir la etapa para guardar un importe
   * obligaría al cliente a reenviar dónde estaba —con el riesgo de moverlo sin
   * querer si el tablero venía desfasado—. Sin `stageId` no se mueve nada.
   */
  stageId: z.string().min(1).optional(),
  position: z.number().int().min(0).optional(),
  /**
   * Obligatorio al ENTRAR a una etapa perdida. No se valida aquí sino en la
   * puerta: la regla es del dominio, no de esta ruta, y hay más caminos que
   * mueven tarjetas.
   */
  lossReason: z
    .enum([
      "precio",
      "no_es_perfil",
      "sin_presupuesto",
      "eligio_otro",
      "nunca_contesto",
      "otro",
    ])
    .optional(),
  lossNote: z.string().max(500).optional(),
  /**
   * Monto en centavos enteros. `null` explícito lo borra; ausente lo deja como
   * estaba — capturar el monto y mover la tarjeta son dos gestos distintos y
   * uno no debe pisar al otro.
   */
  amountCents: z.number().int().min(0).max(1_000_000_000_00).nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  /** `null` explícito la quita; ausente la deja como estaba. */
  priority: z.enum(["alta", "media", "baja"]).nullable().optional(),
});

/**
 * 029 — solo el DUEÑO de la tarjeta la edita o la mueve. Ver el trabajo de
 * los demás (propietario/administrador/gerente) nunca fue tocarlo.
 */
async function loadOwnCard(organizationId: string, id: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.lead.id,
      ownerUserId: schema.lead.ownerUserId,
      board: schema.lead.board,
      contactId: schema.lead.contactId,
      // 030 — la sincronización de tarjetas-alerta necesita saber de dónde
      // viene la tarjeta y su foto (ref + meta).
      sourceKind: schema.lead.sourceKind,
      sgsaRef: schema.lead.sgsaRef,
      meta: schema.lead.meta,
    })
    .from(schema.lead)
    .where(
      scoped(schema.lead.organizationId, organizationId, eq(schema.lead.id, id))
    )
    .limit(1);
  const card = rows[0];
  if (!card) return { error: apiError(404, "not_found", "Tarjeta no encontrada") };
  if (card.ownerUserId !== userId) {
    return {
      error: apiError(
        403,
        "not_owner",
        "Esta tarjeta es de otra persona: cada quien mueve las suyas"
      ),
    };
  }
  return { card };
}

export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const found = await loadOwnCard(session.organizationId, id, session.userId);
  if (found.error) return found.error;
  const { card } = found;

  // El monto viaja en el MISMO update que el movimiento: capturarlo mientras
  // se arrastra la tarjeta no debe costar dos viajes ni dejar un estado a
  // medias si el segundo falla.
  const extra: Record<string, unknown> = {};
  if (body.data.amountCents !== undefined) {
    extra.amountCents = body.data.amountCents;
    // Sin monto no hay moneda que guardar: dejarla apuntando a un importe
    // borrado haría que el tablero contara un lead que ya no tiene número.
    extra.currency =
      body.data.amountCents === null
        ? null
        : (body.data.currency ?? (await getBranding(session.organizationId)).currency);
  }

  if (body.data.priority !== undefined) {
    extra.priority = body.data.priority;
    // La fecha acompaña al valor: sirve para saber si la decisión es de hoy o
    // de hace tres semanas, que es lo que vuelve útil mirarla.
    extra.priorityUpdatedAt = body.data.priority === null ? null : new Date();
  }

  // Sin etapa: solo se actualizan los campos del lead. No pasa por la puerta
  // de la bitácora porque no hay movimiento que registrar — y el guardarraíl
  // sigue contento: aquí jamás se escribe `stageId`.
  if (!body.data.stageId) {
    if (Object.keys(extra).length === 0) {
      return apiError(422, "nothing_to_update", "No hay nada que actualizar");
    }
    const db = getDb();
    const updated = await db
      .update(schema.lead)
      .set({ ...extra, updatedAt: new Date() })
      .where(
        scoped(
          schema.lead.organizationId,
          session.organizationId,
          eq(schema.lead.id, id)
        )
      )
      .returning();
    if (!updated[0]) return apiError(404, "not_found", "Lead no encontrado");
    return Response.json({ lead: updated[0] });
  }

  // Una tarjeta jamás salta de tablero: las etapas de gestiones no existen en
  // el embudo de ventas y moverla dejaría el tablero mintiendo.
  const db = getDb();
  const target = await db
    .select({
      board: schema.pipelineStage.board,
      kind: schema.pipelineStage.kind,
      estado: schema.pipelineStage.estado,
    })
    .from(schema.pipelineStage)
    .where(
      scoped(
        schema.pipelineStage.organizationId,
        session.organizationId,
        eq(schema.pipelineStage.id, body.data.stageId)
      )
    )
    .limit(1);
  if (target[0] && target[0].board !== card.board) {
    return apiError(422, "invalid_stage", "Esa etapa es de otro tablero");
  }

  // 030 → 031 — tarjeta-alerta «macheada»: mover la tarjeta toca el estado
  // REAL de la alerta en el sistema (el estado de la etapa manda; sin `estado`
  // guardado cae al ancla: `won` = CONCLUIDA, `lost` = ANULADA, abierta =
  // EN_PROGRESO). Si el sistema no lo acepta el movimiento se rechaza: la
  // tarjeta no puede prometer lo que la tabla no va a decir.
  let alertMetaPatch: Record<string, unknown> | null = null;
  if (card.sourceKind === "alert") {
    const sync = await pushCardAlertEstado({
      session,
      card: {
        id: card.id,
        sourceKind: card.sourceKind,
        sgsaRef: card.sgsaRef,
        meta: card.meta,
      },
      toStage: {
        kind: target[0]?.kind ?? "open",
        estado: target[0]?.estado ?? null,
      },
    });
    if (!sync.ok) return apiError(502, "alert_sync_failed", sync.message);
    if (sync.changed) {
      alertMetaPatch = {
        meta: {
          ...((card.meta as Record<string, unknown> | null) ?? {}),
          estado: sync.estado,
          estadoAt: new Date().toISOString(),
        },
      };
    }
  }

  // 031 — una tarjeta del SISTEMA (alerta/gestión) no es un trato de venta:
  // al anularla no se pide «motivo de pérdida» (el motivo real vive en la
  // tabla); se registra solo, con nota, para no romper la trazabilidad.
  const esTarjetaSistema =
    card.sourceKind === "alert" || card.sourceKind === "sgsa_gestion";
  const res = await moveLeadToStage({
    organizationId: session.organizationId,
    leadId: id,
    toStageId: body.data.stageId,
    position: body.data.position,
    actorUserId: session.userId,
    source: "dueno",
    lossReason: body.data.lossReason ?? (esTarjetaSistema ? "otro" : null),
    lossNote:
      body.data.lossNote ??
      (esTarjetaSistema ? "Anulada desde el tablero de gestiones" : null),
    extra: { ...extra, ...(alertMetaPatch ?? {}) },
  });

  if (!res.ok) {
    if (res.reason === "lead_not_found") {
      return apiError(404, "not_found", "Lead no encontrado");
    }
    if (res.reason === "stage_not_found") {
      return apiError(422, "invalid_stage", "Etapa inexistente");
    }
    // El tablero abre su diálogo con este código: perder un trato sin decir
    // por qué deja el embudo sin la mitad que importa.
    return apiError(
      422,
      "loss_reason_required",
      "Falta el motivo de la pérdida"
    );
  }

  // Notifica a la bandeja para que la etapa se refleje en vivo (panel de
  // detalles y punto de etapa de la lista) sin recargar. Las tarjetas sin
  // contacto (sistema/alerta) no tienen conversación que avisar.
  if (res.lead.contactId) {
    const convRows = await db
      .select({ id: schema.conversation.id })
      .from(schema.conversation)
      .where(
        and(
          eq(schema.conversation.organizationId, session.organizationId),
          eq(schema.conversation.contactId, res.lead.contactId),
          eq(schema.conversation.isTest, false)
        )
      )
      .limit(1);
    if (convRows[0]) {
      publish(session.organizationId, {
        type: "conversation.updated",
        data: { conversation: { id: convRows[0].id } },
      });
    }
  }

  return Response.json({ lead: res.lead });
});

/**
 * 029 — sacar la tarjeta de MI pipeline. Los eventos de bitácora se van con
 * ella (FK cascade): su historia es parte de la tarjeta, no del embudo.
 */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const found = await loadOwnCard(session.organizationId, id, session.userId);
  if (found.error) return found.error;

  const db = getDb();
  const deleted = await db
    .delete(schema.lead)
    .where(
      scoped(schema.lead.organizationId, session.organizationId, eq(schema.lead.id, id))
    )
    .returning({ id: schema.lead.id });
  if (!deleted[0]) return apiError(404, "not_found", "Tarjeta no encontrada");
  return Response.json({ deleted: true });
});
