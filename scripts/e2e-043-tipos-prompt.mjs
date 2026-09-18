// e2e 043 — TIPOS DE ACCIÓN COMERCIAL ADMINISTRABLES + GUÍA DEL ASISTENTE:
//   · el catálogo trae los 7 tipos (renovación… + captación + lanzamiento)
//   · se CREA un tipo propio (nombre visible + guía/system prompt)
//   · una publicidad de ese tipo se crea, publica y escribe con IA (la guía
//     la resuelve el SERVIDOR: nunca se acepta del navegador)
//   · un tipo propio NO se borra si hay publicidades usándolo; los del
//     catálogo no se borran nunca; el equipo (member) no administra
//
// Uso: node scripts/e2e-043-tipos-prompt.mjs     (dev 3001)
// Seguridad: escribe SOLO sobre el perfil TEST IA.
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
const EMAIL_OWNER = `e2e-043-${stamp}@test.local`;
const EMAIL_MEMBER = `e2e-043-m-${stamp}@test.local`;
const PASS = "E2E-043-2026!";
const CUSTOM_KIND = `tipo_e2e_${stamp}`;

const mk = async (email, name, role) => {
  const res = await fetch(`${BASE}/api/admin/users`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY ?? "" },
    body: JSON.stringify({ email, name, password: PASS, role }),
  });
  return res.status;
};
const sOwner = await mk(EMAIL_OWNER, `E2E 043 ${stamp}`, "owner");
const sMember = await mk(EMAIL_MEMBER, `E2E 043 Colab ${stamp}`, "member");
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

/* ---------- el catálogo de tipos ---------- */

const t0Res = await ctx.request.get(`${BASE}/api/proposals/templates`);
const t0 = (await t0Res.json().catch(() => ({})))?.templates ?? [];
const ids = t0.map((t) => t.kind);
const CATALOG = ["renovacion", "retencion", "venta_cruzada", "reactivacion", "fidelizacion", "captacion", "lanzamiento"];
check(
  "3. catálogo de 7 tipos: los clásicos + captación + lanzamiento",
  t0Res.status() === 200 && CATALOG.every((k) => ids.includes(k)),
  ids.join(",")
);
check(
  "4. cada tipo trae su NOMBRE y su GUÍA (campos nuevos)",
  t0.every((t) => "label" in t && "aiPrompt" in t) && t0.length >= 7,
  `${t0.length} tipos`
);

/* ---------- crear un tipo propio con su guía ---------- */

