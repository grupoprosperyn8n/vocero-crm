import { WhatsappWizard } from "@/components/settings/whatsapp-wizard";
import { guardSettingsTab } from "@/server/settings/page-guard";

export const dynamic = "force-dynamic";

export default async function WhatsappSettingsPage() {
  await guardSettingsTab("owner");
  return <WhatsappWizard />;
}
