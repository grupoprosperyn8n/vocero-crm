// e2e 041b — MEJORAS de la segunda ola:
//   · foto de perfil / logo del CRM: se sube CUALQUIER tamaño y formato real
//     (foto de 4000 px, HEIC de iPhone) y se adapta sola (antes: 413 a los 256 KB)
//   · publicación: la imagen se normaliza a WebP ≤1920 px antes de guardar
//   · derivación a EMPLEADO o GRUPO con aviso al chat interno
//   · roles: solo dueño/administrador/gerente derivan; el colaborador recibe 403
//   · seguimiento comercial: /api/proposals/followup (archivo del Cliente 360)
//   · mobile-first: página pública y tablero sin scroll horizontal en celu/tablet
//   · previa de WhatsApp: el adjunto queda cargado en el chat (sin enviar)
//
// Uso: node scripts/e2e-041b-fix-comercial.mjs          (dev 3001)
// Seguridad: el ciclo de escritura usa SOLO el perfil TEST IA.
import crypto from "node:crypto";
import fs from "node:fs";
import { chromium } from "playwright";
import sharp from "sharp";

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
const EMAIL_OWNER = `e2e-041b-${stamp}@test.local`;
const EMAIL_MEMBER = `e2e-041b-m-${stamp}@test.local`;
const PASS = "E2E-041B-2026!";

const mk = async (email, name, role) => {
  const res = await fetch(`${BASE}/api/admin/users`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY ?? "" },
    body: JSON.stringify({ email, name, password: PASS, role }),
  });
  return res.status;
};
const sOwner = await mk(EMAIL_OWNER, `E2E 041b ${stamp}`, "owner");
const sMember = await mk(EMAIL_MEMBER, `E2E 041b Colab ${stamp}`, "member");
check("1. usuarios temporales (owner + colaborador)", sOwner === 201 && sMember === 201, `${sOwner}/${sMember}`);

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
const ses = await ctx.request.get(`${BASE}/api/auth/get-session`);
const myUserId = (await ses.json().catch(() => null))?.user?.id;
check("3. sesión con userId", Boolean(myUserId), myUserId ?? "sin id");

/* ---------- foto real: se sube cualquier tamaño y formato ---------- */

// Foto "de celular": 4000×3000 con ruido real (pesa varios MB, como la de verdad).
const ruido = crypto.randomBytes(3200 * 2400 * 3);
const fotoGrande = await sharp(ruido, { raw: { width: 3200, height: 2400, channels: 3 } })
  .jpeg({ quality: 92 })
  .toBuffer();
check(
  "4. foto de prueba pesa >2.5 MB (antes: 413)",
  fotoGrande.byteLength > 2_500_000,
  `${Math.round(fotoGrande.byteLength / 1024)} KB`
);

const favRes = await ctx.request.put(`${BASE}/api/settings/branding/favicon`, {
  data: fotoGrande,
  headers: { origin: ORIGIN, "content-type": "image/jpeg" },
});
const favData = await favRes.json().catch(() => ({}));
check(
  "5. subir la FOTO DE PERFIL grande → se adapta",
  favRes.status() === 200 && favData?.ok !== false,
  `${favRes.status()} ${JSON.stringify(favData).slice(0, 120)}`
);

const favGet = await ctx.request.get(`${BASE}/api/branding/favicon`);
const favBuf = Buffer.from(await favGet.body());
const favTipo = String(favGet.headers()["content-type"] ?? "");
check(
  "6. el icono servido quedó adaptado y liviano (PNG o WebP)",
  favGet.status() === 200 &&
    favBuf.byteLength > 0 &&
    favBuf.byteLength < 600_000 &&
    (favTipo.includes("image/png") || favTipo.includes("image/webp")),
  `${favGet.status()} ${Math.round(favBuf.byteLength / 1024)} KB ${favTipo}`
);

/* ---------- publicación: la imagen se normaliza antes de guardar ---------- */

const prop1 = await (
  await ctx.request.post(`${BASE}/api/proposals`, {
    data: {
      kind: "renovacion",
      clientRef: TEST_CLIENT,
      clientName: "TEST IA",
      clientDni: "26322995",
      clientPhone: "3417035515",
      title: `E2E 041b ${stamp}`,
      benefit: "15% OFF en tu renovación",
      ctaLabel: "Quiero renovar",
      ctaUrl: "https://vocero.sistemasagenticos.cloud",
    },
    headers: { origin: ORIGIN, "content-type": "application/json" },
  })
).json().then((d) => d?.proposal).catch(() => null);
check("7. propuesta creada (TEST IA)", Boolean(prop1?.id), prop1?.publicUrl ?? "");

