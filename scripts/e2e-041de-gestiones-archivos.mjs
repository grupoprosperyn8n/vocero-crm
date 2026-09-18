// e2e 041d + 041e — CONTENEDOR DE ARCHIVOS y CICLO DE VIDA de las gestiones.
//
// 041d: se sube una imagen y un video al CONTENEDOR universal (estante del
//   equipo), se elige la imagen desde ahí para armar una publicidad y lo que
//   sube dueño/propietario/gerente NO se puede quitar (solo dueño/propietario).
// 041e: editar (todos, con registro), archivar (gerente+), eliminar (solo
//   dueño/propietario) y poner online/offline la publicidad enviada.
//
// Corre contra el dev con mocks (AI_MOCK vía OPENROUTER_BASE_URL). No toca
// Airtable y no escribe nada fuera del CRM local.
import fs from "node:fs";
import { chromium, request } from "playwright";
import sharp from "sharp";

const BASE = process.env.APP_BASE_URL ?? "http://localhost:3001";
const ORIGIN = process.env.SMOKE_ORIGIN ?? "http://localhost:3000";
const envLocal = fs.readFileSync(".env.local", "utf8");
const ADMIN_KEY = envLocal.match(/^ADMIN_API_KEY=(.*)$/m)[1].trim();

let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}${extra ? ` — ${extra}` : ""}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
};

const stamp = Date.now().toString(36);
const emailOwner = `e2e-041de-own-${stamp}@test.local`;
const emailMember = `e2e-041de-mem-${stamp}@test.local`;
const PASS = "E2e-041de-2026!";

async function mkUser(email, role) {
  const res = await fetch(`${BASE}/api/admin/users`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ email, name: `e2e ${role} ${stamp}`, password: PASS, role }),
  });
  return res.status;
}

const s1 = await mkUser(emailOwner, "owner");
const s2 = await mkUser(emailMember, "member");
check("1. usuarios temporales (dueño + empleado)", s1 === 201 && s2 === 201, `${s1}/${s2}`);

// Contextos HTTP con cookie propia para cada rol.
const owner = await request.newContext();
const member = await request.newContext();
// El sign-in de better-auth tiene rate limit: si pega 429, espera y reintenta.
const login = async (ctx, email) => {
  for (let i = 0; i < 4; i++) {
    const res = await ctx.post(`${BASE}/api/auth/sign-in/email`, {
      data: { email, password: PASS },
      headers: { origin: ORIGIN, "content-type": "application/json" },
    });
    if (res.status() !== 429) return res;
    console.log(`  (login 429 — espero 70 s, intento ${i + 2})`);
    await new Promise((r2) => setTimeout(r2, 70_000));
  }
  return ctx.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email, password: PASS },
    headers: { origin: ORIGIN, "content-type": "application/json" },
  });
};
const lo = await login(owner, emailOwner);
const lm = await login(member, emailMember);
check("2. login de ambos roles", lo.ok() && lm.ok(), `${lo.status()}/${lm.status()}`);

// ---- 041d: contenedor universal -----------------------------------------
const png = await sharp({
  create: { width: 640, height: 420, channels: 3, background: { r: 40, g: 90, b: 140 } },
})
  .png()
  .toBuffer();
const mp4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftypisom"),
  Buffer.from([0x00, 0x00, 0x02, 0x00]),
  Buffer.alloc(4096),
]);

// Restos de corridas anteriores (nombres fijos) se limpian antes de subir.
const prevList = await (await owner.get(`${BASE}/api/library`)).json().catch(() => ({}));
for (const a of prevList.assets ?? []) {
  if (/^prueba-e2e/.test(a.filename ?? "")) {
    await owner.delete(`${BASE}/api/library/${a.id}`, { headers: { origin: ORIGIN } });
  }
}

const upImg = await owner.post(`${BASE}/api/library?name=prueba-e2e-${stamp}.png`, {
  headers: { origin: ORIGIN, "content-type": "image/png" },
  data: png,
});
const imgBody = await upImg.json().catch(() => ({}));
const img = imgBody?.asset;
check(
  "3. subir una imagen al contenedor (se adapta sola)",
  upImg.status() === 201 && img?.kind === "image" && String(img?.mime).startsWith("image/"),
  `mime=${img?.mime} bytes=${img?.byteSize}`
);

