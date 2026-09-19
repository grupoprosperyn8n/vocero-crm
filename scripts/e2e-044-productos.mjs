// e2e 044 — «TIPO DE PRODUCTO» CONECTADO A LA TABLA PRODUCTOS DEL SISTEMA +
// MINI TABLA DE PRODUCTOS PROPIOS DEL CRM (042f):
//   · el menú de productos trae la tabla PRODUCTOS del sistema (Airtable,
//     solo lectura) Y los productos propios del CRM, sin mezclar bases
//   · se crea/edita/borra un producto propio; duplicados y nombres cortos
//     se rechazan; el colaborador lee pero no administra
//   · la publicidad guarda el VÍNCULO (productRef) al producto elegido y
//     la edición de textos lo audita («vínculo de producto»)
//   · UI: la mini tabla en Ajustes → Propuestas (crear desde la pantalla) y
//     el menú desplegable en el panel de la publicidad del Cliente 360°
//
// Uso: node scripts/e2e-044-productos.mjs     (dev 3001)
// Seguridad: crea y borra SOLO datos de prueba propios; la única lectura de
// Airtable es la de productos del sistema.
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
const EMAIL_OWNER = `e2e-044-${stamp}@test.local`;
const EMAIL_MEMBER = `e2e-044-m-${stamp}@test.local`;
const PASS = "E2E-044-2026!";
const PROD_NAME = `Producto E2E ${stamp}`;
const PROD_UI_NAME = `Producto UI ${stamp}`;

const mk = async (email, name, role) => {
  const res = await fetch(`${BASE}/api/admin/users`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY ?? "" },
    body: JSON.stringify({ email, name, password: PASS, role }),
  });
  return res.status;
};
const sOwner = await mk(EMAIL_OWNER, `E2E 044 ${stamp}`, "owner");
const sMember = await mk(EMAIL_MEMBER, `E2E 044 Colab ${stamp}`, "member");
check("1. usuarios temporales (owner + colaborador)", sOwner === 201 && sMember === 201, `${sOwner}/${sMember}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const ctxMember = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url ?? "";
  if (/\/api\/avatars\//.test(url)) return;
  consoleErrors.push(`${m.text().slice(0, 140)} @ ${url}`.slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`.slice(0, 200)));

const loginRetry = async (reqCtx, email) => {
  for (let i = 0; i < 4; i++) {
    const res = await reqCtx.post(`${BASE}/api/auth/sign-in/email`, {
      data: { email, password: PASS },
      headers: { origin: ORIGIN, "content-type": "application/json" },
    });
    if (res.status() !== 429) return res;
    console.log(`  (login 429 — espero 70 s, intento ${i + 2})`);
    await new Promise((r2) => setTimeout(r2, 70_000));
  }
  return reqCtx.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email, password: PASS },
    headers: { origin: ORIGIN, "content-type": "application/json" },
  });
};

const loginOwner = await loginRetry(ctx.request, EMAIL_OWNER);
const loginMember = await loginRetry(ctxMember.request, EMAIL_MEMBER);
check("2. login owner + colaborador", loginOwner.status() === 200 && loginMember.status() === 200, `${loginOwner.status()}/${loginMember.status()}`);

/* ---------- el menú de productos: sistema + CRM ---------- */

const p0Res = await ctx.request.get(`${BASE}/api/proposals/products`);
const p0 = (await p0Res.json().catch(() => ({}))) ?? {};
const opts0 = p0.products ?? [];
check(
  "3. GET productos: responde la lista y el estado del sistema",
  p0Res.status() === 200 && Array.isArray(opts0) && typeof p0.systemOk === "boolean",
  `${opts0.length} productos · systemOk=${p0.systemOk}`
);

const sys = opts0.filter((p) => p.source === "sistema");
const sysOkRefs = sys.every((p) => /^rec/.test(p.ref));
check(
  "4. los productos del SISTEMA vienen de la tabla PRODUCTOS (refs de Airtable)",
  p0.systemOk === true && sysOkRefs,
  `${sys.length} del sistema`
);

const firstCrm = opts0.findIndex((p) => p.source === "crm");
const lastSys = opts0.map((p) => p.source).lastIndexOf("sistema");
check(
  "5. orden del menú: primero el sistema, después los del CRM",
  firstCrm === -1 || lastSys === -1 || lastSys < firstCrm,
  `sys=${sys.length} crm=${opts0.length - sys.length}`
);

/* ---------- crear un producto propio del CRM ---------- */

