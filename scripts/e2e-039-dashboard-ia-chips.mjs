// e2e ronda 039 — Dashboard Management: IA sobre la conexión del CRM +
// etiquetas con colores de Airtable.
//
// Corre contra el dev 3001 (mismo patrón que e2e-038):
//   - ai-status: owner 200 {configured, source, model}, member 403, anon 401;
//   - module-insight: owner 200 con insight (o 503 accionable si la IA no
//     está conectada), módulo/modo inválidos 400, member 403;
//   - insight de cliente: body inválido 400, member 403, owner 200/503;
//   - regresión 038: el proxy de datos sigue sirviendo las listas.
//   - con EXPECT_TAGS=1 además exige que las listas traigan `tags` (se usa
//     después de deployar el cockpit 039).
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
const PASS = "E2E-039-DashIA-2026!";
const OWNER = {
  email: `e2e-039-owner-${stamp}@test.local`,
  name: "E2E 039 Owner",
  role: "owner",
};
const MEMBER = {
  email: `e2e-039-member-${stamp}@test.local`,
  name: "E2E 039 Member",
  role: "member",
};

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
const jh = (s) => ({ ...h(s), "content-type": "application/json", origin: ORIGIN });

// 2) ai-status
const statusOwner = await fetch(`${BASE}/api/dashboard-management/ai-status`, {
  headers: h(sOwner),
});
const statusJson = await statusOwner.json().catch(() => null);
check(
  "2. ai-status owner 200 con forma esperada",
  statusOwner.status === 200 &&
    typeof statusJson?.configured === "boolean" &&
    "source" in (statusJson ?? {}) &&
    "model" in (statusJson ?? {}),
  `${statusOwner.status} configured=${statusJson?.configured} model=${statusJson?.model ?? "—"}`
);

const statusMember = await fetch(`${BASE}/api/dashboard-management/ai-status`, {
  headers: h(sMember),
});
check("2b. ai-status member 403", statusMember.status === 403, String(statusMember.status));

const statusAnon = await fetch(`${BASE}/api/dashboard-management/ai-status`);
check("2c. ai-status sin sesión 401", statusAnon.status === 401, String(statusAnon.status));

// 3) module-insight
const modBody = {
  module: "crm",
  mode: "dual",
  context: { contactosTotal: 10, conversacionesActivas: 2, leadsAbiertos: 1 },
};
const modOwner = await fetch(`${BASE}/api/dashboard-management/module-insight`, {
  method: "POST",
  headers: jh(sOwner),
  body: JSON.stringify(modBody),
});
const modJson = await modOwner.json().catch(() => null);

if (statusJson?.configured) {
  check(
    "3. module-insight owner 200 con insight",
    modOwner.status === 200 &&
      modJson?.ok === true &&
      typeof modJson?.insight?.resumen === "string" &&
      Array.isArray(modJson?.insight?.acciones) &&
      modJson.insight.acciones.length > 0,
    `${modOwner.status} modelo=${modJson?.insight?.model ?? "—"}`
  );
} else {
  check(
    "3. module-insight sin IA conectada → 503 accionable",
    modOwner.status === 503 &&
      modJson?.ok === false &&
      String(modJson?.error ?? "").includes("Ajustes → IA"),
    `${modOwner.status} ${String(modJson?.error ?? "").slice(0, 60)}`
  );
}

const modInvalid = await fetch(`${BASE}/api/dashboard-management/module-insight`, {
  method: "POST",
  headers: jh(sOwner),
  body: JSON.stringify({ module: "no-existe", mode: "dual", context: {} }),
});
check("3b. módulo inválido → 422", modInvalid.status === 422, String(modInvalid.status));

const modMember = await fetch(`${BASE}/api/dashboard-management/module-insight`, {
  method: "POST",
  headers: jh(sMember),
  body: JSON.stringify(modBody),
});
check("3c. module-insight member 403", modMember.status === 403, String(modMember.status));

// 4) insight de cliente
const cliInvalid = await fetch(`${BASE}/api/dashboard-management/insight`, {
  method: "POST",
  headers: jh(sOwner),
  body: JSON.stringify({ clientId: "x", mode: "dual", context: {} }),
});
check("4. insight sin nombre → 400", cliInvalid.status === 400, String(cliInvalid.status));

const cliMember = await fetch(`${BASE}/api/dashboard-management/insight`, {
  method: "POST",
  headers: jh(sMember),
  body: JSON.stringify({ clientId: "x", mode: "dual", context: { name: "Ana" } }),
});
check("4b. insight member 403", cliMember.status === 403, String(cliMember.status));

if (statusJson?.configured) {
  const cliOwner = await fetch(`${BASE}/api/dashboard-management/insight`, {
    method: "POST",
    headers: jh(sOwner),
    body: JSON.stringify({
      clientId: `e2e-039-${stamp}`,
      mode: "dual",
      context: {
        name: "Cliente E2E 039",
        activePolicies: 1,
        historicalOperations: 2,
        historicalAltas: 2,
        historicalAnulaciones: 0,
        historicalSiniestros: 0,
        activePremium: 1000,
        score: 70,
        recommendation: "Retener",
        recommendationWhy: "Póliza activa reciente",
        recommendationSteps: ["Llamarlo"],
      },
    }),
  });
  const cliJson = await cliOwner.json().catch(() => null);
  check(
    "4c. insight owner 200 con mensaje",
    cliOwner.status === 200 &&
      cliJson?.ok === true &&
      typeof cliJson?.insight?.accion === "string" &&
      typeof cliJson?.insight?.mensajeWhatsapp === "string",
    `${cliOwner.status} modelo=${cliJson?.insight?.model ?? "—"}`
  );
} else {
  console.log("INFO 4c. sin IA conectada local: no se prueba la generación real");
}

// 5) regresión 038: proxy de datos + (opcional) tags del cockpit 039
const dataOwner = await fetch(`${BASE}/api/dashboard-management/dashboard`, {
  headers: h(sOwner),
});
const dataJson = await dataOwner.json().catch(() => null);
const shapeOk = Boolean(
  dataJson && dataJson.migration && dataJson.historic && dataJson.current && dataJson.lists
);
check(
  "5. proxy dashboard 200 con datos reales (regresión 038)",
  dataOwner.status === 200 && shapeOk,
  `${dataOwner.status} ${shapeOk ? "shape ok" : "shape inesperado"}`
);

if (shapeOk) {
  const items = [];
  for (const moduleLists of Object.values(dataJson.lists ?? {})) {
    if (!Array.isArray(moduleLists)) continue;
    for (const list of moduleLists) {
      for (const item of list?.items ?? []) items.push(item);
    }
  }
  const tagged = items.filter((i) => Array.isArray(i.tags) && i.tags.length > 0);
  if (process.env.EXPECT_TAGS === "1") {
    check(
      "5b. listas con etiquetas Airtable (cockpit 039)",
      tagged.length > 0,
      `${tagged.length} de ${items.length} items`
    );
  } else {
    console.log(
      `INFO 5b. etiquetas: ${tagged.length} de ${items.length} items (usar EXPECT_TAGS=1 cuando el cockpit 039 esté deployado)`
    );
  }
}

console.log(`\n${fail === 0 ? "TODO OK" : "HAY FALLAS"} — ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
