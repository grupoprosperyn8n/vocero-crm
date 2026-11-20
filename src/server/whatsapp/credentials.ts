import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";

export type Credentials = {
  id: string;
  organizationId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  status: "connected" | "reconnect_required";
  /** 050 — cómo se dio de alta: manual (formulario) o coexistencia (Embedded Signup). */
  mode: "manual" | "coexistence";
  /** 050 — primer evento real recibido; null = vinculada sin tráfico probado. */
  operationalAt: Date | null;
  token: string;
};

type Row = typeof schema.metaCredentials.$inferSelect;

function toCredentials(row: Row): Credentials {
  return {
    id: row.id,
    organizationId: row.organizationId,
    wabaId: row.wabaId,
    phoneNumberId: row.phoneNumberId,
    displayPhoneNumber: row.displayPhoneNumber,
    verifiedName: row.verifiedName,
    status: row.status,
    mode: row.mode,
    operationalAt: row.operationalAt ?? null,
    token: decryptSecret({
      cipher: row.tokenCipher,
      iv: row.tokenIv,
      tag: row.tokenTag,
    }),
  };
}

/** Resuelve la conexión por phone_number_id (enrutamiento del webhook). */
export async function getCredentialsByPhoneNumberId(
  phoneNumberId: string
): Promise<Credentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(eq(schema.metaCredentials.phoneNumberId, phoneNumberId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

/** Resuelve la conexión por WABA ID (eventos a nivel WABA, ej. plantillas). */
export async function getCredentialsByWabaId(
  wabaId: string
): Promise<Credentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(eq(schema.metaCredentials.wabaId, wabaId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

export async function getCredentialsByOrg(
  organizationId: string
): Promise<Credentials | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.metaCredentials)
    .where(scoped(schema.metaCredentials.organizationId, organizationId))
    .limit(1);
  return rows[0] ? toCredentials(rows[0]) : null;
}

export async function saveCredentials(input: {
  organizationId: string;
  wabaId: string;
  phoneNumberId: string;
  token: string;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  /** 050 — `coexistence` cuando el número sigue activo en la app del celular. */
  mode?: "manual" | "coexistence";
}): Promise<void> {
  const db = getDb();
  const enc = encryptSecret(input.token);
  const mode = input.mode ?? "manual";
  await db
    .insert(schema.metaCredentials)
    .values({
      id: newId("credentials"),
      organizationId: input.organizationId,
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      displayPhoneNumber: input.displayPhoneNumber ?? null,
      verifiedName: input.verifiedName ?? null,
      tokenCipher: enc.cipher,
      tokenIv: enc.iv,
      tokenTag: enc.tag,
      status: "connected",
      mode,
    })
    .onConflictDoUpdate({
      target: [schema.metaCredentials.organizationId],
      set: {
        wabaId: input.wabaId,
        phoneNumberId: input.phoneNumberId,
        displayPhoneNumber: input.displayPhoneNumber ?? null,
        verifiedName: input.verifiedName ?? null,
        tokenCipher: enc.cipher,
        tokenIv: enc.iv,
        tokenTag: enc.tag,
        status: "connected",
        mode,
        /**
         * 050 — `operationalAt` sobrevive a una reconexión del MISMO número
         * (ya probó tráfico); con un número distinto arranca en null porque
         * esa conexión todavía no recibió nada.
         */
        operationalAt: sql`case when ${schema.metaCredentials.phoneNumberId} = ${input.phoneNumberId} then ${schema.metaCredentials.operationalAt} else null end`,
        updatedAt: new Date(),
      },
    });
}

/**
 * 050 — Marca la conexión como operativa la primera vez que llega un evento
 * real (mensaje entrante o echo del celular). Idempotente: no reescribe la
 * fecha original.
 */
export async function markOperational(organizationId: string): Promise<void> {
  await getDb()
    .update(schema.metaCredentials)
    .set({ operationalAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        scoped(schema.metaCredentials.organizationId, organizationId),
        isNull(schema.metaCredentials.operationalAt)
      )
    );
}

/** Marca la conexión como vencida (token inválido detectado en runtime). */
export async function markReconnectRequired(
  organizationId: string
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.metaCredentials)
    .set({ status: "reconnect_required", updatedAt: new Date() })
    .where(scoped(schema.metaCredentials.organizationId, organizationId));
}

/**
 * Desconexión (Ajustes → WhatsApp → Desconectar): borra las credenciales de la
 * organización. Los mensajes entrantes de ese número dejan de enrutarse (el
 * webhook resuelve la conexión por phone_number_id). Reconectar vuelve a
 * pasar por el asistente.
 */
export async function clearCredentials(organizationId: string): Promise<void> {
  await getDb()
    .delete(schema.metaCredentials)
    .where(scoped(schema.metaCredentials.organizationId, organizationId));
}

/** Últimos 4 caracteres del token para mostrar en UI (jamás el token). */
export function tokenLast4(token: string): string {
  return token.slice(-4);
}
