// e2e 039e — «Mandar mensaje»: en la ficha del cliente (Cliente 360°), el botón
// busca el cliente en el sistema de gestión (SGSA), garantiza su hilo en la
// Bandeja y abre el chat con el mensaje sugerido por la IA ya cargado en el
// compositor, listo para revisar y enviar. Verifica también que el mensaje
// generado venga enriquecido (emoji y/o pregunta/CTA).
//
// Uso: node scripts/e2e-039e-mandar-mensaje.mjs            (dev 3001)
//      BASE_URL=https://vocero.sistemasagenticos.cloud node scripts/e2e-039e-mandar-mensaje.mjs
//
// Requiere: SGSA configurado en el entorno donde corre el CRM y AI configurada
// para la organización. Solo usa el perfil TEST IA (nunca datos reales).
import fs from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const CLIENTE = process.env.CLIENTE ?? "TEST IA";
const envLocal = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const ADMIN_KEY = envOf("ADMIN_API_KEY");
const ORIGIN = envOf("APP_BASE_URL") ?? BASE;

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (ok) pass++;
  else fail++;
}

const stamp = Date.now().toString(36);
const EMAIL = `e2e-039e-${stamp}@test.local`;
const PASS = "E2E-039E-2026!";

if (ADMIN_KEY) {
  const alta = await fetch(`${BASE}/api/admin/users`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ email: EMAIL, name: "E2E 039e", password: PASS, role: "owner" }),
  });
  check("1. alta owner", alta.status === 201, String(alta.status));
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url ?? "";
  // Ruido ajeno al flujo: avatar inexistente de otros contactos de la lista.
  if (/\/api\/avatars\//.test(url)) return;
  consoleErrors.push(`${m.text().slice(0, 140)} @ ${url}`.slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`.slice(0, 200)));

const login = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: EMAIL, password: PASS },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("2. login owner", login.status() === 200, String(login.status()));

await page.goto(`${BASE}/dashboard-management`, { waitUntil: "domcontentloaded" });
await page.getByText("Pulso del negocio").first().waitFor({ timeout: 120_000 });
const skip = page.getByRole("button", { name: "Después" });
if (await skip.count()) await skip.first().click().catch(() => {});
check("3. tablero cargado", true);

// Cliente 360° → buscar el cliente
await page.getByRole("button", { name: /^\s*Cliente 360/, exact: false }).first().click();
const searchInput = page.getByPlaceholder("Ej. Juan Pérez, DNI o teléfono");
await searchInput.waitFor({ timeout: 30_000 });
await searchInput.fill(CLIENTE);
await page.getByRole("button", { name: "Buscar cliente", exact: true }).first().click();

// La búsqueda tarda y, hasta que aterriza, sigue visible la lista previa
// (últimas fichas cargadas). Esperar a que aparezca LA tarjeta del cliente
// correcto (por su DNI) y atarla por id — así el resto del flujo no puede
// apuntar a una tarjeta vieja.
const DNI = process.env.CLIENTE_DNI ?? "26322995";
let cardId = null;
let lastClick = Date.now();
const deadline = Date.now() + 90_000;
while (!cardId && Date.now() < deadline) {
  const arts = await page.$$eval("article[data-dm-client]", (els) =>
    els.map((el) => ({ id: el.getAttribute("data-dm-client"), text: el.innerText }))
  );
  const hit = arts.find((a) => (a.text ?? "").includes(DNI));
  if (hit) {
    cardId = hit.id;
    break;
  }
  if (Date.now() - lastClick > 20_000) {
    lastClick = Date.now();
    await page
      .getByRole("button", { name: "Buscar cliente", exact: true })
      .first()
      .click()
      .catch(() => {});
  }
  await page.waitForTimeout(1200);
}
const card = cardId
  ? page.locator(`article[data-dm-client="${cardId}"]`)
  : page.locator("article[data-dm-client]").first();
try {
  await card.waitFor({ timeout: 30_000 });
  check("4. ficha del cliente cargada (por DNI)", Boolean(cardId), `${CLIENTE} · ${cardId ?? "no encontrada"}`);
} catch {
  check("4. ficha del cliente cargada (por DNI)", false, "no apareció la tarjeta");
}

// Generar el análisis con IA (real) — el botón DENTRO de la tarjeta
const gen = card.getByRole("button", { name: "Generar análisis con IA", exact: true });
await gen.scrollIntoViewIfNeeded();
await gen.click();
check("5. generación IA disparada (desde la ficha)", true);

fs.mkdirSync("/tmp/crm-039", { recursive: true });
const mandar = card.getByRole("button", { name: "Mandar mensaje", exact: true });
try {
  await mandar.waitFor({ timeout: 180_000 });
  check("6. mensaje de la IA listo (botón «Mandar mensaje» visible)", true);
} catch {
  const stuck = await card
    .locator("text=/no respondió|Reintentar|IA no conectada/")
    .first()
    .textContent()
    .catch(() => null);
  check("6. mensaje de la IA listo (botón «Mandar mensaje» visible)", false, stuck ?? "timeout 180s");
}

const msgText = await card.evaluate((el) => {
  const btn = [...el.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Mandar mensaje")
  );
  if (!btn) return null;
  const box = btn.closest("div.rounded-md");
  return box?.querySelector("p")?.textContent?.trim() ?? null;
});
check("7. mensaje visible en la ficha", Boolean(msgText), (msgText ?? "").slice(0, 100));
const enriched =
  Boolean(msgText) &&
  (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/u.test(msgText) ||
    msgText.includes("?"));
check("7b. mensaje enriquecido (emoji o pregunta/CTA)", enriched, (msgText ?? "").slice(-60));

await page.screenshot({ path: "/tmp/crm-039/e039-card-mandar-mensaje.png" });

// Click en «Mandar mensaje» → navega a la bandeja con el borrador
await mandar.click();
try {
  await page.waitForURL(/\/inbox\?contact=/, { timeout: 120_000 });
  check("8. navega a la bandeja con el contacto", true, page.url().replace(BASE, "").slice(0, 120));
} catch {
  const busy = await card
    .getByRole("button", { name: /Buscando|Mandar mensaje/ })
    .first()
    .textContent()
    .catch(() => null);
  check("8. navega a la bandeja con el contacto", false, `${page.url().replace(BASE, "")} ${busy ?? ""}`);
}

// La ventana de 24 h de WhatsApp: TEST IA nunca escribió, así que el CRM
// (correctamente) muestra el aviso y no el compositor de texto libre. Para
// verificar el precargado del borrador simulamos un entrante reciente en la
// base LOCAL (solo dev y perfil de prueba); contra prod ese paso se reporta.
// Primero: esperar a que el chat asiente (aviso de ventana o compositor).
const avisoCerrada = page.getByText("La ventana de 24 horas está cerrada").first();
const compositor = page.getByPlaceholder("Escribe una respuesta…");
await page
  .waitForFunction(
    () =>
      document.body.innerText.includes("La ventana de 24 horas está cerrada") ||
      Boolean(document.querySelector('textarea[placeholder="Escribe una respuesta…"]')),
    { timeout: 90_000 }
  )
  .catch(() => {});
const cerrada = await avisoCerrada.isVisible().catch(() => false);
check("9a. estado de la ventana de 24 h", true, cerrada ? "cerrada (aviso visible)" : "abierta");

const LOCAL = BASE.includes("localhost") || BASE.includes("127.0.0.1");
if (cerrada && LOCAL) {
  const PHONE = process.env.CLIENTE_PHONE ?? "3417035515";
  try {
    execSync(
      `docker exec vocero-dev-pg psql -U postgres -d vocero -c "update conversation set last_inbound_at = now() where id in (select c.id from conversation c join contact ct on ct.id = c.contact_id where ct.wa_identity = '${PHONE}')"`,
      { stdio: "ignore" }
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
  } catch (e) {
    console.log("   nota: no se pudo simular el entrante:", String(e).slice(0, 90));
  }
}

// Compositor con el borrador cargado
try {
  await compositor.waitFor({ timeout: 60_000 });
  const val = (await compositor.inputValue()).trim();
  const okDraft = Boolean(msgText) && val.length > 0 && msgText.includes(val.slice(0, 30));
  check(
    "9. compositor con el mensaje de la IA cargado",
    okDraft,
    val ? `"${val.slice(0, 90).replace(/\n/g, " ")}…"` : "(vacío)"
  );
} catch {
  check(
    "9. compositor con el mensaje de la IA cargado",
    false,
    cerrada ? "ventana cerrada: sin texto libre (solo plantilla)" : "sin textarea del compositor"
  );
}

await page.screenshot({ path: "/tmp/crm-039/e039-inbox-draft.png" });
check("10. sin errores de consola", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

console.log(`\nRESULTADO: ${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
