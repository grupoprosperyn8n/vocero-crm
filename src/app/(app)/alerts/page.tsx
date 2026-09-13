import { notFound } from "next/navigation";
import { alertsConfigured } from "@/server/alerts/service";
import { AlertsClient } from "@/components/alerts/alerts-client";

export const dynamic = "force-dynamic";

/**
 * 027 — Alertas del sistema de seguros (misma cola que la PWA).
 * En instancias sin backend configurado el módulo no existe: misma regla que
 * la agenda (015).
 */
export default function AlertsPage() {
  if (!alertsConfigured()) notFound();
  return <AlertsClient />;
}
