import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";

/**
 * 021 — Guardas de las pantallas de Ajustes: la customización es del
 * propietario; el área de Equipo la ven propietario y administrador; los
 * miembros no entran a Ajustes. El rebote lleva a cada rol donde SÍ puede
 * estar, nunca a una pantalla muerta.
 */
export async function guardSettingsTab(kind: "owner" | "team"): Promise<void> {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (kind === "owner" && session.role !== "owner") {
    redirect(session.role === "admin" ? "/settings/team" : "/inbox");
  }
  if (kind === "team" && session.role === "member") {
    redirect("/inbox");
  }
}