const upVid = await owner.post(`${BASE}/api/library?name=prueba-e2e-${stamp}.mp4`, {
  headers: { origin: ORIGIN, "content-type": "video/mp4" },
  data: mp4,
});
const vidBody = await upVid.json().catch(() => ({}));
const vid = vidBody?.asset;
check(
  "4. subir un video al contenedor",
  upVid.status() === 201 && vid?.kind === "video" && vid?.mime === "video/mp4",
  `mime=${vid?.mime}`
);

const listImg = await (await owner.get(`${BASE}/api/library?kind=image`)).json();
const listAll = await (await owner.get(`${BASE}/api/library`)).json();
check(
  "5. listar por tipo (imagen) y todo el estante",
  listImg.assets?.some((a) => a.id === img.id) &&
    !listImg.assets?.some((a) => a.id === vid.id) &&
    listAll.assets?.some((a) => a.id === vid.id),
  `imgs=${listImg.assets?.length} todo=${listAll.assets?.length}`
);
check(
  "6. el archivo queda marcado como FIJO (lo subió dueño/gerente)",
  img?.protected === true && vid?.protected === true
);

const raw = await owner.get(`${BASE}${img.url}`);
check(
  "7. los bytes se sirven con su tipo",
  raw.ok() && String(raw.headers()["content-type"]).startsWith("image/"),
  `ct=${raw.headers()["content-type"]}`
);

// El empleado NO puede quitarlo.
const delMember = await member.delete(`${BASE}/api/library/${vid.id}`, {
  headers: { origin: ORIGIN },
});
const delMemberBody = await delMember.json().catch(() => ({}));
check(
  "8. el empleado no puede quitar lo que subió el dueño",
  delMember.status() === 403 && delMemberBody?.error?.code === "protected",
  `${delMember.status()} ${delMemberBody?.error?.code}`
);

// ---- 041d: elegir del contenedor para la publicidad ----------------------
const assetRes = await owner.post(`${BASE}/api/proposals/assets`, {
  headers: { origin: ORIGIN, "content-type": "application/json" },
  data: { libraryId: img.id },
});
const assetBody = await assetRes.json().catch(() => ({}));
check(
  "9. la imagen del contenedor se copia a la publicidad",
  assetRes.status() === 201 && String(assetBody?.id).startsWith("pass_"),
  assetBody?.id
);

// El video no sirve como foto de la pieza.
const assetVid = await owner.post(`${BASE}/api/proposals/assets`, {
  headers: { origin: ORIGIN, "content-type": "application/json" },
  data: { libraryId: vid.id },
});
const assetVidBody = await assetVid.json().catch(() => ({}));
check(
  "10. para la pieza solo entra una imagen",
  assetVid.status() === 415 && assetVidBody?.error?.code === "not_an_image",
  `${assetVid.status()}`
);

// ---- 041e: crear una gestión y jugar su ciclo de vida --------------------
const create = await member.post(`${BASE}/api/proposals`, {
  headers: { origin: ORIGIN, "content-type": "application/json" },
  data: {
    kind: "renovacion",
    clientRef: "rechYRnw7FzaGjfpA",
    clientName: "TEST IA",
    clientDni: "26322995",
    title: `Gestión 041e ${stamp}`,
    body: "Texto inicial de la gestión para el e2e.",
    assetId: assetBody?.id,
  },
});
const propBody = await create.json().catch(() => ({}));
const prop = propBody?.proposal;
check("11. el empleado crea una gestión (queda registrada)", create.status() === 201 && prop?.id, `${create.status()}`);

const evTok = prop?.token;

// Archivar: el empleado no puede; el dueño sí.
const archMember = await member.post(`${BASE}/api/proposals/${prop.id}/lifecycle`, {
  headers: { origin: ORIGIN, "content-type": "application/json" },
  data: { action: "archive" },
});
check("12. el empleado no archiva (solo gerente+)", archMember.status() === 403, `${archMember.status()}`);

