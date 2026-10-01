import { redirect } from "next/navigation";
import { LabClient } from "@/components/lab/lab-client";
import { getSessionOrNull } from "@/lib/auth/session";
import { canUseLab } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * 30Sep — Laboratorio: solo propietario y administrador (pedido Diego:
 * «laboratorio es solo para propietario y administrador nada más»). El
 * gerente y el miembro rebotan a la Bandeja, misma regla que Dashboard
 * Management.
 */
export default async function LabPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!canUseLab(session.role)) redirect("/inbox");
  return <LabClient />;
}
