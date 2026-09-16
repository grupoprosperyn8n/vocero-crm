import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { REVIEW_ENVIO_ALERT_TYPE, REVIEW_GROUP_NAME } from "@/lib/reviews";
import { canManageAlertAssignments } from "@/server/alerts/assignments";
import type { ChatReviewShareDto, ReviewDelivery, SgsaAlertDto } from "@/lib/types";

/**
 * 033c — Las revisiones de envío PENDIENTES también aparecen en la sección
 * Alertas (pedido de Diego): la tarjeta vive en el chat interno (grupo «Alerta
 * de Siniestro»), pero la cola de Alertas la muestra como una alerta más, con
 * acción «Abrir conversación» que lleva directo a decidir.
 *
 * Visibilidad: quien ve toda la cola (dueño/administrador/gerente) ve todas;
 * un empleado ve las que cayeron en alguna sala de las que participa (el
 * grupo del flujo o un grupo copia). Nada se persiste acá: es una vista sobre
 * `review_request` + el chat interno.
 */

export type ReviewInboxAlert = SgsaAlertDto & {
  source: "review";
  review: {
    recordId: string;
    roomId: string;
    recipients: string[];
    deliveries: number;
  };
};

/** Copias de una fila (fallback: la entrega principal). Espejo del servicio. */
function rowRooms(row: {
  deliveries: ReviewDelivery[] | null;
  roomId: string;
}): { roomId: string; name: string | null }[] {
  const list = Array.isArray(row.deliveries)
    ? row.deliveries.filter(
        (d) => d && typeof d.roomId === "string" && typeof d.messageId === "string"
      )
    : [];
  if (list.length) {
    return list.map((d) => ({ roomId: d.roomId, name: d.name ?? null }));
  }
  return [{ roomId: row.roomId, name: null }];
}

export async function listPendingReviewAlerts(input: {
  organizationId: string;
  userId: string;
  role: string;
}): Promise<ReviewInboxAlert[]> {
  const db = getDb();
  const rows = await db
    .select({
      recordId: schema.reviewRequest.recordId,
      cliente: schema.reviewRequest.cliente,
      roomId: schema.reviewRequest.roomId,
      deliveries: schema.reviewRequest.deliveries,
      payload: schema.reviewRequest.payload,
      createdAt: schema.reviewRequest.createdAt,
    })
    .from(schema.reviewRequest)
    .where(
      and(
        eq(schema.reviewRequest.organizationId, input.organizationId),
        eq(schema.reviewRequest.status, "pendiente")
      )
    )
    .orderBy(desc(schema.reviewRequest.createdAt));
  if (!rows.length) return [];

  let visible = rows;
  if (!canManageAlertAssignments(input.role)) {
    const roomIds = [
      ...new Set(rows.flatMap((r) => rowRooms(r).map((x) => x.roomId))),
    ];
    const memberships = roomIds.length
      ? await db
          .select({ roomId: schema.chatRoomMember.roomId })
          .from(schema.chatRoomMember)
          .where(
            and(
              eq(schema.chatRoomMember.userId, input.userId),
              inArray(schema.chatRoomMember.roomId, roomIds)
            )
          )
      : [];
    const mine = new Set(memberships.map((m) => m.roomId));
    visible = rows.filter((r) => rowRooms(r).some((x) => mine.has(x.roomId)));
  }

  return visible.map((row) => {
    const rooms = rowRooms(row);
    const recipients = [
      ...new Set(rooms.map((r) => r.name?.trim() || REVIEW_GROUP_NAME)),
    ];
    const payload = (row.payload ?? null) as ChatReviewShareDto | null;
    const cliente = row.cliente ?? payload?.cliente ?? null;
    const detalle = [
      `Registro: ${row.recordId}`,
      cliente ? `Cliente: ${cliente}` : null,
      payload?.canales ? `Canales: ${payload.canales}` : null,
      payload?.emailTo ? `Email: ${payload.emailTo}` : null,
      payload?.whatsappTo ? `WhatsApp: ${payload.whatsappTo}` : null,
      payload?.reintento ? "Modo: REINTENTO AUTORIZADO" : null,
      `Decisión: en la conversación del grupo «${REVIEW_GROUP_NAME}» (chat interno)`,
    ]
      .filter(Boolean)
      .join("\n");
    const item: ReviewInboxAlert = {
      id: `review:${row.recordId}`,
      airtableRecordId: null,
      tipo: REVIEW_ENVIO_ALERT_TYPE,
      prioridad: "🟡 Media",
      urgencia: 1,
      urgenciaLabel: "Media",
      titulo: "SGSA | Pendiente de aprobación",
      cuerpo: cliente
        ? `Registro ${row.recordId} · ${cliente}`
        : `Registro ${row.recordId}`,
      detalle,
      linkRegistro: null,
      estado: "PENDIENTE",
      leida: true,
      fecha: row.createdAt.toISOString(),
      fechaVisto: null,
      clienteNombre: cliente,
      empleadoLeido: null,
      compartidaCon: [],
      compartidaGrupos: null,
      asignadaParaMi: true,
      asignaciones: [],
      source: "review",
      review: {
        recordId: row.recordId,
        roomId: row.roomId,
        recipients,
        deliveries: rooms.length,
      },
    };
    return item;
  });
}