const archOwner = await owner.post(`${BASE}/api/proposals/${prop.id}/lifecycle`, {
  headers: { origin: ORIGIN, "content-type": "application/json" },
  data: { action: "archive" },
});
const archBody = await archOwner.json().catch(() => ({}));
check("13. el dueño archiva con registro", archOwner.ok() && archBody?.archivedAt, `${archOwner.status()}`);

const archOnly = await (await owner.get(`${BASE}/api/proposals?archivedOnly=1`)).json();
check(
  "14. el filtro «solo archivadas» la encuentra",
  archOnly.proposals?.some((p) => p.id === prop.id)
);

// Editar los textos (el empleado puede; queda registrado quién).
const edit = await member.patch(`${BASE}/api/proposals/${prop.id}`, {
  headers: { origin: ORIGIN, "content-type": "application/json" },
  data: { title: `Gestión 041e ${stamp} — editada`, offer: "20% de descuento" },
});
const editBody = await edit.json().catch(() => ({}));
check(
  "15. el empleado edita los textos",
  edit.ok() && editBody?.proposal?.title?.endsWith("— editada"),
  editBody?.proposal?.title
);

const events1 = await (await owner.get(`${BASE}/api/proposals/${prop.id}/events`)).json();
const editEv = events1.events?.find((e) => e.action === "editada");
check(
  "16. el historial registra quién editó y qué",
  Boolean(editEv?.actorName?.includes("e2e member")) && editEv?.detail?.includes("título"),
  `${editEv?.actorName} · ${editEv?.detail}`
);

// Online/offline de la publicidad enviada.
const off = await owner.post(`${BASE}/api/proposals/${prop.id}/lifecycle`, {
  headers: { origin: ORIGIN, "content-type": "application/json" },
  data: { action: "offline" },
});
check("17. el dueño pausa la publicidad", off.ok(), `${off.status()}`);

const pageOff = await fetch(`${BASE}/p/${evTok}`);
const htmlOff = await pageOff.text();
check(
  "18. con la publicidad pausada el link avisa que no está disponible",
  pageOff.status === 200 && htmlOff.includes("no está disponible"),
  `status=${pageOff.status}`
);

const on = await owner.post(`${BASE}/api/proposals/${prop.id}/lifecycle`, {
  headers: { origin: ORIGIN, "content-type": "application/json" },
  data: { action: "online" },
});
const pageOn = await fetch(`${BASE}/p/${evTok}`);
const htmlOn = await pageOn.text();
check(
  "19. online de nuevo: la página vuelve",
  on.ok() && pageOn.status === 200 && htmlOn.includes("— editada"),
  `status=${pageOn.status}`
);

// Eliminar: el empleado no puede; el dueño sí (y desaparece de todo).
const delMemberProp = await member.post(`${BASE}/api/proposals/${prop.id}/lifecycle`, {
  headers: { origin: ORIGIN, "content-type": "application/json" },
  data: { action: "delete" },
});
check("20. el empleado no elimina (solo dueño/propietario)", delMemberProp.status() === 403, `${delMemberProp.status()}`);

const delOwnerProp = await owner.post(`${BASE}/api/proposals/${prop.id}/lifecycle`, {
  headers: { origin: ORIGIN, "content-type": "application/json" },
  data: { action: "delete" },
});
const afterDel = await owner.get(`${BASE}/api/proposals/${prop.id}`);
const pageDel = await fetch(`${BASE}/p/${evTok}`);
check(
  "21. el dueño elimina y desaparece (API 404 y página 404)",
  delOwnerProp.ok() && afterDel.status() === 404 && pageDel.status === 404,
  `api=${afterDel.status()} page=${pageDel.status}`
);

// ---- UI: el panel y la pestaña Propuestas --------------------------------
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const errors = [];
ctx.on("weberror", (e) => errors.push(String(e.error())));
await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: emailOwner, password: PASS },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const page = await ctx.newPage();
await page.goto(`${BASE}/dashboard-management`, { waitUntil: "domcontentloaded" });
const skip = page.getByRole("button", { name: "Después" });
await page
  .getByText("Pulso del negocio")
  .first()
  .waitFor({ timeout: 300_000 })
  .catch(() => {});
