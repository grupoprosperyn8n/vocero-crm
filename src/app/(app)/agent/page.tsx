import { redirect } from "next/navigation";
import { AgentClient } from "@/components/agent/agent-client";
import { getSessionOrNull } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * 021 — Perfil + conocimiento del bot = customización del CRM: solo el
 * propietario. El resto (incluido el administrador) va a la Bandeja.
 */
export default async function AgentPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/inbox");
  return <AgentClient />;
}
