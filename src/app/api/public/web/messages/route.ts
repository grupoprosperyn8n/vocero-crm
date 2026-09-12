import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { webCorsPreflight, withWebCors } from "@/lib/web-cors";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  channelDisabledResponse,
  isChannelEnabled,
} from "@/server/channels/enabled";
import {
  ingestWebMessage,
  requireWebOrg,
  validWebSession,
  webMessages,
} from "@/server/inbox/web";

export const dynamic = "force-dynamic";

const MAX_TEXT_BYTES = 4000;
const MAX_NAME = 80;
const CLIENT_MSG_RE = /^[A-Za-z0-9_-]{1,64}$/;

const postSchema = z.object({
  sessionId: z.string(),
  text: z.string(),
  /** Id del mensaje generado por el widget: el reenvío no duplica. */
  clientMessageId: z.string().optional(),
  /** Nombre que escribió el visitante, si el widget lo pidió. */
  profileName: z.string().optional(),
});

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** Valida el body y devuelve el error 422 tipado si algo no cierra. */
function validatePost(data: z.infer<typeof postSchema>): string | null {
  if (!validWebSession(data.sessionId)) return "Sesión inválida";
  const text = data.text.trim();
  if (text.length < 1) return "El mensaje está vacío";
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
    return "El mensaje es demasiado largo";
  }
  if (data.clientMessageId && !CLIENT_MSG_RE.test(data.clientMessageId)) {
    return "Id de mensaje inválido";
  }
  if (data.profileName && data.profileName.trim().length > MAX_NAME) {
    return "El nombre es demasiado largo";
  }
  return null;
}

/**
 * 1A — Canal Web: entrada de mensajes del widget.
 *
 * POST: el visitante escribe (identidad = sesión opaca). El mensaje entra
 * por la ingesta común del inbox: dedup por clientMessageId, unread, evento
 * SSE para la bandeja y disparo del agente si la IA está encendida.
 *
 * GET: polling del widget — mensajes nuevos desde `after` (ISO del último
 * que ya mostró) más el estado de la conversación (handoffAt/topic), para
 * que el chat.js sepa cuándo el hilo pasó a un humano.
 */
async function handlePost(req: Request) {
  if (!isChannelEnabled("web")) return channelDisabledResponse();

  const ip = clientIp(req);
  const body = await parseBody(req, postSchema);
  if (!body.ok) return body.response;

  const invalid = validatePost(body.data);
  if (invalid) return apiError(422, "invalid_body", invalid);

  // Por IP (flood) y por sesión (un widget enfermo no tapa a los demás).
  const rlIp = checkRateLimit(`webchat-in:${ip}`, {
    windowMs: 60_000,
    max: 120,
  });
  if (!rlIp.allowed) {
    return apiError(429, "rate_limited", "Demasiados mensajes; esperá un momento");
  }
  const rlSession = checkRateLimit(`webchat-in:${body.data.sessionId}`, {
    windowMs: 60_000,
    max: 60,
  });
  if (!rlSession.allowed) {
    return apiError(429, "rate_limited", "Demasiados mensajes; esperá un momento");
  }

  let organizationId: string;
  try {
    organizationId = await requireWebOrg();
  } catch {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  await ingestWebMessage({
    organizationId,
    sessionId: body.data.sessionId,
    text: body.data.text.trim(),
    clientMessageId: body.data.clientMessageId ?? null,
    profileName: body.data.profileName ?? null,
  });

  return Response.json({ ok: true });
}

async function handleGet(req: Request) {
  if (!isChannelEnabled("web")) return channelDisabledResponse();

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session") ?? "";
  if (!validWebSession(sessionId)) {
    return apiError(422, "invalid_session", "Sesión inválida");
  }
  const after = url.searchParams.get("after");
  if (after && Number.isNaN(Date.parse(after))) {
    return apiError(422, "invalid_after", "after debe ser un ISO 8601");
  }

  const rl = checkRateLimit(`webchat-out:${sessionId}`, {
    windowMs: 60_000,
    max: 180,
  });
  if (!rl.allowed) {
    return apiError(429, "rate_limited", "Demasiadas consultas; esperá un momento");
  }

  let organizationId: string;
  try {
    organizationId = await requireWebOrg();
  } catch {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const result = await webMessages(organizationId, sessionId, after);
  return Response.json(result);
}

/* Superficies públicas del widget: CORS abierto (ver @/lib/web-cors). */
export async function POST(req: Request): Promise<Response> {
  return withWebCors(await handlePost(req));
}

export async function GET(req: Request): Promise<Response> {
  return withWebCors(await handleGet(req));
}

export function OPTIONS(): Response {
  return webCorsPreflight();
}
