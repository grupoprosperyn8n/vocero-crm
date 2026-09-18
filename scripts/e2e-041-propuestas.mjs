// e2e 041 — PANEL DE CONTROL del cliente (Cliente 360°) + PROPUESTAS:
//   · ficha 360 con métricas y series para las gráficas (lectura real, solo lectura)
//   · propuesta comercial: crear → página pública (sin sesión) → derivar con
//     aviso → enviar → embudo en /api/proposals
//   · UI: botón «Panel de control» en la tarjeta del cliente y pestaña «Propuestas».
//
// Uso: node scripts/e2e-041-propuestas.mjs            (dev 3001)
//      BASE_URL=https://vocero.sistemasagenticos.cloud node scripts/e2e-041-propuestas.mjs
//
// Seguridad: el ciclo de escritura usa SOLO el perfil TEST IA (nunca clientes
// reales); la lectura con datos reales es de solo lectura (sin gestiones).
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const TEST_CLIENT = "rechYRnw7FzaGjfpA"; // TEST IA
const READONLY_CLIENT = process.env.READONLY_CLIENT ?? "recurQlBShR8FXE9L"; // cliente real con póliza (solo lectura)
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
const EMAIL = `e2e-041-${stamp}@test.local`;
const PASS = "E2E-041-2026!";

