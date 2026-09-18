// e2e 041c — LA IA ESCRIBE LA PUBLICIDAD CON EL TONO ELEGIDO:
//   · tono (cercana/natural ↔ formal ↔ directa ↔ entusiasta) y concepto de
//     venta (beneficio, ahorro, protección, urgencia, familia, confianza)
//   · POST /api/proposals/copy escribe la pieza o reescribe el mensaje
//   · el tono y el concepto quedan guardados en la propuesta
//   · UI: chips de tono/concepto + «Escribir con IA» + «Deshacer»
//   · UI: en la previa de WhatsApp, tocar un tono reescribe el mensaje
//
// Uso: node scripts/e2e-041c-tono-publicidad.mjs     (dev 3001 con mocks)
// Seguridad: el ciclo de escritura usa SOLO el perfil TEST IA.
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const TEST_CLIENT = "rechYRnw7FzaGjfpA"; // TEST IA
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
const EMAIL_OWNER = `e2e-041c-${stamp}@test.local`;
const PASS = "E2E-041C-2026!";

const mk = await fetch(`${BASE}/api/admin/users`, {
  method: "PUT",
  headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY ?? "" },
  body: JSON.stringify({ email: EMAIL_OWNER, name: `E2E 041c ${stamp}`, password: PASS, role: "owner" }),
});
check("1. usuario temporal (owner)", mk.status === 201, String(mk.status));

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
  data: { email: EMAIL_OWNER, password: PASS },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("2. login owner", login.status() === 200, String(login.status()));

/* ---------- API: la IA escribe con el tono pedido ---------- */

const copyBase = {
  clientName: "TEST IA",
  kind: "renovacion",
  productName: "Auto",
  title: "Tu auto protegido",
  offer: "20% de descuento",
  benefit: "Cuota congelada",
};

