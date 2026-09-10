// Verifica la ficha del empleado en /api/settings/team + alta/baja con ficha
// (Bloque A — corre contra el dev 3001). Patrón copiado de scripts/e2e-1d-router.mjs.
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const envLocal = fs.readFileSync(".env.local", "utf8");
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const ORIGIN = process.env.E2E_ORIGIN ?? envOf("APP_BASE_URL") ?? BASE;
const ADMIN_KEY = envOf("ADMIN_API_KEY");
if (!ADMIN_KEY) {
  console.error("Falta ADMIN_API_KEY en .env.local");
  process.exit(1);
}

const stamp = Date.now();
const email = `e2e-ficha-${stamp}@sync.test`;
const PASS = "Ficha-A-2026!";

async function api(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      origin: ORIGIN,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return {
    status: res.status,
    json,
    cookie: (res.headers.get("set-cookie") ?? "").split(";")[0],
  };
}
const admin = (path, opts = {}) =>
  api(path, { ...opts, headers: { "x-admin-key": ADMIN_KEY, ...(opts.headers ?? {}) } });

let pass = 0;
let fail = 0;
const check = (n, ok, x = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "ok  " : "FAIL"} - ${n}${x ? " | " + x : ""}`);
};

// 1) alta con ficha
let r = await admin("/api/admin/users", {
  method: "PUT",
  body: {
    email,
    name: "E2E Ficha",
    password: PASS,
    role: "member",
    employeeCode: "TST001",
    operationalRole: "Empleado",
    locality: "(2000) ROSARIO",
    sourceStatus: "ACTIVO",
  },
});
check(
  "alta con ficha (created + staff)",
  r.status === 201 && r.json?.created === true && (r.json?.changes ?? []).includes("staff"),
  `${r.status} ${JSON.stringify(r.json)}`
);

// 2) mismo payload => sin cambios de ficha (idempotente)
r = await admin("/api/admin/users", {
  method: "PUT",
  body: {
    email,
    name: "E2E Ficha",
    role: "member",
    employeeCode: "TST001",
    operationalRole: "Empleado",
    locality: "(2000) ROSARIO",
    sourceStatus: "ACTIVO",
  },
});
check(
  "idempotente (changes sin staff)",
  r.status === 200 && !(r.json?.changes ?? []).includes("staff"),
  `${r.status} ${JSON.stringify(r.json)}`
);

// 3) cambio real de ficha => changes incluye staff
r = await admin("/api/admin/users", {
  method: "PUT",
  body: {
    email,
    name: "E2E Ficha",
    role: "member",
    employeeCode: "TST002",
    operationalRole: "Gerente",
    locality: "(3000) SANTA FE",
    sourceStatus: "ACTIVO",
  },
});
check(
  "cambio de ficha => staff",
  r.status === 200 && (r.json?.changes ?? []).includes("staff"),
  `${r.status} ${JSON.stringify(r.json)}`
);

// 4) login como el usuario y lectura de Equipo
const login = await api("/api/auth/sign-in/email", {
  method: "POST",
  body: { email, password: PASS },
});
check("login", login.status === 200 && !!login.cookie, String(login.status));
const team = await api("/api/settings/team", { headers: { cookie: login.cookie } });
const me = (team.json?.members ?? []).find((m) => m.email === email);
check("team 200", team.status === 200, String(team.status));
check(
  "ficha visible en team",
  !!me &&
    me.employeeCode === "TST002" &&
    me.operationalRole === "Gerente" &&
    me.locality === "(3000) SANTA FE" &&
    me.sourceStatus === "ACTIVO",
  JSON.stringify(me)
);

// 5) baja (rutina e2e: DELETE admin quita la membresía)
r = await admin(`/api/admin/users?email=${encodeURIComponent(email)}`, {
  method: "DELETE",
});
check("baja", r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);

console.log(`\nResultado: ${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
