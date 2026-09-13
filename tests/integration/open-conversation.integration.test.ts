import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integración REAL de "Nueva conversación" contra una copia local de
 * producción (mismo patrón que clients-link: se salta salvo que
 * INTEGRATION_DATABASE_URL apunte a la copia descartable del puerto 55432).
 *
 * Todo lo que crea es sintético y se borra al final (contactos + conversación
 * propios del test). Nada toca datos reales.
 */

const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

type OpenModule = typeof import("@/server/conversations/open");

suite("nueva conversación — integración con copia de la BD real", () => {
  let open: OpenModule;
  let sql: import("postgres").Sql;

  let orgId: string;
  const stamp = String(Date.now()).slice(-7);
  let waContactId: string | null = null;
  let waConversationId: string | null = null;
  let tgContactId: string | null = null;
  let tgConversationId: string | null = null;

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

    open = await import("@/server/conversations/open");
    const postgres = (await import("postgres")).default;
    sql = postgres(DB_URL!, { max: 4, onnotice: () => {} });

    const orgRows = await sql<{ id: string }[]>`
      SELECT id FROM organization ORDER BY created_at LIMIT 1`;
    orgId = orgRows[0]!.id;
  });

  afterAll(async () => {
    if (waConversationId) {
      await sql`DELETE FROM conversation WHERE id = ${waConversationId}`;
    }
    if (tgConversationId) {
      await sql`DELETE FROM conversation WHERE id = ${tgConversationId}`;
    }
    if (waContactId) {
      await sql`DELETE FROM contact WHERE id = ${waContactId}`;
    }
    if (tgContactId) {
      await sql`DELETE FROM contact WHERE id = ${tgContactId}`;
    }
    await sql.end({ timeout: 5 });
  });

  it("crea el hilo cuando el contacto todavía no tiene conversación (WhatsApp)", async () => {
    const phone = `54934155${stamp}`;
    const rows = await sql<{ id: string }[]>`
      INSERT INTO contact (id, organization_id, channel, wa_identity, phone, name, name_source)
      VALUES (${`cntNC${stamp}`}, ${orgId}, 'whatsapp', ${phone}, ${phone}, ${"Contacto Nueva Conversación"}, 'manual')
      RETURNING id`;
    waContactId = rows[0]!.id;

    const r = await open.openConversationForContact({
      organizationId: orgId,
      contactId: waContactId,
      channel: "whatsapp",
    });
    waConversationId = r.conversationId;
    expect(r.created).toBe(true);
    expect(r.reopened).toBe(false);
    expect(r.channel).toBe("whatsapp");

    const conv = await sql<
      { channel: string; closed_at: Date | null; is_test: boolean }[]
    >`
      SELECT channel, closed_at, is_test FROM conversation WHERE id = ${waConversationId}`;
    expect(conv[0]!.channel).toBe("whatsapp");
    expect(conv[0]!.closed_at).toBeNull();
    expect(conv[0]!.is_test).toBe(false);
  });

  it("segunda apertura: mismo hilo, sin duplicar", async () => {
    const r = await open.openConversationForContact({
      organizationId: orgId,
      contactId: waContactId!,
    });
    expect(r.conversationId).toBe(waConversationId);
    expect(r.created).toBe(false);
    expect(r.reopened).toBe(false);

    const count = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM conversation
      WHERE contact_id = ${waContactId} AND is_test = false`;
    expect(count[0]!.n).toBe(1);
  });

  it("si la conversación estaba cerrada, la reabre", async () => {
    await sql`
      UPDATE conversation SET closed_at = now(), closure_status = 'summarized'
      WHERE id = ${waConversationId}`;
    const r = await open.openConversationForContact({
      organizationId: orgId,
      contactId: waContactId!,
      channel: "whatsapp",
    });
    expect(r.conversationId).toBe(waConversationId);
    expect(r.reopened).toBe(true);
    const rows = await sql<{ closed_at: Date | null }[]>`
      SELECT closed_at FROM conversation WHERE id = ${waConversationId}`;
    expect(rows[0]!.closed_at).toBeNull();
  });

  it("plataforma que el contacto no tiene: error claro, sin abrir nada", async () => {
    await expect(
      open.openConversationForContact({
        organizationId: orgId,
        contactId: waContactId!,
        channel: "telegram",
      })
    ).rejects.toMatchObject({ code: "channel_mismatch" });
  });

  it("contacto de Telegram: abre su hilo con la plataforma elegida", async () => {
    const tgIdentity = `tg:999${stamp}`;
    const rows = await sql<{ id: string }[]>`
      INSERT INTO contact (id, organization_id, channel, wa_identity, name, name_source)
      VALUES (${`cntNCT${stamp}`}, ${orgId}, 'telegram', ${tgIdentity}, ${"Contacto TG Nueva Conversación"}, 'perfil')
      RETURNING id`;
    tgContactId = rows[0]!.id;

    const r = await open.openConversationForContact({
      organizationId: orgId,
      contactId: tgContactId,
      channel: "telegram",
    });
    tgConversationId = r.conversationId;
    expect(r.created).toBe(true);
    expect(r.channel).toBe("telegram");
    const conv = await sql<{ channel: string }[]>`
      SELECT channel FROM conversation WHERE id = ${tgConversationId}`;
    expect(conv[0]!.channel).toBe("telegram");
  });

  it("contacto inexistente: not_found", async () => {
    await expect(
      open.openConversationForContact({
        organizationId: orgId,
        contactId: "cnt_noexiste_test",
      })
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
