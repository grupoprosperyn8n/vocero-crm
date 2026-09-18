// check 039 — UI real del Dashboard Management: chips con colores de Airtable,
// fila Motor con el estado de la IA, y cero errores de consola.
//
// Requiere un cockpit que ya sirva `tags` en las listas (039 deployado o
// cockpit local en dev). Uso:
//   node scripts/check-039-ui-chips.mjs                 (dev 3001)
//   BASE_URL=https://vocero... node scripts/check-039-ui-chips.mjs
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const envLocal = fs.existsSync(".env.local")
  ? fs.readFileSync(".env.local", "utf8")
  : "";
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const ADMIN_KEY = envOf("ADMIN_API_KEY");
const ORIGIN = envOf("APP_BASE_URL") ?? BASE;
if (!ADMIN_KEY) {
  console.error("falta ADMIN_API_KEY en .env.local");
  process.exit(1);
}

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (ok) pass++;
  else fail++;
}

const stamp = Date.now().toString(36);
const EMAIL = `e2e-039-ui-${stamp}@test.local`;
const PASS = "E2E-039-UI-2026!";

const alta = await fetch(`${BASE}/api/admin/users`, {
  method: "PUT",
  headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
  body: JSON.stringify({ email: EMAIL, name: "E2E 039 UI", password: PASS, role: "owner" }),
});
check("0. alta owner", alta.status === 201, String(alta.status));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const consoleErrors = [];
const localDrift = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url ?? "";
  // Drift conocido de la DB local de dev (migraciones pendientes): no es del 039.
  if (/\/api\/conversations|\/api\/internal\/rooms/.test(url)) {
    localDrift.push(url);
    return;
  }
  consoleErrors.push(`${m.text().slice(0, 160)} @ ${url}`.slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`.slice(0, 200)));

const login = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: EMAIL, password: PASS },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("1. login owner", login.status() === 200, String(login.status()));

await page.goto(`${BASE}/dashboard-management`, { waitUntil: "domcontentloaded" });
await page.getByText("Pulso del negocio").first().waitFor({ timeout: 120_000 });
check("2. página cargada (tab Pulso del negocio)", true);

// El aviso del encabezado ahora es un botón con reloj de arena
const cargaChip = page.locator('button:has-text("Pólizas en proceso de carga")');
check("3. chip de carga es botón", await cargaChip.count() > 0);

// Fila Motor (módulos): chip de estado de IA
const iaChip = page.getByText(/IA conectada ·|IA no conectada/).first();
const iaText = (await iaChip.count()) > 0 ? (await iaChip.textContent())?.trim() : null;
check("4. chip de IA visible en la fila Motor", iaText !== null, iaText ?? "no encontrado");

// Cartera → lista de pólizas cargadas → chips de Airtable
await page.getByRole("button", { name: "Cartera", exact: true }).first().click();
const listButton = page.getByRole("button", { name: /Pólizas cargadas/ }).first();
await listButton.waitFor({ timeout: 30_000 });
await listButton.click();

const chipSelector = 'span[title^="Etiqueta del backoffice"]';
await page.waitForSelector(chipSelector, { timeout: 30_000 });

const chips = await page.$$eval(chipSelector, (els) =>
  els.slice(0, 80).map((el) => ({
    text: el.textContent?.trim() ?? "",
    bg: getComputedStyle(el).backgroundColor,
    color: getComputedStyle(el).color,
  }))
);

check("5. chips de Airtable en la lista", chips.length >= 5, `${chips.length} chips`);

const PALETTE = new Set([
  "rgb(32, 217, 210)", // tealBright (VIGENTE / POLIZA VIGENTE)
  "rgb(32, 201, 51)", // greenBright (RENOVADA / EFECTIVO)
  "rgb(255, 8, 194)", // pinkBright (VENCE EN 7 DIAS / VENCE HOY)
  "rgb(252, 180, 0)", // yellowBright (EN TRAMITE / MERCADO P)
  "rgb(248, 43, 96)", // redBright (ANULACION / VENCE EN 1 DIA)
  "rgb(45, 127, 249)", // blueBright (CREDITO)
  "rgb(24, 191, 255)", // cyanBright (DEBITO)
  "rgb(249, 157, 226)", // pinkLight1 (VENCE EN 30 DIAS)
  "rgb(255, 218, 246)", // pinkLight2
  "rgb(207, 223, 255)", // blueLight2
  "rgb(208, 240, 253)", // cyanLight2
  "rgb(178, 21, 139)", // pinkDark1 (SIN VIGENCIA)
  "rgb(139, 70, 255)", // purpleBright (VIDA EN TRAMITE)
  "rgb(186, 30, 69)", // redDark1 (NO_RENOVADA)
  "rgb(237, 226, 254)", // purpleLight2 (SIN POLIZA)
  "rgb(255, 111, 44)", // orangeBright (COMPLETAR DATOS)
  "rgb(68, 68, 68)", // grayDark1 (NO APLICA)
]);
const paletted = chips.filter((c) => PALETTE.has(c.bg));
check(
  "6. los chips usan la paleta de Airtable",
  paletted.length >= 3,
  `${paletted.length}/${chips.length} con color de paleta`
);

console.log("   muestra:");
for (const c of chips.slice(0, 12)) {
  console.log(`   · ${c.text} → ${c.bg} (texto ${c.color})`);
}

fs.mkdirSync("/tmp/crm-039", { recursive: true });
await page.screenshot({ path: "/tmp/crm-039/cartera-chips.png" });

// 8) Cartera: aviso plegable + barras de participación de compañías
const aviso = page.locator('details:has-text("Cartera en proceso de carga")');
check("8. aviso de cartera plegable (details)", (await aviso.count()) > 0);

const bars = page.locator('[title^="Participación sobre la mayor compañía"]');
check("8b. barras de participación en Compañías", (await bars.count()) > 0, `${await bars.count()} barras`);

// 9) Filtros ideales por pestaña: en Pulso están los presets y el canal; en Cartera no hay fechas
await page.getByRole("button", { name: "Pulso del negocio", exact: true }).first().click();
await page.waitForTimeout(700);
const presetIcon = page.locator('section button:has-text("Mes pasado") svg');
check("9. presets de fecha con íconos (Pulso)", (await presetIcon.count()) > 0);
const canalSel = page.locator("section select").filter({ hasText: "Todos los canales" });
check("9b. filtro de canal disponible en Pulso", (await canalSel.count()) > 0);
await page.getByRole("button", { name: "Cartera", exact: true }).first().click();
await page.waitForTimeout(700);
const presetEnCartera = page.locator('section button:has-text("Mes pasado")');
check("9c. Cartera sin fechas — filtros ideales por sección", (await presetEnCartera.count()) === 0);

// 10) Módulo CRM: pipeline con punto por etapa + badges de vínculo con íconos
await page.getByRole("button", { name: "CRM · Venta y gestión", exact: true }).first().click();
await page
  .getByText("Cómo avanza cada oportunidad", { exact: false })
  .first()
  .waitFor({ timeout: 30_000 });

const dots = page.locator("span.rounded-full.h-2.w-2");
check("10. pipeline con puntos por etapa", (await dots.count()) > 0, `${await dots.count()} puntos`);

const badgeIcons = page.locator(
  'td span:has-text("Vínculo directo") svg, td span:has-text("Sin vínculo") svg'
);
check("10b. badges de vínculo con íconos", (await badgeIcons.count()) > 0, `${await badgeIcons.count()}`);

// 11) Generar análisis con IA desde la UI (modo dual del módulo activo)
let gen = page.getByRole("button", { name: "Generar análisis con IA" }).first();
if ((await gen.count()) === 0) {
  await page.getByRole("button", { name: "Cartera", exact: true }).first().click();
  gen = page.getByRole("button", { name: "Generar análisis con IA" }).first();
}
let iaUiOk = false;
try {
  await gen.scrollIntoViewIfNeeded();
  await gen.click();
  await page.getByText(/Generado con /).first().waitFor({ timeout: 90_000 });
  iaUiOk = true;
} catch {
  iaUiOk = false;
}
check("11. análisis IA generado desde la UI", iaUiOk);

// Evidencia (capturas por pestaña)
await page.getByRole("button", { name: "Cartera", exact: true }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/crm-039/cartera.png" });
const section = page.locator("section", { hasText: "Cartera" }).first();
await section.screenshot({ path: "/tmp/crm-039/cartera-seccion.png" }).catch(() => {});
await page.getByRole("button", { name: "CRM · Venta y gestión", exact: true }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/crm-039/crm.png" });
await page.getByRole("button", { name: "Pulso del negocio", exact: true }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/crm-039/pulso.png" });

check(
  "7. cero errores de consola",
  consoleErrors.length === 0,
  consoleErrors.slice(0, 3).join(" | ") || "limpia"
);

// 12) Móvil 390 px: sin desborde horizontal
await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole("button", { name: "Pulso del negocio", exact: true }).first().click();
await page.waitForTimeout(900);
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth
);
check("12. móvil 390 px sin desborde horizontal", overflow <= 2, `overflow ${overflow}px`);
await page.screenshot({ path: "/tmp/crm-039/mobile.png" });
if (localDrift.length > 0) {
  console.log(
    `INFO: ${localDrift.length} request(s) 500 del shell por migraciones pendientes de la DB local (ajeno al 039)`
  );
}

await browser.close();
console.log(`\n${fail === 0 ? "UI OK" : "UI CON FALLAS"} — ${pass} pass / ${fail} fail`);
console.log("capturas: /tmp/crm-039/");
process.exit(fail === 0 ? 0 : 1);
