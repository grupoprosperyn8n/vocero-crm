// e2e Bloque 021 — Customización del CRM solo para el propietario (Diego,
// 2026-09-11). Corre contra el dev 3001:
//   - admin: 403 en toda la superficie de configuración; el área de Equipo
//     sigue disponible (ver + dejar offline);
//   - member: 403 en configuración Y en Equipo; la operación (plantillas,
//     etapas, agente y KB en LECTURA) sigue disponible;
//   - owner: lectura de configuración 200; en escrituras con body inválido
//     responde 422 (la guarda pasó) — así se verifica la puerta sin efectos.
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const envLocal = fs.existsSync(".env.local")
  ? fs.readFileSync(".env.local", "utf8")
  : "";
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const ADMIN_KEY = envOf("ADMIN_API_KEY");
const ORIGIN = envOf("APP_BASE_URL") ?? BASE;
if (!ADMIN_KEY) {
  console.error("falta ADMIN_API_KEY en .env.local");
  process.exit(1);
}

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (ok) pass++;
  else fail++;
}

const api = async (path, { method = "GET", body, headers = {} } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const login = async (email, password) => {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
  return { status: res.status, cookie: cookie || null };
};

const stamp = Date.now().toString(36);
const PASS = "E2E-021-Custom-2026!";
const OWNER = { email: `e2e-021-owner-${stamp}@test.local`, name: "E2E 021 Owner", role: "owner" };
const ADMIN = { email: `e2e-021-admin-${stamp}@test.local`, name: "E2E 021 Admin", role: "admin" };
const MEMBER = { email: `e2e-021-member-${stamp}@test.local`, name: "E2E 021 Member", role: "member" };

// 0) altas + logins
for (const u of [OWNER, ADMIN, MEMBER]) {
  const r = await api("/api/admin/users", {
    method: "PUT",
    headers: { "x-admin-key": ADMIN_KEY },
    body: { email: u.email, name: u.name, password: PASS, role: u.role },
  });
  check(`0. alta ${u.role}`, r.status === 201 || r.json?.created === false, String(r.status));
}
const sOwner = await login(OWNER.email, PASS);
const sAdmin = await login(ADMIN.email, PASS);
const sMember = await login(MEMBER.email, PASS);
check(
  "1. logins owner/admin/member",
  sOwner.status === 200 && sAdmin.status === 200 && sMember.status === 200,
  `${sOwner.status}/${sAdmin.status}/${sMember.status}`
);

const h = (s) => ({ cookie: s.cookie });

// 2) ADMIN: la customización entera responde 403 (gate antes que validación)
const adminDenied = [
  ["GET whatsapp", "/api/settings/whatsapp", "GET", undefined],
  ["PUT whatsapp", "/api/settings/whatsapp", "PUT", {}],
  ["GET webhook", "/api/settings/webhook", "GET", undefined],
  ["GET IA", "/api/settings/ai", "GET", undefined],
  ["GET conectores", "/api/settings/connectors", "GET", undefined],
  ["POST conector", "/api/settings/connectors", "POST", {}],
  ["GET agenda", "/api/calendar/settings", "GET", undefined],
  ["POST sync plantillas", "/api/templates/sync", "POST", undefined],
  ["POST plantilla", "/api/templates", "POST", {}],
  ["PUT agente", "/api/agent/profile", "PUT", {}],
  ["POST KB", "/api/kb", "POST", {}],
  ["POST etapa", "/api/pipeline/stages", "POST", {}],
  ["POST aplicar sugerencia", "/api/lab/suggestions/apply", "POST", {}],
  ["POST seed demo", "/api/seed/demo", "POST", undefined],
];
for (const [name, path, method, body] of adminDenied) {
  const r = await api(path, { method, headers: h(sAdmin), body });
  check(`2. admin ${name} → 403`, r.status === 403, String(r.status));
}

// 3) ADMIN: Equipo sigue disponible (ver + gestionar)
{
  const t = await api("/api/settings/team", { headers: h(sAdmin) });
  check("3. admin GET team → 200", t.status === 200, String(t.status));
  const idMember = (t.json?.members ?? []).find((m) => m.email === MEMBER.email)?.id;
  const patch = await api("/api/settings/team", {
    method: "PATCH",
    headers: h(sAdmin),
    body: { memberId: idMember, offline: false },
  });
  check("3b. admin PATCH equipo (gestión) → 200", patch.status === 200, String(patch.status));
  const create = await api("/api/settings/team", {
    method: "POST",
    headers: h(sAdmin),
    body: { name: "No Debería", email: `no-${stamp}@test.local`, password: "x-NoVa-021" },
  });
  check("3c. admin alta de cuenta → 403 (solo propietario)", create.status === 403, String(create.status));
}

// 4) MEMBER: sin configuración y sin Equipo; operación intacta
const memberDenied = [
  ["GET whatsapp", "/api/settings/whatsapp", "GET", undefined],
  ["GET webhook", "/api/settings/webhook", "GET", undefined],
  ["GET team", "/api/settings/team", "GET", undefined],
  ["POST plantilla", "/api/templates", "POST", {}],
  ["POST KB", "/api/kb", "POST", {}],
  ["POST etapa", "/api/pipeline/stages", "POST", {}],
];
for (const [name, path, method, body] of memberDenied) {
  const r = await api(path, { method, headers: h(sMember), body });
  check(`4. member ${name} → 403`, r.status === 403, String(r.status));
}
const memberOps = [
  ["GET plantillas", "/api/templates"],
  ["GET etapas", "/api/pipeline/stages"],
  ["GET perfil del agente", "/api/agent/profile"],
  ["GET KB", "/api/kb"],
];
for (const [name, path] of memberOps) {
  const r = await api(path, { headers: h(sMember) });
  check(`4b. member ${name} (operación) → 200`, r.status === 200, String(r.status));
}

// 5) OWNER: lectura 200 en toda la configuración
const ownerReads = [
  ["GET whatsapp", "/api/settings/whatsapp"],
  ["GET webhook", "/api/settings/webhook"],
  ["GET IA", "/api/settings/ai"],
  ["GET conectores", "/api/settings/connectors"],
  ["GET team", "/api/settings/team"],
];
for (const [name, path] of ownerReads) {
  const r = await api(path, { headers: h(sOwner) });
  check(`5. owner ${name} → 200`, r.status === 200, String(r.status));
}

// 6) OWNER: escrituras con body inválido → 422 (la guarda pasó, sin efectos)
const ownerWriteProbes = [
  ["PUT agente (body inválido)", "/api/agent/profile", "PUT", { enabled: "sí" }],
  ["POST KB (body inválido)", "/api/kb", "POST", {}],
  ["POST etapa (body inválido)", "/api/pipeline/stages", "POST", {}],
  ["POST plantilla (body inválido)", "/api/templates", "POST", {}],
  ["POST prueba whatsapp (body inválido)", "/api/settings/whatsapp/test", "POST", {}],
];
for (const [name, path, method, body] of ownerWriteProbes) {
  const r = await api(path, { method, headers: h(sOwner), body });
  check(`6. owner ${name} → 422`, r.status === 422, String(r.status));
}

// 7) cleanup
for (const u of [OWNER, ADMIN, MEMBER]) {
  const d = await api(`/api/admin/users?email=${encodeURIComponent(u.email)}`, {
    method: "DELETE",
    headers: { "x-admin-key": ADMIN_KEY },
  });
  check("7. cleanup " + u.email, d.status === 200, String(d.status));
}

console.log(`\n021: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
