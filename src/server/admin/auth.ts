import { timingSafeEqual } from "node:crypto";
import { apiError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * Autenticación de la API de servicio `/api/admin/*` (018: sync del sistema).
 *
 * No la consume el navegador: la consume un proceso externo de confianza (n8n,
 * en la automatización de la tabla LOGIN de Airtable) que sincroniza el equipo
 * (altas, cambios de rol, bajas) contra la organización de la instancia.
 * Header `X-Admin-Key` contra `ADMIN_API_KEY` (env), comparación en tiempo
 * constante — mismo patrón que la superficie `/api/bot/*` (BOT_API_KEY), pero
 * con clave propia para poder revocar el sync sin tocar al bot.
 * Sin `ADMIN_API_KEY` configurada, toda la superficie responde 401.
 */
export function requireAdminKey(req: Request): Response | null {
  const rl = checkRateLimit("admin-api", { windowMs: 60_000, max: 120 });
  if (!rl.allowed) return apiError(429, "rate_limited", "Demasiadas solicitudes");

  const expected = process.env.ADMIN_API_KEY;
  const provided = req.headers.get("x-admin-key");
  if (!expected || expected.length < 16 || !provided) {
    return apiError(401, "unauthorized", "No autorizado");
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return apiError(401, "unauthorized", "No autorizado");
  }
  return null;
}

/**
 * Envuelve un route handler de la superficie admin: valida la clave de
 * servicio, captura errores no controlados (500 sin stack) y deja pasar
 * Response. El primer argumento debe ser el Request (para leer la clave).
 */
export function withAdminKey<Args extends unknown[]>(
  handler: (req: Request, ...rest: Args) => Promise<Response>
): (req: Request, ...rest: Args) => Promise<Response> {
  return async (req, ...rest) => {
    const denied = requireAdminKey(req);
    if (denied) return denied;
    try {
      return await handler(req, ...rest);
    } catch (err) {
      console.error("[api/admin] error no controlado:", err);
      return apiError(500, "internal", "Error interno");
    }
  };
}
