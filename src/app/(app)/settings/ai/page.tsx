import { IaInstaller } from "@/components/settings/ia-client";
import { guardSettingsTab } from "@/server/settings/page-guard";

export const dynamic = "force-dynamic";

/** 019 — Instalador de IA (Ajustes → IA). */
export default async function AiSettingsPage() {
  await guardSettingsTab("owner");
  return <IaInstaller />;
}
