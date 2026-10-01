import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { connectionsGate } from "@/server/settings/access";
import {
  clearCredentials,
  getCredentialsByOrg,
  saveCredentials,
  tokenLast4,
} from "@/server/whatsapp/credentials";
import { subscribeAppToWaba, testConnection } from "@/server/whatsapp/connect";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const gate = connectionsGate(session);
  if (gate) return gate;
  const creds = await getCredentialsByOrg(session.organizationId);
  if (!creds) return Response.json({ connection: null });
  return Response.json({
    connection: {
      wabaId: creds.wabaId,
      phoneNumberId: creds.phoneNumberId,
      displayPhoneNumber: creds.displayPhoneNumber,
      verifiedName: creds.verifiedName,
      status: creds.status,
      tokenLast4: tokenLast4(creds.token),
    },
  });
});

const putSchema = z.object({
  wabaId: z.string().trim().min(1),
  phoneNumberId: z.string().trim().min(1),
  token: z.string().trim().min(1),
});

/** Guarda la conexión: re-valida contra Meta, cifra y suscribe (FR-040). */
export const PUT = withAuth(async (session, req: Request) => {
  const gate = connectionsGate(session);
  if (gate) return gate;
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const check = await testConnection(body.data.phoneNumberId, body.data.token);
  if (!check.ok) {
    const status = check.code === "meta_unavailable" ? 503 : 422;
    return apiError(status, check.code, check.message);
  }

  await saveCredentials({
    organizationId: session.organizationId,
    wabaId: body.data.wabaId,
    phoneNumberId: body.data.phoneNumberId,
    token: body.data.token,
    displayPhoneNumber: check.displayPhoneNumber,
    verifiedName: check.verifiedName,
  });

  // Best-effort: necesaria en modo directo; el modo agencia usa su override.
  await subscribeAppToWaba(body.data.wabaId, body.data.token);

  return Response.json({
    ok: true,
    displayPhoneNumber: check.displayPhoneNumber,
  });
});

/**
 * 047 — Desconectar el número (Ajustes → WhatsApp): borra las credenciales de
 * la organización; el webhook deja de enrutar mensajes de ese número. Para
 * reconectar se vuelve a pasar por el asistente. No se des-suscribe la app en
 * Meta: la reconexión re-suscribe sola y sin conexión local los eventos
 * entrantes se ignoran.
 */
export const DELETE = withAuth(async (session) => {
  const gate = connectionsGate(session);
  if (gate) return gate;
  await clearCredentials(session.organizationId);
  return Response.json({ ok: true });
});
