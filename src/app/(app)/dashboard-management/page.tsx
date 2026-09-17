import { notFound, redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { dashboardManagementUrl } from "@/server/dashboard-management/flag";
import { DashboardManagementFrame } from "@/components/dashboard-management/frame";

export const dynamic = "force-dynamic";

/**
 * 038 — Dashboard Management: el cockpit ejecutivo embebido, tal cual es.
 *
 * Dueño y propietarios (owner/admin). El miembro va a la Bandeja: misma regla
 * que «Agente» (021), validada en el servidor — ocultar el ítem del menú no
 * alcanza. En instancias con la sección apagada, la ruta no existe (404).
 */
export default async function DashboardManagementPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (session.role === "member") redirect("/inbox");
  const url = dashboardManagementUrl();
  if (!url) notFound();
  return <DashboardManagementFrame url={url} />;
}
