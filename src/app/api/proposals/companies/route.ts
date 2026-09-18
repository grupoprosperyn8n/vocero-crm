import { withAuth } from "@/lib/api";
import { airtableList, isSgsaConfigured } from "@/server/clients/sgsa";

export const dynamic = "force-dynamic";

type CompanyLite = { id: string; name: string };

let cache: { at: number; companies: CompanyLite[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

/**
 * 041 — Compañías de seguros del sistema (para elegir la «auspiciada» de una
 * propuesta). Solo lectura contra Airtable; cache en memoria de 10 minutos.
 */
export const GET = withAuth(async () => {
  if (!isSgsaConfigured()) return Response.json({ companies: [] });
  if (cache && Date.now() - cache.at < TTL_MS) {
    return Response.json({ companies: cache.companies });
  }
  const params = new URLSearchParams();
  params.set("pageSize", "100");
  params.append("fields[]", "NOMBRE");
  const recs = await airtableList("COMPANIA", params).catch(() => []);
  const companies: CompanyLite[] = recs
    .map((r) => ({
      id: r.id,
      name: typeof r.fields["NOMBRE"] === "string" ? (r.fields["NOMBRE"] as string).trim() : "",
    }))
    .filter((c) => c.name)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  cache = { at: Date.now(), companies };
  return Response.json({ companies });
});
