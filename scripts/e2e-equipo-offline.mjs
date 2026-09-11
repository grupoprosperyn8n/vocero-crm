// e2e Bloque Equipo 020 — "Dejar offline" (propietario/administrador) y
// mapeo de roles adaptado a LOGIN. Corre contra el dev 3001:
//   - altas sintéticas e2e-*@test.local (owner, admin x2, member);
//   - reglas por rol (quién puede, a quién, y a quién no);
//   - corte real de acceso (cookie vieja 401 + login 403) y vuelta online;
//   - el sync (PUT active:true) NO pisa el estado fuera de línea.
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
  return {
    status: res.status,
    cookie: cookie || null,
    json: await res.json().catch(() => null),
  };
};

const stamp = Date.now().toString(36);
const PASS = "E2E-Offline-2026!";
const OWNER = { email: `e2e-off-owner-${stamp}@test.local`, name: "E2E Offline Owner", role: "owner" };
const ADMIN1 = { email: `e2e-off-admin1-${stamp}@test.local`, name: "E2E Offline Admin 1", role: "admin" };
const ADMIN2 = { email: `e2e-off-admin2-${stamp}@test.local`, name: "E2E Offline Admin 2", role: "admin" };
const MEMBER = { email: `e2e-off-member-${stamp}@test.local`, name: "E2E Offline Member", role: "member" };

// 0) altas
for (const u of [OWNER, ADMIN1, ADMIN2, MEMBER]) {
  const r = await api("/api/admin/users", {
    method: "PUT",
    headers: { "x-admin-key": ADMIN_KEY },
    body: { email: u.email, name: u.name, password: PASS, role: u.role },
  });
  check(`0. alta ${u.role}`, r.status === 201 || r.json?.created === false, String(r.status));
}

// 1) logins
const sOwner = await login(OWNER.email, PASS);
const sAdmin1 = await login(ADMIN1.email, PASS);
const sAdmin2 = await login(ADMIN2.email, PASS);
const sMember = await login(MEMBER.email, PASS);
check(
  "1. login owner/admin1/admin2/member",
  sOwner.status === 200 && sAdmin1.status === 200 && sAdmin2.status === 200 && sMember.status === 200,
  `${sOwner.status}/${sAdmin1.status}/${sAdmin2.status}/${sMember.status}`
);

// 2) el equipo trae viewer + los cuatro
let team = await api("/api/settings/team", { headers: { cookie: sOwner.cookie } });
const byEmail = (j, e) => (j?.members ?? []).find((m) => m.email === e);
check(
  "2. GET team (owner): viewer + miembros",
  team.status === 200 &&
    team.json?.viewer?.role === "owner" &&
    [OWNER, ADMIN1, ADMIN2, MEMBER].every((u) => byEmail(team.json, u.email)),
  `viewer=${team.json?.viewer?.role}`
);
const idOwner = byEmail(team.json, OWNER.email)?.id;
const idAdmin2 = byEmail(team.json, ADMIN2.email)?.id;
const idMember = byEmail(team.json, MEMBER.email)?.id;

// 3) un miembro no puede tocar a nadie
let r = await api("/api/settings/team", {
  method: "PATCH",
  headers: { cookie: sMember.cookie },
  body: { memberId: idOwner, offline: true },
});
check("3. member PATCH → 403", r.status === 403, String(r.status));

// 4) un administrador no maneja a otro administrador
r = await api("/api/settings/team", {
  method: "PATCH",
  headers: { cookie: sAdmin1.cookie },
  body: { memberId: idAdmin2, offline: true },
});
check("4. admin1 → admin2 bloqueado", r.status === 403, String(r.status));

// 5) admin deja offline a un miembro
r = await api("/api/settings/team", {
  method: "PATCH",
  headers: { cookie: sAdmin1.cookie },
  body: { memberId: idMember, offline: true },
});
check("5. admin deja offline al member", r.status === 200 && r.json?.offline === true, String(r.status));

// 6) el estado se ve en Equipo, con autor
team = await api("/api/settings/team", { headers: { cookie: sOwner.cookie } });
const offMember = byEmail(team.json, MEMBER.email);
check(
  "6. team muestra offlineAt + offlineByName",
  !!offMember?.offlineAt && offMember?.offlineByName === ADMIN1.name,
  `por=${offMember?.offlineByName ?? "-"}`
);

// 7) corte real: cookie vieja 401, login nuevo 403
r = await api("/api/conversations", { headers: { cookie: sMember.cookie } });
check("7. cookie vieja del member → 401", r.status === 401, String(r.status));
const reMember = await login(MEMBER.email, PASS);
check("7b. login nuevo del member → 403", reMember.status === 403, String(reMember.status));

// 8) el sync del sistema NO pisa el offline (PUT active:true)
r = await api("/api/admin/users", {
  method: "PUT",
  headers: { "x-admin-key": ADMIN_KEY },
  body: { email: MEMBER.email, name: MEMBER.name, password: PASS, role: "member", active: true },
});
const teamAfterSync = await api("/api/settings/team", { headers: { cookie: sOwner.cookie } });
check(
  "8. sync active:true no pisa el offline",
  (r.status === 200 || r.status === 201) && !!byEmail(teamAfterSync.json, MEMBER.email)?.offlineAt,
  String(r.status)
);

// 9) al propietario no se lo toca; nadie a sí mismo
r = await api("/api/settings/team", {
  method: "PATCH",
  headers: { cookie: sAdmin1.cookie },
  body: { memberId: idOwner, offline: true },
});
check("9. admin → propietario bloqueado", r.status === 409, String(r.status));
r = await api("/api/settings/team", {
  method: "PATCH",
  headers: { cookie: sOwner.cookie },
  body: { memberId: idOwner, offline: true },
});
check("9b. propietario a sí mismo bloqueado", r.status === 409, String(r.status));

// 10) el propietario sí maneja administradores (offline y online)
r = await api("/api/settings/team", {
  method: "PATCH",
  headers: { cookie: sOwner.cookie },
  body: { memberId: idAdmin2, offline: true },
});
check("10. propietario deja offline al admin", r.status === 200, String(r.status));
const reAdmin2 = await login(ADMIN2.email, PASS);
check("10b. login del admin offline → 403", reAdmin2.status === 403, String(reAdmin2.status));
r = await api("/api/settings/team", {
  method: "PATCH",
  headers: { cookie: sOwner.cookie },
  body: { memberId: idAdmin2, offline: false },
});
check("10c. propietario lo pone online", r.status === 200 && r.json?.offline === false, String(r.status));

// 11) vuelta online del miembro: acceso restaurado de verdad
r = await api("/api/settings/team", {
  method: "PATCH",
  headers: { cookie: sOwner.cookie },
  body: { memberId: idMember, offline: false },
});
check("11. member online", r.status === 200, String(r.status));
const reMember2 = await login(MEMBER.email, PASS);
let conv = { status: 0 };
if (reMember2.cookie) {
  conv = await api("/api/conversations", { headers: { cookie: reMember2.cookie } });
}
check("11b. member login + acceso OK", reMember2.status === 200 && conv.status === 200, `${reMember2.status}/${conv.status}`);

console.log(`\nRESULTADO: ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
