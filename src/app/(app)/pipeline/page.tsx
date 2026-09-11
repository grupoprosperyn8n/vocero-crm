import { redirect } from "next/navigation";
import { PipelineClient } from "@/components/pipeline/pipeline-client";
import { getSessionOrNull } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  // 021 — "Gestionar etapas" es customización: solo el propietario la ve;
  // el tablero y el arrastre de tarjetas siguen igual para todos.
  return <PipelineClient role={session.role} />;
}
