import { redirect } from "next/navigation";
import { PipelineClient } from "@/components/pipeline/pipeline-client";
import { getSessionOrNull } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  // 021 — "Gestionar etapas" es customización: solo el propietario la ve;
  // el tablero y el arrastre de tarjetas siguen igual para todos.
  // 029 — el tablero es personal: el cliente necesita saber cuál es su id
  // para pintar solo SUS tarjetas como arrastrables.
  return <PipelineClient role={session.role} meId={session.userId} />;
}