const piezaRes = await ctx.request.post(`${BASE}/api/proposals/copy`, {
  data: { ...copyBase, target: "pieza", tone: "formal", angle: "ahorro", instructions: "mencioná el 20%" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const pieza = (await piezaRes.json().catch(() => ({})))?.copy ?? {};
check(
  "3. escribir la PIEZA con tono formal + concepto ahorro",
  piezaRes.status() === 200 && String(pieza.title).startsWith("[formal/ahorro]") && String(pieza.body).length > 0,
  `${piezaRes.status()} «${String(pieza.title).slice(0, 50)}»`
);
check(
  "4. la pieza trae todos los campos (subtítulo, oferta, beneficio, CTA)",
  Boolean(pieza.subtitle) && Boolean(pieza.offer) && Boolean(pieza.benefit) && Boolean(pieza.ctaLabel),
  `cta=«${pieza.ctaLabel ?? ""}»`
);
check("5. la IA deja una nota interna para el vendedor", Boolean(pieza.notes), String(pieza.notes ?? "").slice(0, 60));

const msgRes = await ctx.request.post(`${BASE}/api/proposals/copy`, {
  data: { ...copyBase, target: "mensaje", tone: "cercana", angle: "beneficio", draftMessage: "Hola TEST IA" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const msg = (await msgRes.json().catch(() => ({})))?.copy ?? {};
check(
  "6. reescribir el MENSAJE de WhatsApp con tono cercano",
  msgRes.status() === 200 &&
    String(msg.message).startsWith("[cercana/beneficio]") &&
    String(msg.message).includes("¡Hola TEST") &&
    msg.title === undefined,
  `«${String(msg.message).slice(0, 60)}…»`
);

const malRes = await ctx.request.post(`${BASE}/api/proposals/copy`, {
  data: { ...copyBase, target: "pieza", tone: "poetico" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("7. tono inválido rechazado", malRes.status() === 400 || malRes.status() === 422, String(malRes.status()));

const sinCliente = await ctx.request.post(`${BASE}/api/proposals/copy`, {
  data: { target: "pieza", tone: "formal", kind: "renovacion" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("8. sin cliente rechazado", sinCliente.status() === 400 || sinCliente.status() === 422, String(sinCliente.status()));

/* ---------- el tono queda guardado en la propuesta ---------- */

const propRes = await ctx.request.post(`${BASE}/api/proposals`, {
  data: {
    kind: "renovacion",
    clientRef: TEST_CLIENT,
    clientName: "TEST IA",
    clientDni: "26322995",
    clientPhone: "3417035515",
    title: `E2E 041c ${stamp}`,
    tone: "formal",
    angle: "ahorro",
  },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const prop = (await propRes.json().catch(() => ({})))?.proposal ?? {};
check(
  "9. la propuesta guarda tono y concepto elegidos",
  propRes.status() === 201 && prop.tone === "formal" && prop.angle === "ahorro",
  `tone=${prop.tone} angle=${prop.angle}`
);

/* ---------- UI: chips en el panel del cliente ---------- */

await page.goto(`${BASE}/dashboard-management`, { waitUntil: "domcontentloaded" });
await page.getByText("Pulso del negocio").first().waitFor({ timeout: 300_000 });
const skip = page.getByRole("button", { name: "Después" });
if (await skip.count()) await skip.first().click().catch(() => {});
check("10. tablero cargado", true);

await page.getByRole("button", { name: /^\s*Cliente 360/ }).first().click();
const searchInput = page.getByPlaceholder("Ej. Juan Pérez, DNI o teléfono");
await searchInput.waitFor({ timeout: 30_000 });
await searchInput.fill("TEST IA");
await page.getByRole("button", { name: "Buscar cliente", exact: true }).first().click();
const panelBtn = page.getByRole("button", { name: "Panel de control" }).first();
await panelBtn.waitFor({ timeout: 240_000 });
await panelBtn.click();
await page.getByText("Métricas del cliente").first().waitFor({ timeout: 60_000 });

await page.getByRole("button", { name: /Crear propuesta comercial/ }).first().click();
const escribeBtn = page.getByRole("button", { name: "Escribir con IA" }).first();
const iaBlockOk = await escribeBtn
  .waitFor({ timeout: 30_000 })
  .then(() => true)
  .catch(() => false);
const tonoVisible = await page.getByText("Tono", { exact: true }).first().isVisible().catch(() => false);
const conceptoVisible = await page.getByText("Concepto de venta").first().isVisible().catch(() => false);
check("11. bloque «Escribir con IA» visible (tono + concepto de venta)", iaBlockOk && tonoVisible && conceptoVisible);

const formalBtn = page.getByRole("button", { name: "Formal", exact: true }).first();
const ahorroBtn = page.getByRole("button", { name: "Ahorro", exact: true }).first();
await formalBtn.click();
await ahorroBtn.click();
const pressedFormal = await formalBtn.getAttribute("aria-pressed");
const pressedAhorro = await ahorroBtn.getAttribute("aria-pressed");
check("12. se eligen tono Formal y concepto Ahorro (aria-pressed)", pressedFormal === "true" && pressedAhorro === "true");

const titleInput = page.getByPlaceholder("Título").first();
// El prefill de la plantilla llega async: esperar a que el título tenga texto
// (si no, «before» sale vacío y el Deshacer compara contra nada).
let before = "";
for (let i = 0; i < 40; i++) {
  before = await titleInput.inputValue();
  if (before.trim() !== "") break;
  await page.waitForTimeout(500);
}
await escribeBtn.click();
const escrito = await page
  .waitForFunction(
    () => {
      const el = document.querySelector('input[placeholder="Título"]');
      return Boolean(el && el.value.startsWith("[formal/ahorro]"));
    },
    null,
    { timeout: 90_000 }
  )
  .then(() => true)
  .catch(() => false);
check("13. «Escribir con IA» reescribe la pieza con el tono elegido", escrito);

const undoBtn = page.getByRole("button", { name: "Deshacer" }).first();
const undoVisible = await undoBtn
  .waitFor({ state: "visible", timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
if (undoVisible) {
  await undoBtn.click().catch(() => {});
  await page.waitForTimeout(700);
}
const restaurado = (await titleInput.inputValue()) === before;
check("14. «Deshacer» restaura el texto anterior", undoVisible && restaurado, `«${before.slice(0, 40)}»`);

/* ---------- UI: la previa de WhatsApp también se reescribe por tono ---------- */

await page.getByRole("button", { name: "Generar propuesta" }).first().click();
const previewBtn = page.getByRole("button", { name: /Enviar por WhatsApp/ }).first();
const previewOk = await previewBtn
  .waitFor({ timeout: 90_000 })
  .then(() => true)
  .catch(() => false);
check("15. propuesta generada (aparece la previa de WhatsApp)", previewOk);
if (previewOk) {
  await previewBtn.click();
  const draft = page.getByLabel("Mensaje para WhatsApp");
  await draft.waitFor({ timeout: 30_000 });
  // En la previa, el chip «Cercana y natural» es el segundo del DOM (el primero
  // es el del formulario, que sigue visible arriba).
  const chips = page.getByRole("button", { name: "Cercana y natural", exact: true });
  const chipPrevia = chips.nth((await chips.count()) - 1);
  await chipPrevia.click();
  const reescrito = await page
    .waitForFunction(
      () => {
        const el = document.querySelector('textarea[aria-label="Mensaje para WhatsApp"]');
        return Boolean(el && el.value.startsWith("[cercana/"));
      },
      null,
      { timeout: 90_000 }
    )
    .then(() => true)
    .catch(() => false);
  const valor = await draft.inputValue();
  check(
    "16. en la previa, tocar «Cercana y natural» reescribe el mensaje",
    reescrito && valor.includes("¡Hola ") && valor.includes("/p/"),
    `«${valor.slice(0, 60)}…»`
  );
}

check("17. sin errores de consola", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

await browser.close();
console.log(`\nE2E 041c: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
