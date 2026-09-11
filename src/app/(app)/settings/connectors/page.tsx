import { ConnectorsSettings } from "@/components/settings/connectors-client";
import { guardSettingsTab } from "@/server/settings/page-guard";

export const dynamic = "force-dynamic";

/** 1F — Conectores salientes (Configuración → Conectores). */
export default async function ConnectorsSettingsPage() {
  await guardSettingsTab("owner");
  return <ConnectorsSettings />;
}
