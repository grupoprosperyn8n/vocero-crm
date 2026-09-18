import { and, eq, isNull, ne } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { SISTEMA_SGSA_EMAIL } from "@/lib/reviews";
import type { TeamMemberLiteDto } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 041 — Directorio del equipo para DERIVAR propuestas (como las alertas):
 * id, nombre y ficha operativa del empleado, MÁS los grupos del chat interno
 * (041b: una gestión se deriva a un empleado o a un grupo). Cualquier
 * integrante puede consultarlo; el usuario de sistema no se lista.
 */
export const GET = withAuth(async (session) => {
  const db = getDb();
  const rows = await db
    .select({
      userId: schema.member.userId,
      role: schema.member.role,
      name: schema.user.name,
      locality: schema.staffProfile.locality,
      operationalRole: schema.staffProfile.operationalRole,
    })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .leftJoin(
      schema.staffProfile,
      and(
        eq(schema.staffProfile.userId, schema.member.userId),
        eq(schema.staffProfile.organizationId, schema.member.organizationId)
      )
    )
    .where(
      scoped(
        schema.member.organizationId,
        session.organizationId,
        ne(schema.user.email, SISTEMA_SGSA_EMAIL),
        isNull(schema.member.offlineAt)
      )
    );

  const members: TeamMemberLiteDto[] = rows
    .map((r) => ({
      userId: r.userId,
      name: r.name,
      role: r.role,
      locality: r.locality,
      operationalRole: r.operationalRole,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  // Grupos del chat interno: destino alternativo de la derivación.
  const grupos = await db
    .select({ id: schema.chatRoom.id, name: schema.chatRoom.name })
    .from(schema.chatRoom)
    .where(
      scoped(
        schema.chatRoom.organizationId,
        session.organizationId,
        eq(schema.chatRoom.kind, "group")
      )
    );

  return Response.json({
    members,
    groups: grupos
      .map((g) => ({ id: g.id, name: g.name?.trim() || "Grupo" }))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
    viewer: { userId: session.userId, role: session.role },
  });
});
