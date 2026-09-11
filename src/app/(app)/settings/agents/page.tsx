import { AgentsPanel } from "@/components/settings/agents-client";
import { guardSettingsTab } from "@/server/settings/page-guard";

export const dynamic = "force-dynamic";

/**
 * 019b — Agentes (Ajustes → Agentes).
 * La UI web detecta los agentes CLI de la máquina donde se abrió el navegador,
 * vía el companion local (scripts/companion.py). Enmienda 1: Agent-First.
 */
export default async function AgentsSettingsPage() {
  await guardSettingsTab("owner");
  return <AgentsPanel />;
}