if (await skip.count()) await skip.first().click().catch(() => {});

// La pestaña Propuestas ahora tiene el filtro de archivadas.
await page.getByRole("button", { name: /^\s*Propuestas/ }).first().click();
const archSelect = page.getByTitle(/041e — las archivadas/).first();
const archVisible = await archSelect
  .waitFor({ state: "visible", timeout: 90_000 })
  .then(() => true)
  .catch(() => false);
check("22. pestaña Propuestas: filtro Activas / archivadas visible", archVisible);

// En el panel del cliente: la ficha YA NO lleva el contenedor (042b: es global)
// + acciones de la lista de gestiones.
await page.getByRole("button", { name: /^\s*Cliente 360/ }).first().click();
const s = page.getByPlaceholder("Buscar cliente, DNI o póliza…");
await s.waitFor({ timeout: 90_000 });
await s.fill("TEST IA");
await page.getByRole("button", { name: "Buscar cliente", exact: true }).first().click();
const pb = page.getByRole("button", { name: "Panel de control" }).first();
await pb.waitFor({ timeout: 240_000 });
await pb.click();
await page.getByText("Métricas del cliente").first().waitFor({ timeout: 60_000 });

const enFicha = await page
  .getByText("Contenedor de archivos")
  .first()
  .isVisible()
  .catch(() => false);
check("23. la ficha ya NO muestra el contenedor universal (ahora es global)", !enFicha);

// La fila de propuestas: botones de gestión (editar + historial).
const editorBtn = page.getByTitle(/Editar los textos/).first();
const histBtn = page.getByTitle(/Historial/).first();
const rowActions = await editorBtn.isVisible().catch(() => false);
check("24. las gestiones de la ficha tienen editar e historial", rowActions && (await histBtn.isVisible().catch(() => false)));

// El botón «Elegir del contenedor (fotos o video)» abre el selector y deja elegir.
await page.getByRole("button", { name: /Crear propuesta comercial/ }).first().click();
const elegir = page.getByRole("button", { name: /Elegir del contenedor/ }).first();
await elegir.waitFor({ timeout: 90_000 });
await elegir.click();
const pickerImg = page
  .getByRole("dialog", { name: "Elegir del contenedor" })
  .getByRole("button", { name: new RegExp(`prueba-e2e-${stamp}\\.png`) })
  .first();
const pickerOk = await pickerImg
  .waitFor({ state: "visible", timeout: 90_000 })
  .then(() => true)
  .catch(() => false);
if (pickerOk) await pickerImg.click({ timeout: 15_000 }).catch(() => {});
// La copia al vuelo puede tardar (dev recompilando): esperar de verdad.
const previewOk = await page
  .locator('img[alt="Medio 1"]')
  .first()
  .waitFor({ state: "visible", timeout: 90_000 })
  .then(() => true)
  .catch(() => false);
check("25. se elige la foto DESDE el contenedor y queda en los medios", pickerOk && previewOk);

// 042b — el contenedor es GLOBAL: sección «Archivos» del menú del tablero.
await page.goto(`${BASE}/dashboard-management`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /^\s*Archivos\s*$/ }).first().click();
const contGlobal = await page
  .getByText("Contenedor de archivos")
  .first()
  .waitFor({ state: "visible", timeout: 90_000 })
  .then(() => true)
  .catch(() => false);
const imgGlobal = await page
  .locator(`img[alt="prueba-e2e-${stamp}.png"]`)
  .first()
  .waitFor({ state: "visible", timeout: 90_000 })
  .then(() => true)
  .catch(() => false);
check("26. el contenedor vive en la sección GLOBAL «Archivos» (con la imagen subida)", contGlobal && imgGlobal);

const consoleErrors = errors.length;
check("27. sin errores de página", consoleErrors === 0, errors[0]?.slice(0, 120) ?? "");

await browser.close();

// Limpieza del contenedor (el dueño puede).
await owner.delete(`${BASE}/api/library/${img.id}`, { headers: { origin: ORIGIN } });
await owner.delete(`${BASE}/api/library/${vid.id}`, { headers: { origin: ORIGIN } });

console.log(`\nE2E 041d+041e: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
