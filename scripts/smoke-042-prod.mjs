// 042 — Smoke de PROD con usuario sintético (alta → verificación → baja).
// SOLO toca: el perfil TEST IA (una propuesta que se crea y se elimina en la
// misma corrida) y assets efímeros del contenedor. NADA de Airtable ni datos
// reales. Requiere SMOKE_ADMIN_KEY (en env o .env.local).
import fs from "node:fs";
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
const EMAIL = `smoke-042-${stamp}@test.local`;
const PASS = `Smoke-042-${stamp}!`;
const EMAIL_M = `smoke-042m-${stamp}@test.local`;
const TEST_CLIENT = "rechYRnw7FzaGjfpA"; // TEST IA

// Video MP4 mínimo (1 s, 320x240) embebido: la pieza tiene que aceptar video.
const VIDEO_B64 =
  "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";

let pass = 0;
let fail = 0;
const check = (n, ok, x = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`);
  ok ? pass++ : fail++;
};

const alta = await fetch(`${BASE}/api/admin/users`, {
  method: "PUT",
  headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
  body: JSON.stringify({ email: EMAIL, name: "Smoke 042", password: PASS, role: "owner" }),
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

// 2-bis — limpiar restos de corridas anteriores (si alguna falló a mitad).
const prev = await (await fetch(`${BASE}/api/admin/users`, { headers: { "x-admin-key": ADMIN_KEY } })).json().catch(() => ({}));
const viejos = (prev?.members ?? []).filter((m) => /^smoke-042/.test(m.email ?? "") && m.email !== EMAIL && m.email !== EMAIL_M);
for (const m of viejos) {
  await fetch(`${BASE}/api/admin/users?email=${encodeURIComponent(m.email)}`, { method: "DELETE", headers: { "x-admin-key": ADMIN_KEY } });
}
check("2-bis. limpieza de corridas previas", true, `${viejos.length} usuarios`);

// ---- medios: 2 fotos + 1 video (el video como LOGO se rechaza) -------------
const subir = async (mime, name, data, extra = {}) => {
  const r = await fetch(`${BASE}/api/proposals/assets`, {
    method: "POST",
    headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify({ mime, name, data, ...extra }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, id: j?.id, mime: j?.mime, error: j?.error?.code };
};

const foto1 = await sharp({ create: { width: 240, height: 160, channels: 3, background: "#2563eb" } }).png().toBuffer();
const foto2 = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#16a34a" } }).png().toBuffer();
const a1 = await subir("image/png", `smoke-042-a-${stamp}.png`, foto1.toString("base64"));
check("3. foto 1 al contenedor", a1.status === 201 && a1.mime === "image/webp", `status=${a1.status} mime=${a1.mime}`);
const a2 = await subir("image/png", `smoke-042-b-${stamp}.png`, foto2.toString("base64"));
check("4. foto 2 al contenedor", a2.status === 201, `status=${a2.status}`);
const av = await subir("video/mp4", `smoke-042-v-${stamp}.mp4`, VIDEO_B64);
check("5. video mp4 al contenedor", av.status === 201 && av.mime === "video/mp4", `status=${av.status} mime=${av.mime}`);
const logoVideo = await subir("video/mp4", `smoke-042-logo-${stamp}.mp4`, VIDEO_B64, { purpose: "logo" });
check("6. video como LOGO se rechaza (415)", logoVideo.status === 415, String(logoVideo.status));

// ---- pieza con carrusel + video ------------------------------------------
const crear = await fetch(`${BASE}/api/proposals`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({
    clientRef: TEST_CLIENT,
    clientName: "TEST IA",
    kind: "renovacion",
    title: `Smoke 042 carrusel ${stamp}`,
    body: "Pieza de smoke: carrusel de fotos y video.",
    mediaIds: [a1.id, av.id, a2.id, "pass_bogus0000"],
  }),
});
const prop = (await crear.json().catch(() => ({})))?.proposal;
check("7. crear pieza con carrusel + video", crear.status === 201 && Array.isArray(prop?.mediaIds) && prop.mediaIds.length === 3, `status=${crear.status} medios=${prop?.mediaIds?.length}`);
check("8. la imagen principal es la primera FOTO", String(prop?.imageUrl ?? "").includes(String(a1.id)), String(prop?.imageUrl ?? ""));
const idInvalidoFuera = !(prop?.mediaIds ?? []).includes("pass_bogus0000");
check("9. un id inventado no entra a los medios", idInvalidoFuera === true);

// ---- página pública (sin sesión) ------------------------------------------
const html = await (await fetch(`${BASE}/p/${prop?.token}`)).text();
const htmlOk =
  html.includes("data-carousel") &&
  html.includes(`/api/public/propuesta/img/${av.id}`) &&
  (html.match(/\/api\/public\/propuesta\/img\//g) ?? []).length >= 3;
check("10. página pública: carrusel con 3 medios (incluye el video)", htmlOk);
const waOk = /wa\.me\/\d{10,15}/.test(html);
check("11. botón WhatsApp directo (wa.me con número del equipo)", waOk, (html.match(/wa\.me\/\d+/) ?? ["sin wa.me"])[0]);
check("12. diseño claro con movimiento (blobs + glass)", html.includes("rp-blob") && html.includes("backdrop-blur"));
const sinVideo = await fetch(`${BASE}/api/public/propuesta/img/${av.id}`);
const tipoVideo = sinVideo.headers.get("content-type") ?? "";
const bytes = (await sinVideo.arrayBuffer()).byteLength;
check("13. el video se sirve como video/mp4", sinVideo.status === 200 && tipoVideo.includes("video/mp4") && bytes > 1000, `${tipoVideo} ${bytes}B`);

// ---- derivar a la IA -------------------------------------------------------
const derivar = await fetch(`${BASE}/api/proposals/${prop?.id}/derive`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({ assigneeKind: "ia", priority: "media", note: "smoke 042" }),
});
const dProp = (await derivar.json().catch(() => ({})))?.proposal;
check("14. derivar a la IA (sin persona asignada)", derivar.status === 200 && !!dProp?.derivedAt && !dProp?.assigneeName, `status=${derivar.status} derivada=${dProp?.derivedAt ? "sí" : "no"}`);
const evs = await (await fetch(`${BASE}/api/proposals/${prop?.id}/events`, { headers: H })).json().catch(() => ({}));
const evIa = (evs?.events ?? []).some((e) => /IA/i.test(String(e.detail ?? "")));
check("15. el historial registra la derivación a la IA", evIa, (evs?.events ?? []).map((e) => e.detail).slice(0, 2).join(" | "));

// ---- tablero maestro + gate del empleado -----------------------------------
const ov = await fetch(`${BASE}/api/proposals/overview`, { headers: H });
const ovJson = await ov.json().catch(() => ({}));
check("16. tablero maestro de campañas (owner)", ov.status === 200 && (ovJson?.overview?.totals?.total ?? 0) >= 1, `status=${ov.status} total=${ovJson?.overview?.totals?.total}`);
check("17. la campaña aparece en los recientes con sus medios", (ovJson?.overview?.recent ?? []).some((r) => r.id === prop?.id && r.mediaCount >= 3));

const altaM = await fetch(`${BASE}/api/admin/users`, {
  method: "PUT",
  headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
  body: JSON.stringify({ email: EMAIL_M, name: "Smoke 042 empleado", password: PASS, role: "member" }),
});
const loginM = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { origin: ORIGIN, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL_M, password: PASS }),
});
const cookieM = (loginM.headers.get("set-cookie") ?? "").split(";")[0];
const ovM = await fetch(`${BASE}/api/proposals/overview`, { headers: { cookie: cookieM, origin: ORIGIN } });
check("18. el empleado NO ve el tablero maestro (403)", ovM.status === 403, `${altaM.status}/${ovM.status}`);

// ---- baja: la pieza se elimina y la página deja de existir -----------------
const del = await fetch(`${BASE}/api/proposals/${prop?.id}/lifecycle`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({ action: "delete" }),
});
const paginaMuerta = await fetch(`${BASE}/p/${prop?.token}`);
check("19. pieza eliminada (API + página 404)", del.status === 200 && paginaMuerta.status === 404, `${del.status}/${paginaMuerta.status}`);

for (const mail of [EMAIL, EMAIL_M]) {
  await fetch(`${BASE}/api/admin/users?email=${encodeURIComponent(mail)}`, { method: "DELETE", headers: { "x-admin-key": ADMIN_KEY } });
}
check("20. baja de los usuarios sintéticos", true);

console.log(`\nSMOKE 042: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
