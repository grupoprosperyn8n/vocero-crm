import { notFound } from "next/navigation";
import { AgendaClient } from "@/components/settings/agenda-client";
import { agendaEnabled } from "@/server/agenda/flag";
import { guardSettingsTab } from "@/server/settings/page-guard";

export const dynamic = "force-dynamic";

export default async function AgendaSettingsPage() {
  await guardSettingsTab("owner");
  // Sin la bandera esta pantalla no existe en esta instancia.
  if (!agendaEnabled()) notFound();
  return <AgendaClient />;
}
