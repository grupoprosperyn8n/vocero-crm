// e2e 040 — Integración CRM ↔ cockpit ↔ backend:
//   A. Snapshot vivo del CRM (/api/snapshot): 401 sin clave, 200 con clave,
//      incluye las acciones del tablero (trazabilidad).
//   B. «Cola de hoy»: jugadas accionables renderizadas desde el motor de
//      datos (con frescura en vivo) y cada fila con sus acciones.
//   C. Trazabilidad: una acción disparada desde el tablero queda registrada
//      en la base y el snapshot la expone al cockpit.
//
// Uso: node scripts/e2e-040-cola-hoy.mjs                (dev 3001)
// Requiere: CRM dev con DASHBOARD_MANAGEMENT_URL apuntando al cockpit local
// (o al cockpit desplegado con 040). Solo usa el perfil TEST IA para clicks.
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const CLIENTE = process.env.CLIENTE ?? "TEST IA";
const CLIENTE_DNI = process.env.CLIENTE_DNI ?? "26322995";
const CLIENTE_REF = process.env.CLIENTE_REF ?? "sgsa:rechYRnw7FzaGjfpA";
const envLocal = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const ADMIN_KEY = envOf("ADMIN_API_KEY");
const SNAP_KEY = envOf("SNAPSHOT_API_KEY") ?? envOf("BOT_API_KEY");
const ORIGIN = envOf("APP_BASE_URL") ?? BASE;

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (ok) pass++;
  else fail++;
}

