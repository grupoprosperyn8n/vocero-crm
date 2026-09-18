import { and, eq, isNull, ne } from "drizzle-orm";
import { withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { SISTEMA_SGSA_EMAIL } from "@/lib/reviews";
import type { TeamMemberLiteDto } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * 041 — Directorio del equipo para DERIVAR propuestas (como las alertas):
 * id, nombre y ficha operativa del empleado. Cualquier integrante puede
 * consultarlo; el usuario de sistema no se lista.
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

  return Response.json({ members });
});
