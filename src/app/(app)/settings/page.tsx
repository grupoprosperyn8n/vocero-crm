import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";

/**
 * 021 — La raíz de Ajustes manda a cada rol donde SÍ puede estar:
 * propietario → WhatsApp (su primera pestaña), administrador → Equipo,
 * miembro → Bandeja.
 */
export default async function SettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (session.role === "owner") redirect("/settings/whatsapp");
  if (session.role === "admin") redirect("/settings/team");
  redirect("/inbox");
}
