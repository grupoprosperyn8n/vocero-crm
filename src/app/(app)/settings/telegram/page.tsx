import { notFound } from "next/navigation";
import { TelegramClient } from "@/components/settings/telegram-client";
import { isChannelEnabled } from "@/server/channels/enabled";
import { guardSettingsTab } from "@/server/settings/page-guard";

export const dynamic = "force-dynamic";

export default async function TelegramSettingsPage() {
  await guardSettingsTab("owner");
  // Sin el canal encendido esta pantalla no existe en esta instancia (ADR-001).
  if (!isChannelEnabled("telegram")) notFound();
  return <TelegramClient />;
}
