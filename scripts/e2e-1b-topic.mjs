/* Verificación visual del micro-bloque 1B (bandeja con topic) — solo localhost:3001 de prueba.
   Login por API, abre la conversación web de la prueba 1A y verifica el DOM del
   clasificador de topic + el filtro + el chip de la lista. Al final deja la
   conversación con topic=cotizacion (como estaba). */
import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const CONTACT_ID = "ct_dm452zs5whq5iganbbv2";
const EMAIL = "diego1a@test.local";
const PASS = "Prueba-1A-2026!";

const ctx = await chromium.launchPersistentContext("/tmp/pw-1b-profile", {
  headless: true,
});
const page = await ctx.newPage();
const resp = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: EMAIL, password: PASS },
});
console.log("login:", resp.status());

await page.goto(`${BASE}/inbox?contact=${CONTACT_ID}`);
await page.waitForTimeout(3000);

const estado = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const header = q('select[aria-label="Clasificar el tema de la consulta"]');
  const filtro = q('select[aria-label="Filtrar por tema de la consulta"]');
  const chips = Array.from(document.querySelectorAll("span[title]"))
    .map((e) => e.getAttribute("title"))
    .filter((t) => t && t.length < 60 && t !== "WhatsApp" && t !== "Instagram" && t !== "Messenger" && t !== "Web");
  const nombreVisible = document.body.innerText.includes("Diego Test");
  return {
    headerTopicValue: header ? header.value : null,
    headerTopicLabel: header
      ? header.options[header.selectedIndex]?.textContent?.trim()
      : null,
    filtroTopicValue: filtro ? filtro.value : null,
    filtroOpciones: filtro
      ? Array.from(filtro.options).map((o) => o.textContent?.trim())
      : null,
    chipsEnLista: chips,
    nombreVisible,
  };
});
console.log(JSON.stringify(estado, null, 1));

// Interacción real: cambio de topic desde el select del header
const sel = page.locator('select[aria-label="Clasificar el tema de la consulta"]');
if (await sel.count()) {
  await sel.selectOption("siniestro");
  await page.waitForTimeout(2500);
  const trasCambio = await sel.inputValue();
  console.log("tras PATCH a siniestro, el select vale:", trasCambio);
  // Devolver a cotizacion (estado original de la prueba)
  await sel.selectOption("cotizacion");
  await page.waitForTimeout(1500);
  console.log("restaurado a:", await sel.inputValue());

  // Filtro de la lista: cotizacion deja solo la conversacion web (1 chip);
  // "sin topic" deja solo las 8 de la demo (0 chips de Cotizacion + Ana visible).
  const filtro = page.locator('select[aria-label="Filtrar por tema de la consulta"]');
  await filtro.selectOption("cotizacion");
  await page.waitForTimeout(800);
  console.log("con filtro=cotizacion, chips en lista:", await page.locator('span[title="Cotización"]').count());
  await filtro.selectOption("untagged");
  await page.waitForTimeout(800);
  const trasUntagged = await page.evaluate(() => ({
    chipsCotizacion: document.querySelectorAll('span[title="Cotización"]').length,
    anaVisible: document.body.innerText.includes("Ana Sofía"),
    diegoEnLista: document.body.innerText.includes("Diego Test"),
  }));
  console.log(
    "con filtro=sin-topic -> chips Cotizacion:",
    trasUntagged.chipsCotizacion,
    "| Ana (Ferretería) visible:",
    trasUntagged.anaVisible,
    "| Diego solo en header (lista oculta):",
    trasUntagged.diegoEnLista
  );
  await filtro.selectOption("all");
  await page.waitForTimeout(500);
  console.log("filtro restaurado a all");
} else {
  console.log("NO HAY select de clasificación en el header");
}

await ctx.close();
