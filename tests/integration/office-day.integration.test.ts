import { beforeAll, describe, expect, it } from "vitest";

/**
 * Integración REAL de la sucursal del día (023) contra una copia local de
 * producción (Postgres descartable con el dump restaurado + migraciones
 * aplicadas). No corre en `pnpm test` normal: se salta salvo que
 * INTEGRATION_DATABASE_URL apunte a esa copia.
 */

const DB_URL = process.env.INTEGRATION_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

type OfficeDayModule = typeof import("@/server/internal/office-day");
type ChatModule = typeof import("@/server/internal/chat");

suite("sucursal del día — integración con copia de la BD real", () => {
  let mod: OfficeDayModule;
  let chat: ChatModule;
  // Cliente crudo para sembrar/verificar datos de prueba.
  let sql: import("postgres").Sql;

  let orgId: string;
  let userId: string;
  let officeA: string;
  let officeB: string;

  beforeAll(async () => {
    // Las envs se fijan ANTES de importar el módulo (getEnv es lazy).
    process.env.DATABASE_URL = DB_URL!;
    process.env.APP_BASE_URL =
      process.env.APP_BASE_URL ?? "http://localhost:3000";
    process.env.BETTER_AUTH_SECRET =
      process.env.BETTER_AUTH_SECRET ?? "integration-test-secret-1234567890";
    process.env.ENCRYPTION_KEY =
      process.env.ENCRYPTION_KEY ?? Buffer.alloc(32).toString("base64");
    process.env.META_WEBHOOK_VERIFY_TOKEN =
      process.env.META_WEBHOOK_VERIFY_TOKEN ?? "integration-test-token";

    mod = await import("@/server/internal/office-day");
    chat = await import("@/server/internal/chat");
    const postgres = (await import("postgres")).default;
    sql = postgres(DB_URL!, { max: 4, onnotice: () => {} });

    const orgRows = await sql<{ id: string }[]>`
      SELECT id FROM organization ORDER BY created_at LIMIT 1`;
    orgId = orgRows[0]!.id;

    const userRows = await sql<{ user_id: string }[]>`
      SELECT user_id FROM member
      WHERE organization_id = ${orgId} AND role = 'owner' LIMIT 1`;
    userId = userRows[0]!.user_id;

    const officeRows = await sql<{ id: string }[]>`
      SELECT id FROM office
      WHERE organization_id = ${orgId} AND active = true
      ORDER BY sort_order NULLS LAST, name
      LIMIT 2`;
    officeA = officeRows[0]!.id;
    officeB = officeRows[1]?.id ?? officeA;
  }, 30_000);

  it("artDayKey usa el día local del negocio (-03), no UTC", () => {
    // 01/01 02:30 UTC = 31/12 23:30 en Argentina.
    expect(mod.artDayKey(new Date("2026-01-01T02:30:00Z"))).toBe("2025-12-31");
    // 01/01 03:30 UTC = 01/01 00:30 en Argentina.
    expect(mod.artDayKey(new Date("2026-01-01T03:30:00Z"))).toBe("2026-01-01");
  });

  it("marca y devuelve la sucursal de hoy; cambiarla actualiza la MISMA fila del día", async () => {
    const first = await mod.setTodayOffice({
      organizationId: orgId,
      userId,
      officeId: officeA,
    });
    expect(first.officeId).toBe(officeA);
    expect(first.displayName.length).toBeGreaterThan(0);

    const got = await mod.getTodayOffice(orgId, userId);
    expect(got?.officeId).toBe(officeA);

    if (officeB !== officeA) {
      const second = await mod.setTodayOffice({
        organizationId: orgId,
        userId,
        officeId: officeB,
      });
      expect(second.officeId).toBe(officeB);
    }

    // Upsert: una sola fila por empleado y día, con la última elección.
    const day = mod.artDayKey();
    const rows = await sql<{ n: number; office_id: string }[]>`
      SELECT count(*)::int AS n, min(office_id) AS office_id
      FROM staff_office_day
      WHERE organization_id = ${orgId} AND user_id = ${userId} AND day = ${day}`;
    expect(rows[0]!.n).toBe(1);
    expect(rows[0]!.office_id).toBe(officeB !== officeA ? officeB : officeA);
  });

  it("rechaza sucursales inexistentes o inactivas", async () => {
    await expect(
      mod.setTodayOffice({
        organizationId: orgId,
        userId,
        officeId: "off_no_existe",
      })
    ).rejects.toMatchObject({ status: 422 });
  });

  it("la ficha del empleado (listStaff) muestra la sucursal de hoy", async () => {
    const staff = await chat.listStaff(orgId);
    const row = staff.find((s) => s.userId === userId)!;
    expect(row.officeName).toBeTruthy();
    expect(typeof row.officeSince).toBe("string");
  });
});
