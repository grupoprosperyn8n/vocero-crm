import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { createPipelineCard } from "@/server/pipeline/cards";

export const dynamic = "force-dynamic";

/**
 * 029 — agregar una tarjeta a MI pipeline (ventas o gestiones).
 *
 * Fuentes: un contacto del CRM, un cliente del sistema (rec… + rótulo), una
 * alerta (rec… de Airtable + rótulo + foto) o una gestión del sistema (030 —
 * buscador de GESTIÓN GENERAL). Alertas y gestiones SOLO entran al tablero de
 * gestiones: son cosas que hay que gestionar, no negociaciones de venta.
 *
 * Idempotente: si ya está, devuelve la tarjeta existente con 200 y
 * `created: false` — el botón puede llamarse dos veces sin duplicar.
 */
const bodySchema = z.object({
  /** 037 — suman «tareas»: una tarea es una tarjeta más (con título). */
  board: z.enum(["ventas", "gestiones", "tareas"]),
  kind: z.enum(["contact", "sgsa_client", "alert", "sgsa_gestion", "task"]),
  contactId: z.string().min(1).optional(),
  /** rec… del cliente / alerta / gestión de Airtable. */
  ref: z.string().min(3).max(200).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  meta: z.record(z.unknown()).optional(),
  stageId: z.string().min(1).optional(),
  /** 037 — tarea: vencimiento con hora (ISO), nota y prioridad. */
  dueAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  priority: z.enum(["alta", "media", "baja"]).nullable().optional(),
});

export const POST = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const { board, kind, contactId, ref, label, meta, stageId } = body.data;

  if (kind !== "contact" && kind !== "task" && !ref) {
    return apiError(422, "missing_ref", "Falta la referencia de origen");
  }
  // 037 — la tarea lleva título: es su rótulo en el tablero.
  if (kind === "task" && !label) {
    return apiError(422, "missing_label", "La tarea necesita un título");
  }
  // Alertas y gestiones del sistema siempre viven en gestiones; las tareas,
  // en su propio tablero. Venga de donde venga el clic.
  const targetBoard =
    kind === "alert" || kind === "sgsa_gestion"
      ? "gestiones"
      : kind === "task"
        ? "tareas"
        : board;

  const res = await createPipelineCard({
    organizationId: session.organizationId,
    ownerUserId: session.userId,
    board: targetBoard,
    sourceKind: kind,
    contactId: kind === "contact" || kind === "task" ? contactId ?? null : null,
    sgsaRef: kind === "contact" || kind === "task" ? null : ref,
    label: label ?? null,
    meta: meta ?? null,
    stageId: stageId ?? null,
    dueAt: body.data.dueAt ? new Date(body.data.dueAt) : null,
    notes: body.data.notes ?? null,
    priority: body.data.priority ?? null,
  });

  if (!res.ok) {
    if (res.reason === "contact_not_found") {
      return apiError(404, "not_found", "El contacto no existe en este CRM");
    }
    return apiError(
      422,
      "no_stage",
      "El tablero no tiene etapas abiertas donde colocar la tarjeta"
    );
  }

  return Response.json(
    { card: { id: res.id, stageId: res.stageId, board: targetBoard }, created: res.created },
    { status: res.created ? 201 : 200 }
  );
});
