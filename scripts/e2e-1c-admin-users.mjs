// e2e-1c-admin-users.mjs — sync del equipo (018): endpoint /api/admin/users.
//
// Prueba el contrato que consumirá n8n desde la automatización de la tabla
// LOGIN de Airtable: alta idempotente, cambio de rol/nombre/contraseña,
// baja (active=false y DELETE) y las protecciones del endpoint.
//
// Uso: node scripts/e2e-1c-admin-users.mjs   (contra el dev server local)
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const ADMIN_KEY = process.env.E2E_ADMIN_KEY ?? "test-admin-key-1c-2026-abcdef";

// Email único por corrida: la baja (DELETE) no borra la cuenta (solo la quita
// de la bandeja), así que un email fijo reaparecería como created:false.
const EMAIL = `e2e-1c-${Date.now().toString(36)}@test.local`;
const PASS_1 = "PrimeraPass-1c";
const PASS_2 = "SegundaPass-1c";

let passed = 0;
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ok  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

async function api(path, { method = "GET", key = ADMIN_KEY, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(key ? { "x-admin-key": key } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

async function signIn(email, password) {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // El fetch de node manda sec-fetch-mode → mejor-auth exige Origin y lo
      // valida contra APP_BASE_URL (http://localhost:3000 en dev). Sin él: 403.
      origin: process.env.E2E_ORIGIN ?? "http://localhost:3000",
    },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : "";
  return { status: res.status, cookie };
}

async function inbox(cookie) {
  const res = await fetch(`${BASE}/api/conversations`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return res.status;
}

const put = (body) => api("/api/admin/users", { method: "PUT", body });

console.log("1C — /api/admin/users (sync LOGIN)\n");

// ── Seguridad de la superficie ──────────────────────────────────────────────
{
  const noKey = await api("/api/admin/users", { method: "PUT", key: null, body: {} });
  check("401 sin x-admin-key", noKey.status === 401, `got ${noKey.status}`);
  const badKey = await api("/api/admin/users", { method: "PUT", key: "nope", body: {} });
  check("401 con key inválida", badKey.status === 401, `got ${badKey.status}`);
  const short = await api("/api/admin/users", { method: "GET", key: "abc" });
  check("401 con key corta", short.status === 401, `got ${short.status}`);
  const badBody = await put({ email: "no-un-mail", name: "", password: "x", role: "member" });
  check("422 body inválido", badBody.status === 422, `got ${badBody.status}`);
  const badRole = await put({ email: EMAIL, name: "X", password: PASS_1, role: "jefe" });
  check("422 rol inválido", badRole.status === 422, `got ${badRole.status}`);
}

// ── Alta ────────────────────────────────────────────────────────────────────
let out;
{
  // limpieza por si quedó de una corrida anterior
  await api(`/api/admin/users?email=${EMAIL}`, { method: "DELETE" });
  out = await put({ email: EMAIL, name: "Empleado Sync", password: PASS_1, role: "member" });
  check("alta 201 created", out.status === 201, `got ${out.status} ${JSON.stringify(out.json)}`);

  const sinPass = await put({ email: `nuevo-${EMAIL}`, name: "Sin Pass", role: "member" });
  check("422 alta sin password", sinPass.status === 422, `got ${sinPass.status}`);
}

// ── La cuenta realmente entra a la bandeja ──────────────────────────────────
{
  const s1 = await signIn(EMAIL, PASS_1);
  check("login con la password del sync → 200", s1.status === 200, `got ${s1.status}`);
  if (s1.status === 200) {
    const bandeja = await inbox(s1.cookie);
    check("bandeja /api/inbox → 200", bandeja === 200, `got ${bandeja}`);
  }
  const sBad = await signIn(EMAIL, "pass-incorrecta");
  check("login con password incorrecta → 401", sBad.status === 401, `got ${sBad.status}`);
}

// ── Idempotencia y cambios ──────────────────────────────────────────────────
{
  const again = await put({ email: EMAIL, name: "Empleado Sync", role: "member" });
  check("PUT repetido idempotente → 200 sin changes", again.status === 200 && again.json.changes.length === 0,
    `got ${again.status} ${JSON.stringify(again.json)}`);

  const renombrado = await put({ email: EMAIL, name: "Empleado Sync Renombrado", role: "member" });
  check("cambio de nombre", renombrado.json.changes.includes("name"), JSON.stringify(renombrado.json));

  const admin = await put({ email: EMAIL, name: "Empleado Sync Renombrado", role: "admin" });
  check("cambio a admin", admin.status === 200 && admin.json.role === "admin", JSON.stringify(admin.json));

  const passNueva = await put({ email: EMAIL, name: "Empleado Sync Renombrado", password: PASS_2, role: "admin" });
  check("cambio de password", passNueva.json.changes.includes("password"), JSON.stringify(passNueva.json));
  const sNueva = await signIn(EMAIL, PASS_2);
  check("login con password nueva → 200", sNueva.status === 200, `got ${sNueva.status}`);
  const sVieja = await signIn(EMAIL, PASS_1);
  check("login con password vieja → 401", sVieja.status === 401, `got ${sVieja.status}`);
}

// ── Listado (consistencia/polling) ──────────────────────────────────────────
{
  const list = await api("/api/admin/users");
  check("GET lista → 200", list.status === 200, `got ${list.status}`);
  const mine = (list.json.members ?? []).find((m) => m.email === EMAIL);
  check("el sync figura en la lista", !!mine && mine.role === "admin" && mine.name === "Empleado Sync Renombrado",
    `got ${JSON.stringify(list.json.members?.find((m) => m.email === EMAIL))}`);
}

// ── Baja: active=false corta el acceso en caliente ──────────────────────────
{
  const sAntes = await signIn(EMAIL, PASS_2);
  out = await put({ email: EMAIL, name: "Empleado Sync Renombrado", role: "admin", active: false });
  check("active=false → 200 removed", out.json?.active === false && out.json?.removed === true, JSON.stringify(out.json));
  const bandeja = await inbox(sAntes.cookie);
  check("bandeja 401 tras la baja (sesión vieja inutilizada)", bandeja === 401, `got ${bandeja}`);

  const again = await put({ email: EMAIL, name: "Empleado Sync Renombrado", role: "admin", active: false });
  check("baja repetida idempotente (removed:false)", again.json?.removed === false, JSON.stringify(again.json));
}

// ── Re-alta tras la baja ────────────────────────────────────────────────────
{
  out = await put({ email: EMAIL, name: "Empleado Sync Renombrado", password: PASS_2, role: "member" });
  check("re-alta → 200 (created:false)", out.status === 200 && out.json.created === false && out.json.changes.includes("member"),
    `got ${out.status} ${JSON.stringify(out.json)}`);
  const s = await signIn(EMAIL, PASS_2);
  const bandeja = await inbox(s.cookie);
  check("vuelve a entrar a la bandeja", bandeja === 200, `got ${bandeja}`);
}

// ── Baja explícita por DELETE ───────────────────────────────────────────────
{
  const del = await api(`/api/admin/users?email=${EMAIL}`, { method: "DELETE" });
  check("DELETE → 200 removed", del.status === 200 && del.json.removed === true, JSON.stringify(del.json));
  const delAgain = await api(`/api/admin/users?email=${EMAIL}`, { method: "DELETE" });
  check("DELETE repetido idempotente", delAgain.status === 200 && delAgain.json.removed === false, JSON.stringify(delAgain.json));
  const delSinMail = await api("/api/admin/users", { method: "DELETE" });
  check("DELETE sin ?email → 422", delSinMail.status === 422, `got ${delSinMail.status}`);
}

// ── Protección: no tocar al owner raíz con key inválida o rol inválido ──────
{
  const list = await api("/api/admin/users");
  const owners = (list.json.members ?? []).filter((m) => m.role === "owner");
  check("la instancia de test conserva su owner", owners.length >= 1, `owners=${owners.length}`);
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
process.exit(failed === 0 ? 0 : 1);
