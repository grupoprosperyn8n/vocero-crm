/* Verificación visual Bloque 2A/2B — pestañas En curso/Cerradas y filtro por
   etiqueta en el archivo. Login real en browser y asserts del DOM.
   Uso: node scripts/e2e-2b-archivo-ui.mjs */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const ENV_FILE = process.env.E2E_ENV_FILE ?? ".env.local";
const envLocal = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const ADMIN_KEY = envOf("ADMIN_API_KEY");
const BOT_KEY = envOf("BOT_API_KEY");
if (!ADMIN_KEY || !BOT_KEY) {
  console.error("faltan ADMIN_API_KEY/BOT_API_KEY en " + ENV_FILE);
  process.exit(1);
}
const stamp = Date.now();
const email = `e2e-2b-${stamp}@router.test`;
const PASS = "E2E-2B-2026!";
const NAME = `E2E 2B ${stamp}`;

let pass = 0;
let fail = 0;
const check = (n, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "ok  " : "FAIL"} - ${n}${extra ? " | " + extra : ""}`);
};

async function api(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// 0) empleado de prueba
const alta = await api("/api/admin/users", {
  method: "PUT",
  headers: { "x-admin-key": ADMIN_KEY },
  body: { email, name: NAME, password: PASS, role: "member" },
});
check("alta empleado", alta.status === 201 || alta.json?.created === false, String(alta.status));

// 1) browser + login por API (deja la sesión en el contexto)
const ctx = await chromium.launchPersistentContext(`/tmp/pw-2b-profile-${stamp}`, {
  headless: true,
});
const login = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email, password: PASS },
});
check("login por API", login.status() === 200, String(login.status()));

// 2) tres convs cerradas: con etiqueta A, con etiqueta B, sin etiqueta
const mkClosed = async (suffix, topic) => {
  const externalId = `54977${String(stamp % 1000000).padStart(6, "0")}${suffix}`;
  const r = await api("/api/bot/inbound", {
    method: "POST",
    headers: { "x-api-key": BOT_KEY },
    body: {
      channel: "whatsapp",
      externalId,
      profileName: `${NAME} ${suffix}`,
      text: `hola ${suffix}`,
      eventId: `2b-${stamp}-${suffix}`,
    },
  });
  const id = r.json?.conversationId;
  if (id && topic) {
    await ctx.request.patch(`${BASE}/api/conversations/${id}`, { data: { topic } });
  }
  if (id) {
    await ctx.request.patch(`${BASE}/api/conversations/${id}`, { data: { close: true } });
  }
  return id;
};
const idA = await mkClosed("1", "cotizacion");
const idB = await mkClosed("2", "siniestro");
const idC = await mkClosed("3", null);
check("3 convs cerradas sembradas", !!idA && !!idB && !!idC, `${idA} ${idB} ${idC}`);

// 3) abrir la bandeja
const page = await ctx.newPage();
await page.goto(`${BASE}/inbox`);
await page.waitForTimeout(2500);

// 3a) En curso: tiene Todas/No leídas y NO tiene el select de etiqueta del archivo
const enCursoBtn = page.getByRole("button", { name: /^En curso/ });
check("tab En curso visible", (await enCursoBtn.count()) > 0);
check("cerradas-tab visible", (await page.getByRole("button", { name: /Cerradas/ }).count()) > 0);
check(
  "En curso: botón No leídas presente",
  (await page.getByRole("button", { name: /No leídas/ }).count()) > 0
);
check(
  "En curso: sin select de etiqueta del archivo",
  (await page.locator('select[aria-label="Filtrar por etiqueta"]').count()) === 0
);

// 4) pasar a Cerradas
await page.getByRole("button", { name: /Cerradas/ }).click();
await page
  .waitForFunction(
    (t) => Array.from(document.querySelectorAll("li")).some((li) => li.textContent.includes(t)),
    `${NAME} 1`,
    { timeout: 10000 }
  )
  .catch(() => {});
check("Cerradas: lista cargada con la conv sembrada", (await page.locator(`li:has-text("${NAME} 1")`).count()) > 0);

// 4a) en el archivo: filtro por etiqueta presente, Todas/No leídas NO
const sel = page.locator('select[aria-label="Filtrar por etiqueta"]');
check("archivo: select 'Filtrar por etiqueta' presente", (await sel.count()) === 1);
check(
  "archivo: sin botones de cola (Todas/No leídas)",
  (await page.getByRole("button", { name: /No leídas/ }).count()) === 0
);

const optionTexts = await sel
  .evaluateAll((els) => els.flatMap((el) => Array.from(el.options).map((o) => o.textContent.trim())))
  .catch(() => []);
check(
  "archivo: opciones Toda etiqueta / Sin etiqueta / Cotización / Siniestro",
  optionTexts.includes("Toda etiqueta") &&
    optionTexts.some((t) => /^Sin etiqueta \(\d+\)$/.test(t)) &&
    optionTexts.includes("Cotización") &&
    optionTexts.some((t) => t.startsWith("Siniestro")),
  JSON.stringify(optionTexts)
);

// 5) filtrar por etiqueta cotizacion → solo la A
await sel.selectOption("cotizacion");
await page.waitForTimeout(400);
check(
  "filtro cotización: A visible, B y C no",
  (await page.locator(`li:has-text("${NAME} 1")`).count()) > 0 &&
    (await page.locator(`li:has-text("${NAME} 2")`).count()) === 0 &&
    (await page.locator(`li:has-text("${NAME} 3")`).count()) === 0
);

// 6) sin etiqueta → solo la C
await sel.selectOption("untagged");
await page.waitForTimeout(400);
check(
  "filtro Sin etiqueta: C visible, A y B no",
  (await page.locator(`li:has-text("${NAME} 3")`).count()) > 0 &&
    (await page.locator(`li:has-text("${NAME} 1")`).count()) === 0 &&
    (await page.locator(`li:has-text("${NAME} 2")`).count()) === 0
);

// 7) volver a Toda etiqueta → las tres
await sel.selectOption("all");
await page.waitForTimeout(400);
check(
  "Toda etiqueta: las 3 visibles",
  (await page.locator(`li:has-text("${NAME} 1")`).count()) > 0 &&
    (await page.locator(`li:has-text("${NAME} 2")`).count()) > 0 &&
    (await page.locator(`li:has-text("${NAME} 3")`).count()) > 0
);

// 8) volver a En curso → vuelven los filtros de cola
await page.getByRole("button", { name: /^En curso/ }).click();
await page.waitForTimeout(800);
check(
  "de vuelta en En curso: No leídas presente",
  (await page.getByRole("button", { name: /No leídas/ }).count()) > 0
);

await ctx.close();
const del = await api(`/api/admin/users?email=${encodeURIComponent(email)}`, {
  method: "DELETE",
  headers: { "x-admin-key": ADMIN_KEY },
});
check("limpieza empleado", del.status === 200, String(del.status));
console.log(`\n2B UI: ${pass} ok / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
