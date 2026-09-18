// 041b — Smoke de PROD con usuario sintético (alta → verificación → baja).
// Verifica la ola 041b sin tocar datos reales: la escritura va SOLO al perfil
// TEST IA (propuesta + imagen + derivación) y el resto es lectura.
// La marca (favicon) de prod NO se toca.
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
const EMAIL = `smoke-041b-${stamp}@test.local`;
const PASS = `Smoke-041b-${stamp}!`;
const TEST_CLIENT = "rechYRnw7FzaGjfpA"; // TEST IA

let pass = 0, fail = 0;
const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); ok ? pass++ : fail++; };

const alta = await fetch(`${BASE}/api/admin/users`, {
  method: "PUT",
  headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
  body: JSON.stringify({ email: EMAIL, name: "Smoke 041b", password: PASS, role: "owner" }),
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

// Seguimiento comercial (lectura del archivo ya existente en prod)
const f1 = await fetch(`${BASE}/api/proposals/followup`, { headers: H });
const f1j = await f1.json().catch(() => ({}));
check(
  "3. seguimiento comercial responde (archivo Cliente 360)",
  f1.status === 200 && Array.isArray(f1j.items) && f1j.items.length >= 1,
  `${f1j.items?.length ?? 0} ítems`
);

const dir = await fetch(`${BASE}/api/staff/directory`, { headers: H });
const dj = await dir.json().catch(() => ({}));
check(
  "4. directorio con grupos y rol",
  dir.status === 200 && Array.isArray(dj.groups) && dj.viewer?.role === "owner",
  `grupos=${dj.groups?.length ?? 0} rol=${dj.viewer?.role}`
);

// Propuesta + imagen grande (perfil TEST IA)
const creada = await fetch(`${BASE}/api/proposals`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({
    kind: "renovacion",
    clientRef: TEST_CLIENT,
    clientName: "TEST IA",
    clientDni: "26322995",
    clientPhone: "3417035515",
    title: `Smoke 041b ${stamp}`,
    benefit: "15% OFF en tu renovación",
    ctaLabel: "Quiero renovar",
    ctaUrl: "https://vocero.sistemasagenticos.cloud",
  }),
});
const cj = await creada.json().catch(() => ({}));
const prop = cj?.proposal;
check("5. propuesta TEST IA creada", creada.status === 201 && Boolean(prop?.publicUrl), `${creada.status} ${prop?.publicUrl ?? ""}`);

const jpeg = await sharp(crypto.randomBytes(2400 * 1800 * 3), {
  raw: { width: 2400, height: 1800, channels: 3 },
}).jpeg({ quality: 90 }).toBuffer();
const asset = await fetch(`${BASE}/api/proposals/assets`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify({ mime: "image/jpeg", filename: "smoke.jpg", data: jpeg.toString("base64") }),
});
const aj = await asset.json().catch(() => ({}));
check("6. imagen grande adaptada (subida)", asset.status === 201 && Boolean(aj?.id), `${asset.status} ${Math.round(jpeg.byteLength / 1024)}KB → ${aj?.id ?? ""}`);

if (aj?.id) {
  const img = await fetch(`${BASE}/api/public/propuesta/img/${aj.id}`);
  const buf = Buffer.from(await img.arrayBuffer());
  const meta = await sharp(buf).metadata().catch(() => ({}));
  check(
    "7. se sirve adaptada (WebP ≤1920)",
    img.status === 200 && meta.format === "webp" && (meta.width ?? 0) <= 1920,
    `${Math.round(buf.byteLength / 1024)}KB ${meta.format} ${meta.width}px`
  );
} else {
  check("7. se sirve adaptada (WebP ≤1920)", false, "sin asset");
}

// Derivación: a un grupo existente (como en dev); si no hay, a un empleado.
const grupo = (dj.groups ?? [])[0] ?? null;
const deriveBody = grupo
  ? { assigneeGroupId: grupo.id, priority: "media", note: "smoke 041b (grupo)" }
  : { assigneeUserId: dj.viewer?.userId, priority: "media", note: "smoke 041b" };
const der = await fetch(`${BASE}/api/proposals/${prop.id}/derive`, {
  method: "POST",
  headers: { ...H, "content-type": "application/json" },
  body: JSON.stringify(deriveBody),
});
const derj = await der.json().catch(() => ({}));
check(
  `8. derivación (${grupo ? "grupo " + (grupo.name ?? "") : "empleado"})`,
  der.status === 200 && derj?.proposal?.status === "derivada",
  `${der.status} kind=${derj?.proposal?.assigneeKind}`
);

// La propuesta queda archivada en el seguimiento
const f2 = await fetch(`${BASE}/api/proposals/followup`, { headers: H });
const f2j = await f2.json().catch(() => ({}));
const token = String(prop.publicUrl).replace("/p/", "");
const hitos = (f2j.items ?? []).filter((i) => i.token === token).map((i) => i.what);
check(
  "9. la propuesta nueva entra al archivo (creada + derivada)",
  hitos.includes("creada") && hitos.includes("derivada"),
  hitos.join(",")
);

// La página pública abre sin sesión
const pub = await fetch(`${BASE}${prop.publicUrl}`);
const html = await pub.text().catch(() => "");
check(
  "10. página pública abre sin sesión",
  pub.status === 200 && html.includes("15% OFF en tu renovación"),
  String(pub.status)
);

const del = await fetch(`${BASE}/api/admin/users?email=${encodeURIComponent(EMAIL)}`, {
  method: "DELETE",
  headers: { "x-admin-key": ADMIN_KEY },
});
check("11. baja del sintético (limpieza)", del.ok, String(del.status));

console.log(`\n${pass}/${pass + fail} smoke prod 041b OK`);
process.exit(fail ? 1 : 0);
