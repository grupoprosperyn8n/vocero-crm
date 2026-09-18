// 041c + 041d + 041e — Smoke de PROD con usuario sintético (alta → verificación → baja).
// Escritura SOLO al perfil TEST IA (propuesta) y al contenedor de archivos (se
// sube y se borra en la misma corrida). Nada de Airtable, nada de datos reales.
import fs from "node:fs";
import crypto from "node:crypto";
import sharp from "sharp";

const BASE = "https://vocero.sistemasagenticos.cloud";
const envLocal = fs.readFileSync("/home/diegol/Documentos/vocero-crm/.env.local", "utf8");
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const ADMIN_KEY = process.env.SMOKE_ADMIN_KEY ?? envOf("ADMIN_API_KEY");
const ORIGIN = process.env.SMOKE_ORIGIN ?? BASE;
const stamp = Date.now().toString(36);
const EMAIL = `smoke-041cde-${stamp}@test.local`;
const PASS = `Smoke-041cde-${stamp}!`;
const TEST_CLIENT = "rechYRnw7FzaGjfpA"; // TEST IA

let pass = 0;
let fail = 0;
const check = (n, ok, x = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`);
  ok ? pass++ : fail++;
};

const alta = await fetch(`${BASE}/api/admin/users`, {
  method: "PUT",
  headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
  body: JSON.stringify({ email: EMAIL, name: "Smoke 041cde", password: PASS, role: "owner" }),
});
check("1. alta sintética (owner)", alta.status === 201, String(alta.status));

const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { origin: ORIGIN, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
check("2. login", login.status === 200 && cookie.length > 10, String(login.status));
const H = { cookie, origin: ORIGIN };

// 2-bis — limpiar restos de corridas anteriores (si una falló a mitad).
const prev = await fetch(`${BASE}/api/admin/users`, { headers: { "x-admin-key": ADMIN_KEY } });
const prevJson = await prev.json().catch(() => ({}));
const viejos = (prevJson?.members ?? []).filter(
  (m) => /^smoke-041cde-/.test(m.email ?? "") && m.email !== EMAIL
);
for (const m of viejos) {
  await fetch(`${BASE}/api/admin/users?email=${encodeURIComponent(m.email)}`, {
    method: "DELETE",
    headers: { "x-admin-key": ADMIN_KEY },
  });
}
const libPrev = await (await fetch(`${BASE}/api/library`, { headers: H })).json().catch(() => ({}));
const huerfanos = (libPrev?.assets ?? []).filter((a) => String(a.name).startsWith("smoke-041d-"));
for (const a of huerfanos) {
  await fetch(`${BASE}/api/library/${a.id}`, { method: "DELETE", headers: H });
}
check("2-bis. limpieza de corridas previas", true, `${viejos.length} usuarios / ${huerfanos.length} archivos`);

// ---- 041c: la IA escribe la publicidad ------------------------------------
const copy = await fetch(`${BASE}/api/proposals/copy`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({
    target: "pieza",
    tone: "cercana",
    angle: "ahorro",
    instructions: "mencioná el beneficio del club de descuentos",
    clientName: "TEST IA",
    kind: "renovacion",
    productName: "Auto",
    title: "Renovación con descuento",
    body: "",
  }),
});
const copyJson = await copy.json().catch(() => ({}));
const copyOk =
  (copy.status === 200 && typeof copyJson?.copy?.title === "string" && copyJson.copy.title.length > 3) ||
  (copy.status === 503 && String(copyJson?.error?.code).includes("ai"));
check(
  "3. la IA escribe la publicidad (o avisa que no está conectada)",
  copyOk,
  `status=${copy.status} ${copyJson?.copy?.title?.slice(0, 40) ?? copyJson?.error?.code ?? ""}`
);

const badTone = await fetch(`${BASE}/api/proposals/copy`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({ target: "pieza", tone: "elegante", clientName: "TEST IA", kind: "renovacion" }),
});
check("4. un tono inventado no pasa (400/422)", [400, 422].includes(badTone.status), String(badTone.status));

// ---- 041d: contenedor de archivos -----------------------------------------
const png = await sharp(crypto.randomBytes(900 * 600 * 3), {
  raw: { width: 900, height: 600, channels: 3 },
}).png().toBuffer();
const subida = await fetch(`${BASE}/api/library?name=smoke-041d-${stamp}.png`, {
  method: "POST",
  headers: { ...H, "content-type": "image/png" },
  body: png,
});
const subidaJson = await subida.json().catch(() => ({}));
const item = subidaJson?.asset;
check(
  "5. subir una imagen al contenedor universal",
  subida.status === 201 && item?.kind === "image" && item?.protected === true,
  `${subida.status} ${item?.id ?? ""}`
);

const lista = await (await fetch(`${BASE}/api/library?kind=image`, { headers: H })).json();
check(
  "6. el contenedor lista los archivos",
  lista.assets?.some((a) => a.id === item.id),
  `${lista.assets?.length ?? 0} imágenes`
);

const raw = await fetch(`${BASE}${item.url}`, { headers: H });
check("7. los bytes se sirven", raw.ok && String(raw.headers.get("content-type")).startsWith("image/"), String(raw.status));

const copyAsset = await fetch(`${BASE}/api/proposals/assets`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({ libraryId: item.id }),
});
const copyAssetJson = await copyAsset.json().catch(() => ({}));
check("8. se elige del contenedor para la publicidad", copyAsset.status === 201 && copyAssetJson?.id, String(copyAsset.status));

// ---- 041e: ciclo de vida ---------------------------------------------------
const creada = await fetch(`${BASE}/api/proposals`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({
    kind: "renovacion",
    clientRef: TEST_CLIENT,
    clientName: "TEST IA",
    clientDni: "26322995",
    clientPhone: "3417035515",
    title: `Smoke 041e ${stamp}`,
    body: "Prueba de ciclo de vida.",
    assetId: copyAssetJson?.id,
    tone: "cercana",
    angle: "ahorro",
  }),
});
const cj = await creada.json().catch(() => ({}));
const prop = cj?.proposal;
check(
  "9. propuesta TEST IA con tono guardado",
  creada.status === 201 && prop?.tone === "cercana" && Boolean(prop?.publicUrl),
  `${creada.status} tono=${prop?.tone}`
);

const arch = await fetch(`${BASE}/api/proposals/${prop.id}/lifecycle`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({ action: "archive" }),
});
check("10. archivar (gerente+)", arch.ok, String(arch.status));

const soloArch = await (await fetch(`${BASE}/api/proposals?archivedOnly=1`, { headers: H })).json();
check("11. el filtro de archivadas la trae", soloArch.proposals?.some((p) => p.id === prop.id));

const edit = await fetch(`${BASE}/api/proposals/${prop.id}`, {
  method: "PATCH",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({ title: `Smoke 041e ${stamp} — editada`, offer: "10% de descuento" }),
});
check("12. editar queda registrado", edit.ok, String(edit.status));
const hist = await (await fetch(`${BASE}/api/proposals/${prop.id}/events`, { headers: H })).json();
const evEdit = hist.events?.find((e) => e.action === "editada");
check("13. el historial muestra quién editó", Boolean(evEdit?.actorName), evEdit?.detail ?? "");

const off = await fetch(`${BASE}/api/proposals/${prop.id}/lifecycle`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({ action: "offline" }),
});
const paginaOff = await fetch(`${BASE}${prop.publicUrl}`);
const htmlOff = await paginaOff.text().catch(() => "");
check(
  "14. publicidad pausada: el link avisa",
  off.ok && paginaOff.status === 200 && htmlOff.includes("no está disponible"),
  String(paginaOff.status)
);

const on = await fetch(`${BASE}/api/proposals/${prop.id}/lifecycle`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({ action: "online" }),
});
const paginaOn = await fetch(`${BASE}${prop.publicUrl}`);
const htmlOn = await paginaOn.text().catch(() => "");
check("15. online de nuevo: la página vuelve", on.ok && paginaOn.status === 200 && htmlOn.includes("editada"), String(paginaOn.status));

const delProp = await fetch(`${BASE}/api/proposals/${prop.id}/lifecycle`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({ action: "delete" }),
});
const paginaDel = await fetch(`${BASE}${prop.publicUrl}`);
check("16. eliminar (dueño/propietario) y el link muere", delProp.ok && paginaDel.status === 404, `${paginaDel.status}`);

// ---- limpieza --------------------------------------------------------------
const delItem = await fetch(`${BASE}/api/library/${item.id}`, { method: "DELETE", headers: H });
check("17. limpieza del archivo subido", delItem.ok, String(delItem.status));

const baja = await fetch(`${BASE}/api/admin/users?email=${encodeURIComponent(EMAIL)}`, {
  method: "DELETE",
  headers: { "x-admin-key": ADMIN_KEY },
});
check("18. baja del sintético (limpieza)", baja.ok, String(baja.status));

console.log(`\n${pass}/${pass + fail} smoke prod 041c+041d+041e OK`);
process.exit(fail ? 1 : 0);
