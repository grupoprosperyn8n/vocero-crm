import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Integración REAL del matching backend↔CRM contra una copia local de
 * producción (Postgres descartable con el dump restaurado + migraciones 0023
 * y 0024 aplicadas). No corre en `pnpm test` normal: se salta salvo que
 * INTEGRATION_DATABASE_URL apunte a esa copia.
 *
 * Correr con:
 *   INTEGRATION_DATABASE_URL=postgres://postgres:***@127.0.0.1:55432/vocero \
 *   pnpm exec vitest run tests/integration/clients-link.integration.test.ts
 *
 * Todo lo que crea es sintético y se borra al final (contacto + conversación
 * propios del test). Nada toca datos reales.
 */

const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

type LinkModule = typeof import("@/server/clients/link");

suite("clientes del sistema ↔ CRM — integración con copia de la BD real", () => {
  let link: LinkModule;
  let sql: import("postgres").Sql;

  let orgId: string;
  let phone: string;
  let recordId: string;
  let contactId: string | null = null;
  let conversationId: string | null = null;

  beforeAll(async () => {
    // Las envs se fijan ANTES de importar los módulos (getEnv es lazy).
    process.env.DATABASE_URL = DB_URL!;
    process.env.APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET =
      process.env.BETTER_AUTH_SECRET ?? "integration-test-secret-1234567890";
    process.env.ENCRYPTION_KEY =
      process.env.ENCRYPTION_KEY ?? Buffer.alloc(32).toString("base64");
    process.env.META_WEBHOOK_VERIFY_TOKEN =
      process.env.META_WEBHOOK_VERIFY_TOKEN ?? "integration-test-token";

    link = await import("@/server/clients/link");
    const postgres = (await import("postgres")).default;
    sql = postgres(DB_URL!, { max: 4, onnotice: () => {} });

    const orgRows = await sql<{ id: string }[]>`
      SELECT id FROM organization ORDER BY created_at LIMIT 1`;
    orgId = orgRows[0]!.id;

    // Número sintético derivado del reloj: no puede pisar ningún contacto real.
    const stamp = String(Date.now()).slice(-7);
    phone = `54934155${stamp}`;
    recordId = `recTEST${stamp}`;
  });

  afterAll(async () => {
    // Limpieza quirúrgica de lo creado por este test.
    if (conversationId) {
      await sql`DELETE FROM conversation WHERE id = ${conversationId}`;
    }
    if (contactId) {
      await sql`DELETE FROM contact WHERE id = ${contactId}`;
    }
    await sql.end({ timeout: 5 });
  });

  it("primer 'abrir chat': crea contacto con vínculo sgsa:<recordId> y su conversación", async () => {
    const r = await link.resolveOrLinkClient({
      organizationId: orgId,
      recordId,
      name: "Cliente Integración SGSA",
      phone,
    });
    contactId = r.contactId;
    conversationId = r.conversationId;

    expect(r.created).toBe(true);
    expect(r.reopened).toBe(false);

    const rows = await sql<
      {
        external_ref: string | null;
        channel: string;
        wa_identity: string | null;
        is_test: boolean;
        name_source: string;
      }[]
    >`
      SELECT external_ref, channel, wa_identity, is_test, name_source
      FROM contact WHERE id = ${contactId}`;
    expect(rows[0]!.external_ref).toBe(`sgsa:${recordId}`);
    expect(rows[0]!.channel).toBe("whatsapp");
    expect(rows[0]!.wa_identity).toBe(phone);
    expect(rows[0]!.is_test).toBe(false);
    // El nombre viene del sistema de gestión: no debe pisarlo el perfil de WA.
    expect(rows[0]!.name_source).toBe("manual");

    const conv = await sql<
      { is_test: boolean; closed_at: Date | null; contact_id: string }[]
    >`
      SELECT is_test, closed_at, contact_id FROM conversation
      WHERE id = ${conversationId}`;
    expect(conv[0]!.contact_id).toBe(contactId);
    expect(conv[0]!.closed_at).toBeNull();
  });

  it("segundo 'abrir chat' con otro formato del mismo número: mismo contacto, sin duplicar", async () => {
    const r = await link.resolveOrLinkClient({
      organizationId: orgId,
      recordId,
      name: "Cliente Integración SGSA",
      phone: phone.replace(/^549/, "+54 9 "),
    });
    expect(r.contactId).toBe(contactId);
    expect(r.created).toBe(false);
    expect(r.conversationId).toBe(conversationId);
  });

  it("el buscador del sistema encuentra el contacto por llave de teléfono", async () => {
    const matches = await link.matchContactsByPhoneKeys(orgId, [
      phone.slice(-10),
    ]);
    const match = matches.get(phone.slice(-10));
    expect(match?.contactId).toBe(contactId);
    expect(match?.isTest).toBe(false);
  });

  it("si la conversación estaba cerrada, 'abrir chat' la reabre", async () => {
    await sql`
      UPDATE conversation SET closed_at = now(), closure_status = 'summarized'
      WHERE id = ${conversationId}`;
    const r = await link.resolveOrLinkClient({
      organizationId: orgId,
      recordId,
      name: "Cliente Integración SGSA",
      phone,
    });
    expect(r.conversationId).toBe(conversationId);
    expect(r.reopened).toBe(true);
    const rows = await sql<{ closed_at: Date | null }[]>`
      SELECT closed_at FROM conversation WHERE id = ${conversationId}`;
    expect(rows[0]!.closed_at).toBeNull();
  });

  it("sin teléfono no se abre chat: error claro", async () => {
    await expect(
      link.resolveOrLinkClient({
        organizationId: orgId,
        recordId,
        name: "Cliente sin teléfono",
        phone: null,
      })
    ).rejects.toMatchObject({ code: "no_phone" });
  });
});
