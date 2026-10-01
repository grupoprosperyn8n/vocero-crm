import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";

/**
 * 021 — Guardas de las pantallas de Ajustes: la customización es del
 * propietario; el área de Equipo y la operación las ven propietario y
 * administrador; ni los gerentes ni los miembros entran a Ajustes (30Sep:
 * alineado con SettingsNav, que para el gerente no muestra ninguna pestaña).
 * El rebote lleva a cada rol donde SÍ puede estar, nunca a una pantalla
 * muerta.
 */
export async function guardSettingsTab(kind: "owner" | "team"): Promise<void> {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (kind === "owner" && session.role !== "owner") {
    redirect(session.role === "admin" ? "/settings/team" : "/inbox");
  }
  // 30Sep — Equipo y operación: propietario y administrador; el gerente no
  // tiene pestañas en Ajustes y la página le quedaba a medias (render 200 con
  // las APIs en 403). Se lo rebota igual que al miembro.
  if (kind === "team" && session.role !== "owner" && session.role !== "admin") {
    redirect("/inbox");
  }
}
