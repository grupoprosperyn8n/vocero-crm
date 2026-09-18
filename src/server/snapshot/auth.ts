import { timingSafeEqual } from "node:crypto";

import { apiError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * 040 — Autenticación del snapshot del CRM (`/api/snapshot`).
 *
 * Solo lectura: lo consume el cockpit (rafael-intelligence) para cruzar la
 * actividad de WhatsApp contra la cartera. Header `x-api-key` contra
 * `SNAPSHOT_API_KEY` (clave propia, revocable sin tocar al bot); de respaldo
 * acepta `BOT_API_KEY` para que el cockpit siga funcionando si la clave
 * nueva todavía no está configurada. Sin claves válidas, 401.
 */
export function requireSnapshotKey(req: Request): Response | null {
  const rl = checkRateLimit("snapshot-api", { windowMs: 60_000, max: 60 });
  if (!rl.allowed) return apiError(429, "rate_limited", "Demasiadas solicitudes");

  const provided = req.headers.get("x-api-key");
  const candidates = [process.env.SNAPSHOT_API_KEY, process.env.BOT_API_KEY].filter(
    (value): value is string => Boolean(value && value.length >= 16)
  );

  if (!provided || candidates.length === 0) {
    return apiError(401, "unauthorized", "No autorizado");
  }

  const a = Buffer.from(provided);
  const ok = candidates.some((expected) => {
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });

  return ok ? null : apiError(401, "unauthorized", "No autorizado");
}

/**
 * Envuelve un route handler del snapshot: valida la clave de servicio y
 * captura errores no controlados (500 sin stack).
 */
export function withSnapshotKey<Args extends unknown[]>(
  handler: (req: Request, ...rest: Args) => Promise<Response>
): (req: Request, ...rest: Args) => Promise<Response> {
  return async (req, ...rest) => {
    const denied = requireSnapshotKey(req);
    if (denied) return denied;
    try {
      return await handler(req, ...rest);
    } catch (err) {
      console.error("[api/snapshot] error no controlado:", err);
      return apiError(500, "internal", "Error interno");
    }
  };
}
