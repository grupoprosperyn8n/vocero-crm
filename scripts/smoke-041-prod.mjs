// 041 — Smoke de PROD con usuario sintético (alta → pruebas read-only → baja).
import fs from "node:fs";

const BASE = "https://vocero.sistemasagenticos.cloud";
const envLocal = fs.readFileSync("/home/diegol/Documentos/vocero-crm/.env.local", "utf8");
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const ADMIN_KEY = process.env.SMOKE_ADMIN_KEY ?? envOf("ADMIN_API_KEY");
const ORIGIN = process.env.SMOKE_ORIGIN ?? BASE;
const stamp = Date.now().toString(36);
const EMAIL = `smoke-041-${stamp}@test.local`;
const PASS = `Smoke-041-${stamp}!`;

let pass = 0, fail = 0;
const check = (n, ok, x = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${n}${x ? " — " + x : ""}`); ok ? pass++ : fail++; };

const alta = await fetch(`${BASE}/api/admin/users`, {
  method: "PUT",
  headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
  body: JSON.stringify({ email: EMAIL, name: "Smoke 041", password: PASS, role: "owner" }),
});
check("alta sintética", alta.status === 201, String(alta.status));

const login = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { origin: ORIGIN, "content-type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
check("login", login.status === 200 && cookie.length > 10, String(login.status));

const H = { cookie, origin: ORIGIN };

const ficha = await fetch(`${BASE}/api/clients/ficha?recordId=recurQlBShR8FXE9L`, { headers: H });
const fj = await ficha.json().catch(() => ({}));
check("ficha 360 en prod", ficha.status === 200 && (fj.ficha?.policies?.length ?? 0) >= 1,
  `polizas=${fj.ficha?.policies?.length} prima=${fj.ficha?.premiumActiva}`);
check("series 12 m", fj.ficha?.expirationsByMonth?.length === 12 && fj.ficha?.gestionesByMonth?.length === 12);

const props = await fetch(`${BASE}/api/proposals`, { headers: H });
const pj = await props.json().catch(() => ({}));
check("propuestas + embudo", props.status === 200 && pj.funnel && typeof pj.funnel.total === "number", JSON.stringify(pj.funnel ?? {}));

const tpl = await fetch(`${BASE}/api/proposals/templates`, { headers: H });
const tj = await tpl.json().catch(() => ({}));
check("5 plantillas por tipo", tpl.status === 200 && (tj.templates?.length ?? 0) === 5, String(tj.templates?.length));

const del = await fetch(`${BASE}/api/admin/users?email=${encodeURIComponent(EMAIL)}`, {
  method: "DELETE",
  headers: { "x-admin-key": ADMIN_KEY },
});
check("baja del sintético (limpieza)", del.ok, String(del.status));

console.log(`\n${pass}/${pass + fail} smoke prod OK`);
process.exit(fail ? 1 : 0);
