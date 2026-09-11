import { notFound } from "next/navigation";
import { MessengerClient } from "@/components/settings/messenger-client";
import { isChannelEnabled } from "@/server/channels/enabled";
import { guardSettingsTab } from "@/server/settings/page-guard";

export const dynamic = "force-dynamic";

export default async function MessengerSettingsPage() {
  await guardSettingsTab("owner");
  // Sin el canal encendido esta pantalla no existe en esta instancia (ADR-001).
  if (!isChannelEnabled("messenger")) notFound();
  return <MessengerClient />;
}
