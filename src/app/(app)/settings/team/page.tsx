import { TeamClient } from "@/components/settings/team-client";
import { guardSettingsTab } from "@/server/settings/page-guard";

export const dynamic = "force-dynamic";

export default async function TeamSettingsPage() {
  await guardSettingsTab("team");
  return <TeamClient />;
}