const psql = (q) =>
  execSync(`docker exec vocero-dev-pg psql -U postgres -d vocero -At -q -c "${q}"`, {
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString()
    .trim();

/* A. Snapshot vivo -------------------------------------------------------- */

const noKey = await fetch(`${BASE}/api/snapshot`).catch(() => null);
check("A1. /api/snapshot sin clave → 401", noKey?.status === 401, String(noKey?.status));

const withKey = await fetch(`${BASE}/api/snapshot`, {
  headers: { "x-api-key": SNAP_KEY ?? "" },
}).catch(() => null);
let snap = null;
if (withKey?.ok) snap = await withKey.json().catch(() => null);
check(
  "A2. /api/snapshot con clave → 200 + payload",
  withKey?.status === 200 && snap && Array.isArray(snap.contacts),
  `${withKey?.status} · contactos:${snap?.contacts?.length ?? "-"}`
);
check("A3. el snapshot trae acciones", Array.isArray(snap?.actions), `actions:${snap?.actions?.length ?? "-"}`);

/* B. Alta + login + tablero ---------------------------------------------- */

const stamp = Date.now().toString(36);
const EMAIL = `e2e-040-${stamp}@test.local`;
const PASS = "E2E-040-2026!";
if (ADMIN_KEY) {
  const alta = await fetch(`${BASE}/api/admin/users`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ email: EMAIL, name: "E2E 040", password: PASS, role: "owner" }),
  });
  check("B1. alta owner", alta.status === 201, String(alta.status));
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url ?? "";
  if (/\/api\/avatars\//.test(url)) return;
  consoleErrors.push(`${m.text().slice(0, 140)} @ ${url}`.slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`.slice(0, 200)));

const login = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: EMAIL, password: PASS },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("B2. login owner", login.status() === 200, String(login.status()));

await page.goto(`${BASE}/dashboard-management`, { waitUntil: "domcontentloaded" });
await page.getByText("Pulso del negocio").first().waitFor({ timeout: 120_000 });
const skip = page.getByRole("button", { name: "Después" });
if (await skip.count()) await skip.first().click().catch(() => {});
check("B3. tablero cargado", true);

/* C. Cola de hoy ---------------------------------------------------------- */

await page.getByRole("button", { name: /^\s*Cola de hoy/ }).first().click();
let colaOk = false;
try {
  await page.locator("[data-dm-cola]").waitFor({ timeout: 60_000 });
  colaOk = true;
} catch {}
check("C1. cola renderizada", colaOk);

const plays = await page.$$eval("[data-dm-play]", (els) =>
  els.map((el) => ({
    id: el.getAttribute("data-dm-play"),
    rows: el.querySelectorAll("li").length,
    buttons: [...el.querySelectorAll("button")].filter((b) =>
      (b.textContent ?? "").includes("Mandar mensaje")
    ).length,
    total: (el.innerText.match(/([\d.]+) en total/) ?? [])[1] ?? "-",
  }))
);
check(
  "C2. jugadas calculadas (≥3)",
  plays.length >= 3,
  plays.map((p) => `${p.id}:${p.rows}(${p.total})`).join(" | ").slice(0, 160)
);
const consistent = plays.length > 0 && plays.every((p) => p.rows > 0 && p.buttons === p.rows);
check("C3. cada fila con su «Mandar mensaje»", consistent, `${plays.reduce((n, p) => n + p.rows, 0)} filas`);

const fichaLinks = await page.$$eval("[data-dm-cola] a[href*='airtable.com']", (els) => els.length);
check("C4. enlaces a la ficha del backoffice", fichaLinks > 0, `links:${fichaLinks}`);

const phoneLinks = await page.$$eval("[data-dm-cola] a[href^='tel:']", (els) => els.length);
check("C5. teléfonos accionables (llamar)", phoneLinks > 0, `tel:${phoneLinks}`);

/* D. Trazabilidad: una acción disparada desde el tablero ------------------ */

let before = 0;
try {
  before = Number(psql("select count(*) from dashboard_action") || "0");
} catch {}
console.log(`   acciones registradas antes: ${before}`);

const testRow = page
  .locator("[data-dm-cola] li", { hasText: CLIENTE })
  .first();
let clickedFrom = "";
if ((await testRow.count()) > 0 && (await testRow.getByText(CLIENTE_DNI).count()) >= 0) {
  const btn = testRow.getByRole("button", { name: /Mandar mensaje/ });
  if (await btn.count()) {
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    await btn.click();
    clickedFrom = "cola";
  }
}

if (!clickedFrom) {
  // Fallback: flujo de la ficha (Cliente 360°), mismo camino ya probado en 039e.
  await page.getByRole("button", { name: /^\s*Cliente 360/, exact: false }).first().click();
  const searchInput = page.getByPlaceholder("Ej. Juan Pérez, DNI o teléfono");
  await searchInput.waitFor({ timeout: 30_000 });
  await searchInput.fill(CLIENTE);
  await page.getByRole("button", { name: "Buscar cliente", exact: true }).first().click();
  let cardId = null;
  const deadline = Date.now() + 90_000;
  while (!cardId && Date.now() < deadline) {
    const arts = await page.$$eval("article[data-dm-client]", (els) =>
      els.map((el) => ({ id: el.getAttribute("data-dm-client"), text: el.innerText }))
    );
    const hit = arts.find((a) => (a.text ?? "").includes(CLIENTE_DNI));
    if (hit) cardId = hit.id;
    if (!cardId) await page.waitForTimeout(1200);
  }
  check("D0. ficha TEST IA localizada (fallback)", Boolean(cardId), cardId ?? "no encontrada");
  const card = page.locator(`article[data-dm-client="${cardId}"]`);
  const gen = card.getByRole("button", { name: "Generar análisis con IA", exact: true });
  await gen.scrollIntoViewIfNeeded();
  await gen.click();
  const mandar = card.getByRole("button", { name: "Mandar mensaje", exact: true });
  await mandar.waitFor({ timeout: 180_000 });
  await mandar.click();
  clickedFrom = "ficha";
}

try {
  await page.waitForURL(/\/inbox\?contact=/, { timeout: 150_000 });
  check(`D1. acción desde ${clickedFrom} → bandeja con el borrador`, true, page.url().replace(BASE, "").slice(0, 110));
} catch {
  check(`D1. acción desde ${clickedFrom} → bandeja con el borrador`, false, page.url().replace(BASE, ""));
}

await page.waitForTimeout(2500);
let after = 0;
let newest = "";
try {
  after = Number(psql("select count(*) from dashboard_action") || "0");
  newest = psql(
    "select source || '|' || coalesce(play_id,'-') || '|' || coalesce(client_ref,'-') || '|' || coalesce(client_name,'-') from dashboard_action order by created_at desc limit 1"
  );
} catch (e) {
  newest = `error: ${String(e).slice(0, 80)}`;
}
check("D2. la acción quedó registrada (trazabilidad)", after > before, `${before} → ${after} · ${newest.slice(0, 130)}`);
check("D3. registrada desde la fuente correcta", newest.includes(clickedFrom) && newest.includes(CLIENTE), newest.slice(0, 130));

// El snapshot la expone (lo que verá el cockpit)
const snap2 = await fetch(`${BASE}/api/snapshot`, { headers: { "x-api-key": SNAP_KEY ?? "" } })
  .then((r) => r.json())
  .catch(() => null);
const exposed = (snap2?.actions ?? []).some((a) =>
  String(a.clientRef ?? "").includes(CLIENTE_REF.replace("sgsa:", ""))
);
check("D4. el snapshot expone la acción al cockpit", exposed, `actions:${snap2?.actions?.length ?? "-"}`);

/* E. Frescura del CRM en el tablero --------------------------------------- */

await page.goto(`${BASE}/dashboard-management`, { waitUntil: "domcontentloaded" });
await page.getByText("Pulso del negocio").first().waitFor({ timeout: 120_000 });
await page.getByRole("button", { name: /^\s*CRM · Venta/ }).first().click();
const fresh = await page
  .getByText(/CRM en vivo|CRM · snapshot del archivo local/)
  .first()
  .textContent()
  .catch(() => null);
check("E1. chip de frescura del CRM", Boolean(fresh), (fresh ?? "no visible").slice(0, 90));

await page.screenshot({ path: "/tmp/crm-040/cola-hoy.png", fullPage: false }).catch(() => {});

check("F1. sin errores de consola", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

console.log(`\nRESULTADO: ${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