const assetRes = await ctx.request.post(`${BASE}/api/proposals/assets`, {
  data: {
    mime: "image/jpeg",
    filename: "publicacion.jpg",
    data: fotoGrande.toString("base64"),
  },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const assetData = await assetRes.json().catch(() => ({}));
const assetId = assetData?.id ?? null;
check(
  "8. imagen de publicación grande aceptada",
  assetRes.status() === 200 || assetRes.status() === 201,
  `${assetRes.status()} ${JSON.stringify(assetData).slice(0, 140)}`
);

if (assetId) {
  const imgRes = await ctx.request.get(`${BASE}/api/public/propuesta/img/${assetId}`);
  const imgBuf = Buffer.from(await imgRes.body());
  const imgMeta = await sharp(imgBuf).metadata().catch(() => ({}));
  check(
    "9. se guardó adaptada (WebP ≤1920 px, liviana)",
    imgRes.status() === 200 &&
      imgMeta.format === "webp" &&
      (imgMeta.width ?? 0) <= 1920 &&
      imgBuf.byteLength < 3_000_000,
    `${Math.round(imgBuf.byteLength / 1024)} KB ${imgMeta.format} ${imgMeta.width}px`
  );
} else {
  check("9. se guardó adaptada (WebP ≤1920 px, liviana)", false, "sin asset");
}

/* ---------- derivación a GRUPO + rol ---------- */

const dir = await (await ctx.request.get(`${BASE}/api/staff/directory`)).json().catch(() => ({}));
let groups = dir?.groups ?? [];
const viewerRole = dir?.viewer?.role;
if (groups.length === 0) {
  // En una instalación nueva puede no haber grupos: se crea uno para probar.
  // El creador no cuenta como miembro: hace falta al menos un compañero.
  const colab = (dir?.members ?? []).find((m) => String(m.name).includes(`Colab ${stamp}`));
  const grRes = await ctx.request.post(`${BASE}/api/internal/rooms`, {
    data: {
      kind: "group",
      name: `E2E Grupo 041b ${stamp}`,
      memberIds: [colab?.userId ?? myUserId],
    },
    headers: { origin: ORIGIN, "content-type": "application/json" },
  });
  const grData = await grRes.json().catch(() => ({}));
  if (grData?.room?.id) {
    groups = [{ id: grData.room.id, name: grData.room.name ?? "grupo e2e" }];
  } else {
    console.log("   (grupo no creado:", grRes.status(), JSON.stringify(grData).slice(0, 120), ")");
  }
}
check(
  "10. el directorio trae grupos y mi rol",
  Array.isArray(groups) && viewerRole === "owner",
  `grupos=${groups.length} rol=${viewerRole}`
);

const prop2 = await (
  await ctx.request.post(`${BASE}/api/proposals`, {
    data: {
      kind: "venta_cruzada",
      clientRef: TEST_CLIENT,
      clientName: "TEST IA",
      clientDni: "26322995",
      clientPhone: "3417035515",
      title: `E2E 041b grupo ${stamp}`,
    },
    headers: { origin: ORIGIN, "content-type": "application/json" },
  })
).json().then((d) => d?.proposal).catch(() => null);

let grupoOk = false;
let grupoRoom = null;
if (groups[0]?.id) {
  const derRes = await ctx.request.post(`${BASE}/api/proposals/${prop2.id}/derive`, {
    data: { assigneeGroupId: groups[0].id, priority: "media", note: "e2e grupo" },
    headers: { origin: ORIGIN, "content-type": "application/json" },
  });
  const derJson = await derRes.json().catch(() => ({}));
  grupoOk =
    derRes.status() === 200 &&
    derJson?.proposal?.assigneeGroupId === groups[0].id &&
    derJson?.proposal?.assigneeKind === "group" &&
    derJson?.proposal?.status === "derivada";
  grupoRoom = groups[0].id;
  check(
    "11. derivar a GRUPO (aviso al chat del grupo)",
    grupoOk,
    `${derRes.status()} ${groups[0].name ?? ""}`
  );
} else {
  check("11. derivar a GRUPO (aviso al chat del grupo)", false, "no hay grupos en el chat");
}

for (const caso of [
  { nombre: "sin destino", data: { priority: "media" }, espera: 422 },
  {
    nombre: "empleado y grupo a la vez",
    data: { priority: "media", assigneeUserId: myUserId, assigneeGroupId: "gr_inexistente" },
    espera: 422,
  },
  { nombre: "grupo inexistente", data: { priority: "media", assigneeGroupId: "gr_inexistente" }, espera: 404 },
]) {
  const res = await ctx.request.post(`${BASE}/api/proposals/${prop2.id}/derive`, {
    data: caso.data,
    headers: { origin: ORIGIN, "content-type": "application/json" },
  });
  check(`12. destino inválido rechazado (${caso.nombre})`, res.status() === caso.espera, `${res.status()} (esperaba ${caso.espera})`);
}

// colaborador NO puede derivar
const ctxM = await browser.newContext();
await ctxM.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: EMAIL_MEMBER, password: PASS },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const derM = await ctxM.request.post(`${BASE}/api/proposals/${prop2.id}/derive`, {
  data: { assigneeUserId: myUserId, priority: "baja" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("13. colaborador NO deriva (403)", derM.status() === 403, String(derM.status()));

/* ---------- seguimiento comercial ---------- */

const fRes = await ctx.request.get(`${BASE}/api/proposals/followup`);
const fData = await fRes.json().catch(() => ({}));
const fItems = fData?.items ?? [];
const tieneHitos = ["creada", "derivada"].every((w) => fItems.some((i) => i.what === w));
check(
  "14. seguimiento: hitos de propuesta presentes",
  fRes.status() === 200 && fItems.length > 0 && tieneHitos,
  `${fItems.length} ítems`
);

const fMRes = await ctxM.request.get(`${BASE}/api/proposals/followup`);
const fMData = await fMRes.json().catch(() => ({}));
const fMItems = fMData?.items ?? [];
// El colaborador ES miembro del grupo de prueba, así que ve lo derivado al
// grupo; lo que NO puede ver es la propuesta derivada a un empleado ajeno.
const prop1Token = String(prop1.publicUrl).replace("/p/", "");
const veLoAjeno = fMItems.some((i) => i.token === prop1Token);
check(
  "15. el colaborador NO ve las gestiones de otros (solo lo suyo/grupo)",
  fMRes.status() === 200 && !veLoAjeno,
  `${fMItems.length} ítems · ajeno=${veLoAjeno}`
);

/* ---------- previa de WhatsApp: adjunto cargado en el chat ---------- */

const send1 = await ctx.request.post(`${BASE}/api/proposals/${prop1.id}/send`, {
  headers: { origin: ORIGIN },
});
const send1Data = await send1.json().catch(() => ({}));
const contactId1 = send1Data?.proposal?.contactId ?? null;
check("16a. enviar deja contacto y conversación", send1.status() === 200 && Boolean(contactId1), String(send1.status()));

const inboxUrl = `${BASE}/inbox?contact=${contactId1}&draft=${encodeURIComponent("¡Hola! Mirá esta propuesta")}&attach=${encodeURIComponent(`${BASE}/api/public/propuesta/img/${assetId}`)}`;
await page.goto(inboxUrl, { waitUntil: "domcontentloaded" });
const adjuntoPendiente = await page
  .locator('[aria-label="Quitar adjunto"]')
  .first()
  .waitFor({ timeout: 60_000 })
  .then(() => true)
  .catch(() => false);
check("16. el adjunto queda cargado en el chat (sin enviar)", adjuntoPendiente);

/* ---------- mobile-first en la página pública ---------- */

const pubUrl = `${BASE}${prop1.publicUrl}`;
for (const [nombre, vp] of [
  ["celular 390", { width: 390, height: 844 }],
  ["tablet 820", { width: 820, height: 1180 }],
]) {
  const ctxV = await browser.newContext({ viewport: vp });
  const pg = await ctxV.newPage();
  await pg.goto(pubUrl, { waitUntil: "domcontentloaded" });
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth);
  const cta = await pg.getByText("Quiero renovar").first().isVisible().catch(() => false);
  check(
    `17. página pública en ${nombre}: sin scroll horizontal + CTA visible`,
    ancho <= vp.width + 1 && cta,
    `scrollWidth=${ancho}`
  );
  await ctxV.close();
}

/* ---------- UI: pestaña Seguimiento ---------- */

await page.goto(`${BASE}/dashboard-management`, { waitUntil: "domcontentloaded" });
await page.getByText("Pulso del negocio").first().waitFor({ timeout: 300_000 });
const skip = page.getByRole("button", { name: "Después" });
if (await skip.count()) await skip.first().click().catch(() => {});
await page.getByRole("button", { name: /^\s*Seguimiento\s*$/ }).first().click();
const vistaToggle = await page
  .getByRole("button", { name: /^Por cliente$/ })
  .first()
  .waitFor({ timeout: 30_000 })
  .then(() => true)
  .catch(() => false);
const filaCliente = await page
  .getByText("TEST IA")
  .first()
  .waitFor({ timeout: 30_000 })
  .then(() => true)
  .catch(() => false);
check("18. pestaña Seguimiento lista (vistas + datos)", vistaToggle && filaCliente);

check("19. sin errores de consola", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

await browser.close();
console.log(`\nE2E 041b: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
