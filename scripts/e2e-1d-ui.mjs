/* Verificación visual del Bloque 1D — chip "A cargo" en la bandeja.
   Login real en browser (abre el SSE -> presencia), handoff y assert del DOM.
   Uso: node scripts/e2e-1d-ui.mjs */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:3001";
const envLocal = fs.existsSync(".env.local")
  ? fs.readFileSync(".env.local", "utf8")
  : "";
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const ADMIN_KEY = envOf("ADMIN_API_KEY") ?? "test-admin-key-1c-2026-abcdef";
const BOT_KEY = envOf("BOT_API_KEY");
const ORIGIN = envOf("APP_BASE_URL") ?? BASE;
const stamp = Date.now();
const email = `e2e-ui-${stamp}@router.test`;
const PASS = "Router-UI-2026!";
const NAME = "Router UI";

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
      origin: ORIGIN,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const alta = await api("/api/admin/users", {
  method: "PUT",
  headers: { "x-admin-key": ADMIN_KEY },
  body: { email, name: NAME, password: PASS, role: "member" },
});
check("alta empleado", alta.status === 201 && alta.json?.created === true, String(alta.status));

const ctx = await chromium.launchPersistentContext("/tmp/pw-1d-profile", {
  headless: true,
});
const page = await ctx.newPage();
const login = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email, password: PASS },
});
check("login por API", login.status() === 200, String(login.status()));
await page.goto(`${BASE}/inbox`);
// Espera a que el SSE de la bandeja esté vivo (presencia registrada).
await page.waitForTimeout(2500);

// Conversación web fresca + handoff con el empleado online.
const s = await api("/api/public/web/session", { method: "POST" });
const label = `Cliente UI ${stamp}`;
await api("/api/public/web/messages", {
  method: "POST",
  body: { sessionId: s.json.sessionId, text: "Hola", profileName: label },
});
let convId = null;
for (let i = 0; i < 15 && !convId; i++) {
  const list = await ctx.request.get(`${BASE}/api/conversations`);
  const c = ((await list.json().catch(() => null))?.conversations ?? []).find(
    (x) => x.contact.name === label
  );
  if (c) convId = c.id;
  else await new Promise((r) => setTimeout(r, 250));
}
check("conversación web creada", !!convId, convId ?? "null");

if (convId) {
  const h = await api("/api/bot/handoff", {
    method: "POST",
    headers: { "x-api-key": BOT_KEY },
    body: { conversationId: convId, topic: "cotizacion" },
  });
  check("handoff ok", h.status === 200, String(h.status));
  // El SSE pinta la asignación en vivo: espera y lee el DOM.
  await page.waitForTimeout(3000);
  const chip = await page.evaluate(() => {
    const span = document.querySelector('span[title*="A cargo de"]');
    return span ? { title: span.getAttribute("title"), text: span.textContent } : null;
  });
  check(
    "chip 'A cargo' visible en la bandeja",
    !!chip && chip.text.includes(NAME),
    JSON.stringify(chip)
  );
  const badges = await page.evaluate(() =>
    Array.from(document.querySelectorAll("span")).filter(
      (s) => s.textContent.includes("Atención humana") && s.className.includes("warning")
    ).length
  );
  console.log(`(badges 'Atención humana' sin asignar visibles: ${badges} — las no asignadas siguen marcadas)`);
}

await ctx.close();
const del = await api(
  `/api/admin/users?email=${encodeURIComponent(email)}`,
  { method: "DELETE", headers: { "x-admin-key": ADMIN_KEY } }
);
check("limpieza empleado", del.status === 200 && del.json?.removed === true, String(del.status));
console.log(`\nRESULTADO: ${pass} ok / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
