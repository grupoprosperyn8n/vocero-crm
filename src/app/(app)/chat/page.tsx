import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { InternalChat } from "@/components/internal-chat";

export const dynamic = "force-dynamic";

/** 022 — Chat interno del equipo (todos los roles). */
export default async function ChatInternoPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  return <InternalChat meId={session.userId} role={session.role} />;
}
