// e2e ronda 038 — Dashboard Management (cockpit embebido).
// Corre contra el dev 3001:
//   - owner: ve la entrada del menú y la página sirve el iframe del cockpit;
//   - member: no ve la entrada y la ruta lo redirige a la Bandeja (server-side);
//   - instancia con DASHBOARD_MANAGEMENT_URL=off: la ruta responde 404
//     (se prueba pasando BASE_OFF_URL=http://localhost:3002).
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const BASE_OFF = process.env.BASE_OFF_URL ?? null;
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
const PASS = "E2E-038-Dash-2026!";
const OWNER = { email: `e2e-038-owner-${stamp}@test.local`, name: "E2E 038 Owner", role: "owner" };
const MEMBER = { email: `e2e-038-member-${stamp}@test.local`, name: "E2E 038 Member", role: "member" };

// 0) altas + logins
for (const u of [OWNER, MEMBER]) {
  const res = await fetch(`${BASE}/api/admin/users`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ email: u.email, name: u.name, password: PASS, role: u.role }),
  });
  check(`0. alta ${u.role}`, res.status === 201, String(res.status));
}
const sOwner = await login(OWNER.email, PASS);
const sMember = await login(MEMBER.email, PASS);
check(
  "1. logins owner/member",
  sOwner.status === 200 && sMember.status === 200,
  `${sOwner.status}/${sMember.status}`
);
const h = (s) => ({ cookie: s.cookie });

// 2) OWNER: la página sirve el iframe del cockpit (200 + src correcto)
const pageOwner = await fetch(`${BASE}/dashboard-management`, {
  headers: h(sOwner),
  redirect: "manual",
});
const htmlOwner = pageOwner.status === 200 ? await pageOwner.text() : "";
check("2. owner abre la página (200)", pageOwner.status === 200, String(pageOwner.status));
check(
  "3. el HTML trae el iframe del cockpit",
  htmlOwner.includes('src="https://dashbord-raseguros.sistemasagenticos.cloud'),
  pageOwner.status === 200 ? "" : "sin body"
);

// 3) OWNER: el menú muestra la entrada
const inboxOwner = await fetch(`${BASE}/inbox`, { headers: h(sOwner), redirect: "manual" });
const htmlInboxOwner = inboxOwner.status === 200 ? await inboxOwner.text() : "";
check(
  "4. owner ve «Dashboard Management» en el menú",
  htmlInboxOwner.includes("Dashboard Management"),
  `status ${inboxOwner.status}`
);

// 4) MEMBER: la ruta redirige a la Bandeja (camino infeliz)
const pageMember = await fetch(`${BASE}/dashboard-management`, {
  headers: h(sMember),
  redirect: "manual",
});
const loc = pageMember.headers.get("location") ?? "";
check(
  "5. member es redirigido a /inbox",
  (pageMember.status === 307 || pageMember.status === 308) && loc.includes("/inbox"),
  `${pageMember.status} → ${loc}`
);

// 5) MEMBER: el menú no muestra la entrada
const inboxMember = await fetch(`${BASE}/inbox`, { headers: h(sMember), redirect: "manual" });
const htmlInboxMember = inboxMember.status === 200 ? await inboxMember.text() : "";
check(
  "6. member NO ve la entrada en el menú",
  !htmlInboxMember.includes("Dashboard Management"),
  `status ${inboxMember.status}`
);

// 6) INSTANCIA APAGADA (DASHBOARD_MANAGEMENT_URL=off): la ruta no existe
if (BASE_OFF) {
  const loginOff = async (email, password) => {
    const res = await fetch(`${BASE_OFF}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify({ email, password }),
    });
    const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
    return { status: res.status, cookie: cookie || null };
  };
  const sOff = await loginOff(OWNER.email, PASS);
  check("7. login contra la instancia apagada", sOff.status === 200, String(sOff.status));
  const pageOff = await fetch(`${BASE_OFF}/dashboard-management`, {
    headers: h(sOff),
    redirect: "manual",
  });
  check("8. instancia off → 404 (la ruta no existe)", pageOff.status === 404, String(pageOff.status));
  const inboxOff = await fetch(`${BASE_OFF}/inbox`, { headers: h(sOff), redirect: "manual" });
  const htmlInboxOff = inboxOff.status === 200 ? await inboxOff.text() : "";
  check(
    "9. instancia off: tampoco aparece en el menú",
    !htmlInboxOff.includes("Dashboard Management"),
    `status ${inboxOff.status}`
  );
} else {
  console.log("SKIP 7-9: sin BASE_OFF_URL (correr también contra un server con DASHBOARD_MANAGEMENT_URL=off)");
}

console.log(`\n038 Dashboard Management: ${pass} PASS / ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
