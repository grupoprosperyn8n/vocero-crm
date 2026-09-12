import { randomBytes } from "node:crypto";
import { apiError } from "@/lib/api";
import { webCorsPreflight, withWebCors } from "@/lib/web-cors";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  channelDisabledResponse,
  isChannelEnabled,
} from "@/server/channels/enabled";

export const dynamic = "force-dynamic";

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/**
 * 1A — Canal Web: creación de sesión del widget.
 *
 * Público a propósito (el widget corre en el sitio del negocio, sin
 * secretos embebidos): la sesión que se entrega ES el secreto de esa
 * conversación — 32 chars aleatorios, y solo quien la posee puede leer o
 * escribir en ese hilo. Rate limit por IP: un visitante genera pocas
 * sesiones; un bot de spam, muchas.
 */
async function handlePost(req: Request) {
  if (!isChannelEnabled("web")) return channelDisabledResponse();

  const ip = clientIp(req);
  const rl = checkRateLimit(`webchat-session:${ip}`, {
    windowMs: 10 * 60 * 1000,
    max: 20,
  });
  if (!rl.allowed) {
    return apiError(429, "rate_limited", "Demasiadas sesiones; intentá más tarde");
  }

  const sessionId = randomBytes(24).toString("base64url");
  return Response.json({ sessionId });
}

/* Superficies públicas del widget: CORS abierto (ver @/lib/web-cors). */
export async function POST(req: Request): Promise<Response> {
  return withWebCors(await handlePost(req));
}

export function OPTIONS(): Response {
  return webCorsPreflight();
}
