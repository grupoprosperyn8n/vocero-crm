import { z } from "zod";
import { apiError, parseBody } from "@/lib/api";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { channelDisabledResponse, isChannelEnabled } from "@/server/channels/enabled";
import { ingestExternalInbound } from "@/server/bot/inbound";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /**
   * Canal de origen del mensaje. El canal tiene que estar encendido en esta
   * instancia (env CHANNELS) — si no, 404, igual que cualquier superficie de
   * un canal apagado.
   */
  channel: z.enum(["whatsapp", "instagram", "messenger", "web", "telegram"]),
  /**
   * Identidad del cliente en la plataforma de origen: teléfono con país
   * (whatsapp), chat id (telegram), user id (instagram), PSID (messenger).
   * Es la llave estable que vuelve a unir al mismo cliente en la bandeja.
   */
  externalId: z.string().trim().min(1).max(200),
  /** Nombre visible del cliente (perfil de la plataforma), si se conoce. */
  profileName: z.string().trim().min(1).max(120).optional(),
  /** Texto del mensaje. */
  text: z.string().trim().min(1).max(4096),
  /**
   * Adjuntos del mensaje (canal web): base64 crudo, SIN prefijo `data:`.
   * Cada uno se guarda como un mensaje propio del tipo que le corresponde
   * (image/audio/video/document) con su archivo en disco.
   */
  attachments: z
    .array(
      z
        .object({
          fileName: z.string().trim().max(200).optional(),
          mimeType: z.string().trim().max(120).optional(),
          caption: z.string().trim().max(1024).optional(),
          dataBase64: z.string().min(8).max(12 * 1024 * 1024),
        })
        .strict()
    )
    .max(8)
    .optional(),
  /**
   * Id del mensaje en la herramienta emisora. Idempotencia dura: si se
   * reenvía el mismo eventId (reintento de un webhook), no se duplica nada.
   */
  eventId: z.string().trim().min(1).max(200).optional(),
  /** Cuándo ocurrió en el origen: epoch (s o ms) o ISO 8601. Default: ahora. */
  timestamp: z.string().trim().optional(),
  /**
   * Pedido de derivación a un humano. true = derivar (con `topic` del body
   * si viene); objeto = derivar con motivo y/o etiqueta propios.
   */
  requestHuman: z
    .union([
      z.boolean(),
      z
        .object({
          reason: z.string().trim().min(1).max(300).optional(),
          topic: z.string().trim().min(1).max(120).optional(),
        })
        .strict(),
    ])
    .optional(),
  /** Etiqueta de negocio de la consulta ("cotizacion", "siniestro", ...). */
  topic: z.string().trim().min(1).max(120).optional(),
});

/**
 * 020 — Conector webhook de entrada.
 *
 * Un solo endpoint para que cualquier herramienta externa (n8n/Sira, bots,
 * canales propios) traiga mensajes al CRM. Ver `server/bot/inbound` para el
 * contrato completo. Autenticación: la misma BOT key del resto de /api/bot/*
 * (header `x-api-key`).
 *
 * Respuesta 200:
 *   { ok, conversationId, contactId, messageId, deduplicated, attachments, handoff }
 * `conversationId` es el asa para responder por /api/bot/messages.
 */
export async function POST(req: Request) {
  const denied = requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  if (!isChannelEnabled(body.data.channel)) return channelDisabledResponse();

  let handoff: { reason?: string; topic?: string } | null = null;
  if (body.data.requestHuman === true) {
    handoff = body.data.topic ? { topic: body.data.topic } : {};
  } else if (body.data.requestHuman && typeof body.data.requestHuman === "object") {
    handoff = body.data.requestHuman;
  }

  const result = await ingestExternalInbound({
    organizationId,
    channel: body.data.channel,
    externalId: body.data.externalId,
    profileName: body.data.profileName ?? null,
    text: body.data.text,
    eventId: body.data.eventId ?? null,
    timestamp: body.data.timestamp,
    attachments: body.data.attachments ?? null,
    handoff,
  });

  return Response.json({ ok: true, ...result });
}
