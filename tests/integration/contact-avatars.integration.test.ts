import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * 035 — Foto del contacto según su conversación.
 *
 *   - Telegram: al contacto le toca la URL del proxy de su foto real
 *     (`/api/avatars/tg:<chat id>`); si el perfil no tiene foto o su
 *     privacidad no la expone, el proxy responde 404 y la UI cae a iniciales.
 *   - WhatsApp: sin foto del cliente del sistema (acá no hay Airtable), el
 *     contacto NO recibe URL: nunca se inventa una cara.
 *
 * Corre solo con INTEGRATION_DATABASE_URL (igual que el resto de la suite):
 *   INTEGRATION_DATABASE_URL=postgres://postgres:PASS@127.0.0.1:55432/vocero \
 *   pnpm exec vitest run tests/integration/contact-avatars.integration.test.ts
 */
const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite("035 — foto de perfil del contacto (según conversación)", () => {
  let sql: import("postgres").Sql;
  let queries: typeof import("@/server/inbox/queries");
  let avatars: typeof import("@/server/avatars");

  const tag = Math.random().toString(36).slice(2, 8);
  const cids = { tg: `e2e035_${tag}_ctg`, wa: `e2e035_${tag}_cwa` };
  const conv = { tg: `e2e035_${tag}_cvtg`, wa: `e2e035_${tag}_cvwa` };
  const WA_PHONE = `549${Date.now().toString().slice(-8)}`;
  const TG_CHAT_ID = `9${Date.now().toString().slice(-9)}`;
  let orgId = "";
  let ownerId = "";

  beforeAll(async () => {
    // Las envs se fijan ANTES de importar los módulos (getEnv es lazy).
    process.env.DATABASE_URL = DB_URL!;
    process.env.APP_BASE_URL =
      process.env.APP_BASE_URL ?? "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET =
      process.env.BETTER_AUTH_SECRET ?? "integration-test-secret-1234567890";
    process.env.ENCRYPTION_KEY =
      process.env.ENCRYPTION_KEY ?? Buffer.alloc(32).toString("base64");
    process.env.META_WEBHOOK_VERIFY_TOKEN =
      process.env.META_WEBHOOK_VERIFY_TOKEN ?? "integration-test-token";
    // Sin PAT de Airtable el índice de clientes queda vacío y determinístico.
    delete process.env.SGSA_AIRTABLE_PAT;

    queries = await import("@/server/inbox/queries");
    avatars = await import("@/server/avatars");
    const postgres = (await import("postgres")).default;
    sql = postgres(DB_URL!, { max: 4, onnotice: () => {} });

    const orgRows = await sql<{ id: string }[]>`
      SELECT id FROM organization ORDER BY created_at LIMIT 1`;
    orgId = orgRows[0]!.id;
    const ownerRows = await sql<{ user_id: string }[]>`
      SELECT user_id FROM member
      WHERE organization_id = ${orgId} AND role = 'owner' LIMIT 1`;
    ownerId = ownerRows[0]!.user_id;

    await sql`INSERT INTO contact (id, organization_id, channel, wa_identity, name, name_source, is_test)
      VALUES (${cids.tg}, ${orgId}, 'telegram', ${`tg:${TG_CHAT_ID}`}, ${`E2E TG ${tag}`}, 'manual', false)`;
    await sql`INSERT INTO contact (id, organization_id, channel, wa_identity, name, name_source, is_test)
      VALUES (${cids.wa}, ${orgId}, 'whatsapp', ${WA_PHONE}, ${`E2E WA ${tag}`}, 'manual', false)`;
    await sql`INSERT INTO conversation (id, organization_id, contact_id, is_test, channel, last_message_at)
      VALUES (${conv.tg}, ${orgId}, ${cids.tg}, false, 'telegram', now())`;
    await sql`INSERT INTO conversation (id, organization_id, contact_id, is_test, channel, last_message_at)
      VALUES (${conv.wa}, ${orgId}, ${cids.wa}, false, 'whatsapp', now())`;
  });

  afterAll(async () => {
    if (!sql) return;
    // Limpieza EXACTA de lo sintético de esta corrida.
    await sql`DELETE FROM conversation WHERE id IN (${conv.tg}, ${conv.wa})`;
    await sql`DELETE FROM contact WHERE id IN (${cids.tg}, ${cids.wa})`;
    await sql.end({ timeout: 5 });
  });

  it("la bandeja le da al contacto de Telegram la URL de su foto real y al de WhatsApp sin cliente ninguna", async () => {
    const dtos = await queries.listConversations(orgId, undefined, "open", {
      userId: ownerId,
      role: "owner",
    });
    const tg = dtos.find((d) => d.id === conv.tg);
    const wa = dtos.find((d) => d.id === conv.wa);
    expect(tg?.contactAvatarUrl).toBe(`/api/avatars/tg:${TG_CHAT_ID}`);
    expect(wa?.contactAvatarUrl).toBeNull();
    // La clave viaja siempre en el DTO (la UI cae a iniciales con null).
    expect(tg && "contactAvatarUrl" in tg).toBe(true);
  });

  it("sin PAT de Airtable solo Telegram genera URL: no se inventan fotos", async () => {
    const map = await avatars.avatarUrlsForContacts([
      {
        id: "c1",
        channel: "telegram",
        waIdentity: `tg:${TG_CHAT_ID}`,
        phone: null,
      },
      { id: "c2", channel: "whatsapp", waIdentity: WA_PHONE, phone: WA_PHONE },
      { id: "c3", channel: "web", waIdentity: `sess_${tag}`, phone: null },
    ]);
    expect(map.get("c1")).toBe(`/api/avatars/tg:${TG_CHAT_ID}`);
    expect(map.has("c2")).toBe(false);
    expect(map.has("c3")).toBe(false);
  });
});
