import { notFound } from "next/navigation";
import { AdsClient } from "@/components/settings/ads-client";
import { atribucionEnabled } from "@/server/attribution/flag";
import { guardSettingsTab } from "@/server/settings/page-guard";

export const dynamic = "force-dynamic";

export default async function AdsSettingsPage() {
  await guardSettingsTab("owner");
  // Sin la bandera esta pantalla no existe en esta instancia.
  if (!atribucionEnabled()) notFound();
  return <AdsClient />;
}