if (ADMIN_KEY) {
  const alta = await fetch(`${BASE}/api/admin/users`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ email: EMAIL, name: "E2E 041", password: PASS, role: "owner" }),
  });
  check("1. alta owner temporal", alta.status === 201, String(alta.status));
} else {
  check("1. alta owner temporal", false, "sin ADMIN_API_KEY");
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
check("2. login owner", login.status() === 200, String(login.status()));

const session = await ctx.request.get(`${BASE}/api/auth/get-session`);
const sessionData = await session.json().catch(() => null);
const myUserId = sessionData?.user?.id;
check("3. sesión con userId", Boolean(myUserId), myUserId ?? "sin id");

/* ---------------- API: ficha 360 ---------------- */

const fichaRes = await ctx.request.get(`${BASE}/api/clients/ficha?recordId=${TEST_CLIENT}`);
const fichaData = await fichaRes.json().catch(() => ({}));
check("4. ficha TEST IA responde", fichaRes.status() === 200 && fichaData?.ficha?.recordId === TEST_CLIENT, String(fichaRes.status()));
const seriesOk =
  Array.isArray(fichaData?.ficha?.expirationsByMonth) &&
  fichaData.ficha.expirationsByMonth.length === 12 &&
  Array.isArray(fichaData?.ficha?.gestionesByMonth) &&
  fichaData.ficha.gestionesByMonth.length === 12;
check("5. series de 12 meses (vencimientos y gestiones)", seriesOk);

const realRes = await ctx.request.get(`${BASE}/api/clients/ficha?recordId=${READONLY_CLIENT}`);
const realData = await realRes.json().catch(() => ({}));
const realFicha = realData?.ficha;
check(
  "6. ficha con cartera real (lectura)",
  realRes.status() === 200 && Array.isArray(realFicha?.policies) && realFicha.policies.length >= 1,
  `pólizas=${realFicha?.policies?.length ?? 0}`
);
check(
  "7. prima por producto y vencimientos con datos",
  Array.isArray(realFicha?.premiumByProduct) &&
    realFicha.premiumByProduct.length >= 1 &&
    Number(realFicha?.premiumActiva) > 0,
  `productos=${realFicha?.premiumByProduct?.length ?? 0} prima=${realFicha?.premiumActiva ?? 0}`
);

/* ---------------- API: propuesta comercial ---------------- */

const createRes = await ctx.request.post(`${BASE}/api/proposals`, {
  data: {
    kind: "renovacion",
    clientRef: TEST_CLIENT,
    clientName: "TEST IA",
    clientDni: "26322995",
    clientPhone: "3417035515",
    title: `E2E Renovación ${stamp}`,
    benefit: "15% OFF en tu renovación",
    offer: "Renovación con continuidad de cobertura.",
    ctaLabel: "Quiero renovar",
  },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const createData = await createRes.json().catch(() => ({}));
const prop = createData?.proposal;
check("8. crear propuesta", createRes.status() === 201 && Boolean(prop?.id), String(createRes.status()));
check(
  "9. página pública generada",
  typeof prop?.publicUrl === "string" && /^\/p\/[A-Za-z0-9_-]{8,}$/.test(prop.publicUrl),
  prop?.publicUrl ?? ""
);

const pub1 = await ctx.request.get(`${BASE}${prop.publicUrl}`);
const pubHtml = await pub1.text().catch(() => "");
check(
  "10. página pública abre SIN sesión",
  pub1.status() === 200 && pubHtml.includes("TEST IA"),
  String(pub1.status())
);
const anon = await browser.newContext(); // contexto sin cookies: como «cualquier computadora»
const anonRes = await anon.request.get(`${BASE}${prop.publicUrl}`);
check("11. abre desde contexto anónimo", anonRes.status() === 200, String(anonRes.status()));
await anon.close();

const deriveRes = await ctx.request.post(`${BASE}/api/proposals/${prop.id}/derive`, {
  data: { assigneeUserId: myUserId, priority: "alta", note: "e2e 041" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const deriveData = await deriveRes.json().catch(() => ({}));
check(
  "12. derivar con prioridad (aviso al chat)",
  deriveRes.status() === 200 && deriveData?.proposal?.status === "derivada" && deriveData?.proposal?.priority === "alta",
  String(deriveRes.status())
);

const sendRes = await ctx.request.post(`${BASE}/api/proposals/${prop.id}/send`, {
  headers: { origin: ORIGIN },
});
const sendData = await sendRes.json().catch(() => ({}));
check(
  "13. enviar (contacto + conversación garantizados)",
  sendRes.status() === 200 && sendData?.proposal?.status === "enviada" && Boolean(sendData?.proposal?.conversationId),
  `status=${sendData?.proposal?.status} conv=${Boolean(sendData?.proposal?.conversationId)}`
);

const listRes = await ctx.request.get(`${BASE}/api/proposals?clientRef=${TEST_CLIENT}`);
const listData = await listRes.json().catch(() => ({}));
check(
  "14. embudo registra la propuesta",
  listRes.status() === 200 && Number(listData?.funnel?.total) >= 1 && Number(listData?.funnel?.enviada) >= 1,
  JSON.stringify(listData?.funnel ?? {})
);
check(
  "15. vistas registradas en la pieza",
  (listData?.proposals ?? []).some((p) => p.id === prop.id && p.views >= 1),
);

/* ---------------- UI: panel de control y pestaña Propuestas ---------------- */

await page.goto(`${BASE}/dashboard-management`, { waitUntil: "domcontentloaded" });
await page.getByText("Pulso del negocio").first().waitFor({ timeout: 300_000 });
const skip = page.getByRole("button", { name: "Después" });
if (await skip.count()) await skip.first().click().catch(() => {});
check("16. tablero cargado", true);

// Pestaña Propuestas
await page.getByRole("button", { name: /^\s*Propuestas\s*$/ }).first().click();
await page.getByText("Tasa respuesta").first().waitFor({ timeout: 30_000 });
const propRowVisible = await page
  .getByText(`E2E Renovación ${stamp}`)
  .first()
  .waitFor({ timeout: 30_000 })
  .then(() => true)
  .catch(() => false);
check("17. pestaña Propuestas lista (embudo + fila)", propRowVisible);

// Cliente 360° → buscar TEST IA → Panel de control
await page.getByRole("button", { name: /^\s*Cliente 360/ }).first().click();
const searchInput = page.getByPlaceholder("Ej. Juan Pérez, DNI o teléfono");
await searchInput.waitFor({ timeout: 30_000 });
await searchInput.fill("TEST IA");
await page.getByRole("button", { name: "Buscar cliente", exact: true }).first().click();
const panelBtn = page.getByRole("button", { name: "Panel de control" }).first();
await panelBtn.waitFor({ timeout: 240_000 });
await panelBtn.click();
const panelOpened = await page
  .getByText("Métricas del cliente")
  .first()
  .waitFor({ timeout: 60_000 })
  .then(() => true)
  .catch(() => false);
check("18. panel de control abre", panelOpened);

const chartsCount = await page.locator(".recharts-surface").count();
check("19. gráficas renderizadas", chartsCount >= 1, `svg=${chartsCount}`);
const gestionSugerida = await page.getByText("Gestión sugerida").first().isVisible().catch(() => false);
check("20. sección de gestión sugerida", gestionSugerida);
const propSection = await page
  .getByText("Propuestas comerciales del cliente")
  .first()
  .isVisible()
  .catch(() => false);
check("21. sección de propuestas del cliente", propSection);

await page.screenshot({ path: "artifacts/e2e-041-panel.png", fullPage: false }).catch(() => {});
await ctx.close();
await browser.close();

check("22. sin errores de consola", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

console.log(`\n${pass}/${pass + fail} pruebas OK`);
process.exit(fail === 0 ? 0 : 1);
