import { ProposalsSettings } from "@/components/settings/proposals-client";
import { guardSettingsTab } from "@/server/settings/page-guard";

export const dynamic = "force-dynamic";

/** 041 — Ajustes → Propuestas comerciales (plantillas por tipo de sugerencia). */
export default async function ProposalsSettingsPage() {
  await guardSettingsTab("team");
  return <ProposalsSettings />;
}
