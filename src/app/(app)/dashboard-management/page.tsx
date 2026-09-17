import { notFound, redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { dashboardManagementUrl } from "@/server/dashboard-management/flag";
import { ExecDashboard } from "@/components/dashboard-management/exec-dashboard";

export const dynamic = "force-dynamic";

/**
 * 038b — Dashboard Management: el cockpit ejecutivo como parte nativa del CRM.
 *
 * Mismos módulos, números, filtros, listas y motor de IA que el tablero
 * original, reconstruidos con el sistema de diseño de Vocero. Los datos
 * llegan por el proxy del servidor (`/api/dashboard-management/*`).
 *
 * Dueño y propietarios (owner/admin). El miembro va a la Bandeja: misma regla
 * que «Agente» (021), validada en el servidor. En instancias con la sección
 * apagada, la ruta no existe (404).
 */
export default async function DashboardManagementPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (session.role === "member") redirect("/inbox");
  const url = dashboardManagementUrl();
  if (!url) notFound();
  return <ExecDashboard />;
}
