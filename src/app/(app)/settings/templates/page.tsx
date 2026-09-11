import { TemplatesClient } from "@/components/settings/templates-client";
import { guardSettingsTab } from "@/server/settings/page-guard";

export const dynamic = "force-dynamic";

export default async function TemplatesSettingsPage() {
  await guardSettingsTab("team");
  return <TemplatesClient />;
}
