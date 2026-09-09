import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { publish } from "@/server/events/bus";
import { onlineUserIds } from "@/server/events/presence";
import { routerEnabled } from "@/server/router/flag";

/**
 * 019 — Asignación de un handoff al empleado online de menor carga.
 *
 * Reglas (1D, presencia SSE):
 *  - Sin `ROUTER_ASSIGN`, no hace nada (`skipped`): la derivación queda en la
 *    bandeja como siempre, sin dueño.
 *  - Candidatos: miembros de la organización con una conexión SSE viva
 *    (bandeja abierta). Pestaña abierta es la definición de "online" que
 *    eligió el producto; atender en otra pestaña no cambia la presencia.
 *  - Carga de un candidato: conversaciones derivadas (handoff sin retomar)
 *    que tiene asignadas. "En curso" es handoff_at no nulo: cuando el humano
 *    retoma la IA (reset/reactivate), la conversación deja de pesar.
 *  - Menor carga; empate resuelto alfabético (determinístico, sin sesgo).
 *  - Nadie online: no asigna — queda en la bandeja (visible para todos, como
 *    hoy) y el primero que la abra la atiende.
 *
 * Corre SIEMPRE después del commit del handoff, y publica su propio
 * `conversation.updated` para que la bandeja pinte la asignación en vivo.
 */

export type AssignmentResult = {
  /** Id del empleado elegido, o null si no se asignó a nadie. */
  assignedToId: string | null;
  /** true = el router está apagado en esta instancia (no es un fallo). */
  skipped: boolean;
};

export async function assignConversation(
  organizationId: string,
  conversationId: string
): Promise<AssignmentResult> {
  if (!routerEnabled()) return { assignedToId: null, skipped: true };

  const db = getDb();
  const online = onlineUserIds(organizationId);
  if (online.length === 0) return { assignedToId: null, skipped: false };

  // Candidatos = miembros de esta organización que están online ahora.
  const members = await db
    .select({ userId: schema.member.userId })
    .from(schema.member)
    .where(
      and(
        eq(schema.member.organizationId, organizationId),
        inArray(schema.member.userId, online)
      )
    );
  if (members.length === 0) return { assignedToId: null, skipped: false };

  const candidateIds = members.map((m) => m.userId);

  // Carga por candidato: cuántas derivadas sin retomar tiene asignadas.
  const loads = await db
    .select({
      assigneeId: schema.conversation.assigneeId,
      count: sql<number>`count(*)`,
    })
    .from(schema.conversation)
    .where(
      and(
        inArray(schema.conversation.assigneeId, candidateIds),
        isNotNull(schema.conversation.handoffAt)
      )
    )
    .groupBy(schema.conversation.assigneeId);
  const loadByUser = new Map<string, number>(
    loads.map((r) => [r.assigneeId ?? "", Number(r.count)])
  );

  // Menor carga; empate -> userId menor (orden estable entre corridas).
  candidateIds.sort(
    (a, b) => (loadByUser.get(a) ?? 0) - (loadByUser.get(b) ?? 0) || a.localeCompare(b)
  );
  // members.length > 0 garantizado por el early return de arriba.
  const chosen = candidateIds[0]!;

  await db
    .update(schema.conversation)
    .set({
      assigneeId: chosen,
      assignedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.conversation.organizationId, organizationId),
        eq(schema.conversation.id, conversationId)
      )
    );

  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conversationId, assigneeId: chosen } },
  });

  return { assignedToId: chosen, skipped: false };
}