const GUIDE = "Actuá como experto en marketing y asesor de seguros para PRUEBAS E2E: una sola idea, sin inventar datos.";
const putRes = await ctx.request.put(`${BASE}/api/proposals/templates`, {
  data: { kind: CUSTOM_KIND, label: "Tipo E2E", aiPrompt: GUIDE, title: "Prueba de tipo propio", body: "Cuerpo de prueba." },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const putTpl = (await putRes.json().catch(() => ({})))?.template;
check(
  "5. crear un tipo propio con nombre + guía",
  putRes.status() === 200 && putTpl?.kind === CUSTOM_KIND && putTpl?.label === "Tipo E2E" && putTpl?.aiPrompt === GUIDE,
  `${putRes.status()} «${putTpl?.label}»`
);

const t1 = ((await (await ctx.request.get(`${BASE}/api/proposals/templates`)).json().catch(() => ({})))?.templates ?? []);
const custom = t1.find((t) => t.kind === CUSTOM_KIND);
check(
  "6. el tipo propio aparece en el catálogo (y respeta la guía cargada)",
  Boolean(custom) && custom.label === "Tipo E2E" && custom.aiPrompt === GUIDE,
  `total=${t1.length}`
);

const badSlug = await ctx.request.put(`${BASE}/api/proposals/templates`, {
  data: { kind: "Tipo Con Espacios", label: "x" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("7. slug inválido rechazado (solo minúsculas/números/_)", badSlug.status() === 400, String(badSlug.status()));

/* ---------- una publicidad con el tipo propio ---------- */

const propRes = await ctx.request.post(`${BASE}/api/proposals`, {
  data: {
    kind: CUSTOM_KIND,
    clientRef: TEST_CLIENT,
    clientName: "TEST IA",
    clientDni: "26322995",
    clientPhone: "3417035515",
    title: `E2E 043 tipo propio ${stamp}`,
    benefit: "Prueba de acción comercial propia",
  },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const prop = (await propRes.json().catch(() => ({})))?.proposal;
check(
  "8. publicidad creada con el tipo propio",
  propRes.status() === 201 && prop?.kind === CUSTOM_KIND && typeof prop?.token === "string",
  `${propRes.status()} kind=${prop?.kind}`
);

const pub = await ctx.request.get(`${BASE}/p/${prop?.token}`);
const pubText = await pub.text().catch(() => "");
check(
  "9. la página pública del tipo propio se genera",
  pub.status() === 200 && pubText.includes(`E2E 043 tipo propio ${stamp}`),
  `${pub.status()}`
);

/* ---------- la IA escribe con la guía del tipo (servidor) ---------- */

const copyRes = await ctx.request.post(`${BASE}/api/proposals/copy`, {
  data: {
    clientName: "TEST IA",
    kind: CUSTOM_KIND,
    target: "pieza",
    tone: "cercana",
    angle: "beneficio",
    // Se manda una guía del navegador: el servidor la IGNORA y usa la del tipo.
    kindPrompt: "GUÍA FALSA DEL NAVEGADOR",
  },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const copy = (await copyRes.json().catch(() => ({})))?.copy ?? {};
check(
  "10. la IA escribe para el tipo propio (guía resuelta por el servidor)",
  copyRes.status() === 200 && String(copy.title ?? "").length > 0,
  `${copyRes.status()} «${String(copy.title).slice(0, 44)}»`
);

const copyRaro = await ctx.request.post(`${BASE}/api/proposals/copy`, {
  data: { clientName: "TEST IA", kind: "tipo_sin_plantilla", target: "pieza", tone: "cercana" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("11. un tipo sin guía propia cae en la genérica (no rompe)", copyRaro.status() === 200, String(copyRaro.status()));

/* ---------- administración: permisos y guardas ---------- */

const memPut = await ctxMember.request.put(`${BASE}/api/proposals/templates`, {
  data: { kind: CUSTOM_KIND, label: "Hackeado" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("12. el colaborador no puede editar tipos (403)", memPut.status() === 403, String(memPut.status()));

const memDel = await ctxMember.request.delete(`${BASE}/api/proposals/templates`, {
  data: { kind: CUSTOM_KIND },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("13. el colaborador no puede eliminar tipos (403)", memDel.status() === 403, String(memDel.status()));

const inUse = await ctx.request.delete(`${BASE}/api/proposals/templates`, {
  data: { kind: CUSTOM_KIND },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("14. no se borra un tipo con publicidades usándolo (422)", inUse.status() === 422, String(inUse.status()));

const baseDel = await ctx.request.delete(`${BASE}/api/proposals/templates`, {
  data: { kind: "renovacion" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("15. los tipos del catálogo no se eliminan (400)", baseDel.status() === 400, String(baseDel.status()));

/* ---------- la UI de Ajustes → Propuestas ---------- */

await page.goto(`${BASE}/settings/propuestas`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /Nuevo tipo/ }).waitFor({ timeout: 20_000 }).catch(() => null);
const uiBody1 = await page.locator("body").innerText();
check(
  "16. Ajustes → Propuestas: catálogo + «Nuevo tipo» + guía por tipo",
  uiBody1.includes("Renovación") &&
    uiBody1.includes("Lanzamiento de producto") &&
    uiBody1.includes("Nuevo tipo") &&
    uiBody1.includes("Guía del asistente")
);

await page.getByRole("button", { name: /Nuevo tipo/ }).click();
await page.getByPlaceholder(/Nombre del tipo/).fill("Tipo UI E2E");
await page.getByRole("button", { name: "Crear", exact: true }).click();
await page.waitForTimeout(400);
const uiBody2 = await page.locator("body").innerText();
check(
  "17. el tipo se crea desde la UI y queda seleccionado",
  uiBody2.includes("Tipo UI E2E") && uiBody2.includes("tipo_ui_e2e"),
  ""
);

await page.getByRole("button", { name: /Usar la sugerida/ }).click();
await page.waitForTimeout(200);
const guideVal = await page.locator("textarea").nth(1).inputValue().catch(() => "");
await page.getByRole("button", { name: /^Guardar/ }).click();
const savedOk = await page
  .getByText("✓ Guardado")
  .waitFor({ timeout: 8000 })
  .then(() => true)
  .catch(() => false);
const uiBody3 = await page.locator("body").innerText();
check(
  "18. «Usar la sugerida» carga la guía y Guardar confirma",
  guideVal.includes("marketing") && (savedOk || uiBody3.includes("✓ Guardado")),
  `guia=${guideVal.includes("marketing")} saved=${savedOk || uiBody3.includes("✓ Guardado")}`
);

/* ---------- limpieza ---------- */

const delProp = await ctx.request.post(`${BASE}/api/proposals/${prop.id}/lifecycle`, {
  data: { action: "delete" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const delKind = await ctx.request.delete(`${BASE}/api/proposals/templates`, {
  data: { kind: CUSTOM_KIND },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const t2 = ((await (await ctx.request.get(`${BASE}/api/proposals/templates`)).json().catch(() => ({})))?.templates ?? []);
const delUi = await ctx.request.delete(`${BASE}/api/proposals/templates`, {
  data: { kind: "tipo_ui_e2e" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check(
  "19. limpieza: publicidad, tipo propio y tipo de UI eliminados",
  delProp.status() === 200 && delKind.status() === 200 && delUi.status() === 200 && !t2.some((t) => t.kind === CUSTOM_KIND),
  `${delProp.status()}/${delKind.status()}/${delUi.status()}`
);

for (const email of [EMAIL_OWNER, EMAIL_MEMBER]) {
  await fetch(`${BASE}/api/admin/users?email=${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: { "x-admin-key": ADMIN_KEY ?? "" },
  });
}

const errTrasLimpieza = consoleErrors.filter((e) => !/sign-in|401/.test(e)).slice(0, 3);
check("20. sin errores de consola (fuera de auth)", errTrasLimpieza.length === 0, errTrasLimpieza.join(" | ").slice(0, 220));

await ctxMember.close();
await browser.close();

console.log(`\n${pass} PASS · ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