const crear = await ctx.request.post(`${BASE}/api/proposals/products`, {
  data: { name: PROD_NAME, icon: "🧪" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const creado = ((await crear.json().catch(() => ({}))) ?? {}).product;
const PROD_REF = creado?.id ?? "";
check(
  "6. crear producto propio del CRM (201, source crm)",
  crear.status() === 201 && /^prd_/.test(PROD_REF) && creado?.icon === "🧪",
  `${crear.status()} ${PROD_REF}`
);

const p1 = ((await (await ctx.request.get(`${BASE}/api/proposals/products`)).json().catch(() => ({}))) ?? {});
const enMenu = (p1.products ?? []).some((p) => p.ref === PROD_REF && p.source === "crm" && p.name === PROD_NAME);
check("7. el producto nuevo aparece en el menú (junto a los del sistema)", enMenu === true);

const dup = await ctx.request.post(`${BASE}/api/proposals/products`, {
  data: { name: PROD_NAME },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("8. duplicado rechazado (409)", dup.status() === 409, String(dup.status()));

const corto = await ctx.request.post(`${BASE}/api/proposals/products`, {
  data: { name: "X" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("9. nombre muy corto rechazado (400/422)", corto.status() === 400 || corto.status() === 422, String(corto.status()));

const PROD_NAME_2 = `${PROD_NAME} v2`;
const ren = await ctx.request.put(`${BASE}/api/proposals/products`, {
  data: { id: PROD_REF, name: PROD_NAME_2, icon: "🧪" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const renOk = ((await ren.json().catch(() => ({}))) ?? {}).product?.name === PROD_NAME_2;
check("10. el producto propio se renombra (PUT)", ren.status() === 200 && renOk, String(ren.status()));

/* ---------- permisos ---------- */

const memberGet = await ctxMember.request.get(`${BASE}/api/proposals/products`);
check("11. el colaborador puede LEER el menú de productos (200)", memberGet.status() === 200, String(memberGet.status()));

const memberPost = await ctxMember.request.post(`${BASE}/api/proposals/products`, {
  data: { name: `Hackeo ${stamp}` },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("12. el colaborador no puede crear productos (403)", memberPost.status() === 403, String(memberPost.status()));

const memberDel = await ctxMember.request.delete(`${BASE}/api/proposals/products`, {
  data: { id: PROD_REF },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("13. el colaborador no puede borrar productos (403)", memberDel.status() === 403, String(memberDel.status()));

/* ---------- la publicidad guarda el vínculo al producto ---------- */

const propRes = await ctx.request.post(`${BASE}/api/proposals`, {
  data: {
    kind: "renovacion",
    clientRef: TEST_CLIENT,
    clientName: "TEST IA",
    title: "Prueba de producto vinculado",
    body: "Cuerpo de prueba 044.",
    productName: PROD_NAME_2,
    productRef: PROD_REF,
  },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const prop = ((await propRes.json().catch(() => ({}))) ?? {}).proposal;
check(
  "14. la publicidad creada conserva el vínculo (productRef)",
  (propRes.status() === 200 || propRes.status() === 201) &&
    prop?.productRef === PROD_REF &&
    prop?.productName === PROD_NAME_2,
  `${propRes.status()}`
);

const verRes = await ctx.request.get(`${BASE}/api/proposals/${prop?.id}`);
const ver = ((await verRes.json().catch(() => ({}))) ?? {}).proposal;
check("15. el detalle de la publicidad trae producto + vínculo", verRes.status() === 200 && ver?.productRef === PROD_REF, String(verRes.status()));

const patch = await ctx.request.patch(`${BASE}/api/proposals/${prop?.id}`, {
  data: { productName: `${PROD_NAME_2} (editado)`, productRef: null },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const eventos = ((await (await ctx.request.get(`${BASE}/api/proposals/${prop?.id}/events`)).json().catch(() => ({}))) ?? {}).events ?? [];
const auditado = eventos.some((e) => JSON.stringify(e).includes("vínculo de producto"));
check(
  "16. editar el producto queda auditado en el historial",
  patch.status() === 200 && auditado,
  `${patch.status()} auditado=${auditado}`
);

/* ---------- la UI de Ajustes → Propuestas ---------- */

await page.goto(`${BASE}/settings/propuestas`, { waitUntil: "domcontentloaded" });
await page.getByText(/Productos \(mini tabla\)/).waitFor({ timeout: 20_000 }).catch(() => null);
await page.locator("#ajustes-productos option").first().waitFor({ timeout: 20_000 }).catch(() => null);
const uiBody1 = await page.locator("body").innerText();
const datalistAjustes = await page.locator("#ajustes-productos option").count().catch(() => 0);
check(
  "17. Ajustes → Propuestas: aparece la mini tabla y el menú de productos",
  uiBody1.includes("Productos (mini tabla)") && datalistAjustes > 0,
  `${datalistAjustes} opciones`
);

const sysChips = await page.getByText("Sistema", { exact: true }).count().catch(() => 0);
check("18. los del sistema se ven con su etiqueta (solo lectura)", sysChips > 0 || sys.length === 0, `${sysChips} chips· sys=${sys.length}`);

// Crear un producto DESDE la pantalla
await page.getByLabel("Emoji del producto nuevo").fill("🚀");
await page.getByPlaceholder(/Producto nuevo/).fill(PROD_UI_NAME);
await page.getByRole("button", { name: /Agregar/ }).click();
await page.waitForTimeout(1200);
const filasUi = await page.locator('input[aria-label="Nombre del producto"]').count().catch(() => 0);
let uiCreado = false;
for (let i = 0; i < filasUi; i++) {
  const v = await page.locator('input[aria-label="Nombre del producto"]').nth(i).inputValue().catch(() => "");
  if (v === PROD_UI_NAME) uiCreado = true;
}
check("19. el producto se crea desde la mini tabla", uiCreado, `${filasUi} filas CRM`);

/* ---------- el menú en el panel de la publicidad (Cliente 360°) ---------- */

await page.goto(`${BASE}/dashboard-management`, { waitUntil: "domcontentloaded" });
const clientesBtn = page.getByRole("button", { name: /Cliente 360°/ }).first();
await clientesBtn.waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
let panelOk = false;
if (await clientesBtn.isVisible().catch(() => false)) {
  await clientesBtn.click();
  await page.waitForTimeout(2000);
  const searchBox = page.getByPlaceholder(/DNI o tel/i).first();
  await searchBox.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  if (await searchBox.isVisible().catch(() => false)) {
    await searchBox.fill("TEST IA");
    await page.waitForTimeout(3000);
    const panelBtn = page.getByRole("button", { name: /Panel de control/ }).first();
    await panelBtn.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
    if (await panelBtn.isVisible().catch(() => false)) {
      await panelBtn.click();
      await page.waitForTimeout(3000);
      const abrirFlujo = page.getByRole("button", { name: /Crear propuesta comercial/ }).first();
      if (await abrirFlujo.isVisible().catch(() => false)) {
        await abrirFlujo.click();
        await page.waitForTimeout(1500);
      }
      await page.locator("#publicidad-productos option").first().waitFor({ timeout: 20_000 }).catch(() => null);
      const opcionesPanel = await page.locator("#publicidad-productos option").count().catch(() => 0);
      const hint = await page.getByText(/productos: sistema \+ CRM|Producto del sistema|Producto del CRM/).first().isVisible().catch(() => false);
      panelOk = opcionesPanel > 0 && hint;
      check("20. el panel de la publicidad ofrece el menú de productos (sistema + CRM)", panelOk, `${opcionesPanel} opciones`);
    }
  }
}
if (!panelOk) check("20. el panel de la publicidad ofrece el menú de productos (sistema + CRM)", false, "no se llegó al panel");

/* ---------- limpieza ---------- */

const delProd = await ctx.request.delete(`${BASE}/api/proposals/products`, {
  data: { id: PROD_REF },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const p2 = ((await (await ctx.request.get(`${BASE}/api/proposals/products`)).json().catch(() => ({}))) ?? {}).products ?? [];
const uiProd = p2.find((p) => p.name === PROD_UI_NAME);
const delUiProd = uiProd
  ? await ctx.request.delete(`${BASE}/api/proposals/products`, {
      data: { id: uiProd.ref },
      headers: { origin: ORIGIN, "content-type": "application/json" },
    })
  : { status: () => 200 };
const delProp = await ctx.request.post(`${BASE}/api/proposals/${prop?.id}/lifecycle`, {
  data: { action: "delete" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check(
  "21. limpieza: productos de prueba y publicidad eliminados",
  delProd.status() === 200 && delUiProd.status() === 200 && delProp.status() === 200,
  `${delProd.status()}/${delUiProd.status()}/${delProp.status()}`
);

for (const email of [EMAIL_OWNER, EMAIL_MEMBER]) {
  await fetch(`${BASE}/api/admin/users?email=${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: { "x-admin-key": ADMIN_KEY ?? "" },
  });
}

const errTrasLimpieza = consoleErrors.filter((e) => !/sign-in|401/.test(e)).slice(0, 3);
check("22. sin errores de consola (fuera de auth)", errTrasLimpieza.length === 0, errTrasLimpieza.join(" | ").slice(0, 220));

await ctxMember.close();
await browser.close();

console.log(`\n${pass} PASS · ${fail} FAIL`);
