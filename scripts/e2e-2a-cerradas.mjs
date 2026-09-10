// e2e Bloque 2A — Pestañas En curso/Cerradas: contadores, salida de cola,
// listado del archivo (etiqueta + quién cerró) y reapertura.
// HTTP puro contra el dev 3001 (mismo patrón que 1F/1E).
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const envLocal = fs.existsSync(".env.local")
  ? fs.readFileSync(".env.local", "utf8")
  : "";
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const BOT_KEY = envOf("BOT_API_KEY");
const ADMIN_KEY = envOf("ADMIN_API_KEY");
const ORIGIN = envOf("APP_BASE_URL") ?? BASE;
if (!BOT_KEY || !ADMIN_KEY) {
  console.error("faltan BOT_API_KEY/ADMIN_API_KEY en .env.local");
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
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const stamp = Date.now().toString(36);
const stampNum = Date.now();
const EMAIL = `e2e2a-${stamp}@test.local`;
const PASS = "E2E-2A-2026!";
const NAME = `E2E 2A ${stamp}`;

// 0) alta empleado de prueba + login
const alta = await api("/api/admin/users", {
  method: "PUT",
  headers: { "x-admin-key": ADMIN_KEY },
  body: { email: EMAIL, name: NAME, password: PASS, role: "member" },
});
check("0. alta empleado", alta.status === 201 || alta.json?.created === false, String(alta.status));

const loginRes = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: ORIGIN },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];
check("0b. login", loginRes.status === 200 && !!cookie, String(loginRes.status));
const auth = { cookie };

const fetchList = async (status) => {
  const r = await api(`/api/conversations?status=${status}`, { headers: auth });
  return r.json;
};

// 1) baseline de contadores
const baseOpen = await fetchList("open");
const bOpen = baseOpen.openTotal;
const bClosed = baseOpen.closedTotal;
check(
  "1. contadores presentes",
  Number.isInteger(bOpen) && Number.isInteger(bClosed),
  `open=${bOpen} closed=${bClosed}`
);

// 2) tres conversaciones entrantes (dos con etiqueta, una sin)
const mkConv = async (suffix) => {
  const externalId = `549${String(stampNum % 100000000).padStart(8, "0")}${suffix}`;
  const r = await api("/api/bot/inbound", {
    method: "POST",
    headers: { "x-api-key": BOT_KEY },
    body: {
      channel: "whatsapp",
      externalId,
      profileName: `${NAME} ${suffix}`,
      text: `hola ${suffix}`,
      eventId: `2a-${stamp}-${suffix}`,
    },
  });
  return r.json?.conversationId ?? null;
};
const ids = {
  cot: await mkConv("1"),
  sin: await mkConv("2"),
  gen: await mkConv("3"),
};
check("2. ingesta de 3 convs", !!ids.cot && !!ids.sin && !!ids.gen, JSON.stringify(ids));

// 3) etiquetas: cotizacion / siniestro (la tercera queda sin etiqueta)
const setTopic = (id, topic) =>
  api(`/api/conversations/${id}`, { method: "PATCH", headers: auth, body: { topic } });
check("3. topic cotizacion", (await setTopic(ids.cot, "cotizacion")).status === 200);
check("3b. topic siniestro", (await setTopic(ids.sin, "siniestro")).status === 200);

// 4) las tres en En curso y suman al contador
const open1 = await fetchList("open");
const open1Ids = open1.conversations.map((c) => c.id);
check(
  "4. las 3 en la cola",
  [ids.cot, ids.sin, ids.gen].every((id) => open1Ids.includes(id)),
  `total=${open1.openTotal}`
);
check("4b. contador En curso = baseline + 3", open1.openTotal === bOpen + 3, `esperado=${bOpen + 3} real=${open1.openTotal}`);

// 5) cerrar las tres
for (const [k, id] of Object.entries(ids)) {
  const r = await api(`/api/conversations/${id}`, { method: "PATCH", headers: auth, body: { close: true } });
  check(
    `5. cierre ${k}`,
    r.status === 200 && typeof r.json?.conversation?.closedAt === "string",
    JSON.stringify(r.json?.closure ?? null)
  );
}

// 6) el archivo las lista con su etiqueta; la cola ya no las tiene
const closed1 = await fetchList("closed");
const cMap = Object.fromEntries(closed1.conversations.map((c) => [c.id, c]));
check("6. las 3 en Cerradas", [ids.cot, ids.sin, ids.gen].every((id) => id in cMap));
check(
  "6b. etiquetas conservadas (y la tercera sin etiqueta)",
  cMap[ids.cot]?.topic === "cotizacion" && cMap[ids.sin]?.topic === "siniestro" && (cMap[ids.gen]?.topic ?? null) === null
);
check("6c. closedBy = empleado que cerró", cMap[ids.cot]?.closedByName === NAME, cMap[ids.cot]?.closedByName);
const open2 = await fetchList("open");
check("6d. fuera de la cola", ![ids.cot, ids.sin, ids.gen].some((id) => open2.conversations.some((c) => c.id === id)));
check(
  "6e. contadores: En curso baseline, Cerradas +3",
  open2.openTotal === bOpen && open2.closedTotal === bClosed + 3,
  `open=${open2.openTotal} closed=${open2.closedTotal}`
);

// 7) reapertura → vuelve a la cola y sale del archivo
const re = await api(`/api/conversations/${ids.gen}`, { method: "PATCH", headers: auth, body: { reactivate: true } });
check("7. reapertura → closedAt null", re.status === 200 && re.json?.conversation?.closedAt === null, String(re.json?.conversation?.closedAt));
const open3 = await fetchList("open");
check("7b. reabierta en la cola", open3.conversations.some((c) => c.id === ids.gen), `open=${open3.openTotal}`);
const closed2 = await fetchList("closed");
check("7c. fuera del archivo", !closed2.conversations.some((c) => c.id === ids.gen));

// 8) re-cierre tras reabrir → ciclo completo, no queda "alreadyClosed"
const r8 = await api(`/api/conversations/${ids.gen}`, { method: "PATCH", headers: auth, body: { close: true } });
check("8. re-cierre tras reapertura", r8.json?.closure?.alreadyClosed === false, JSON.stringify(r8.json?.closure ?? null));

// 9) limpieza del empleado e2e (las convs quedan en el dev DB — archivar, no borrar)
const del = await api(`/api/admin/users?email=${encodeURIComponent(EMAIL)}`, {
  method: "DELETE",
  headers: { "x-admin-key": ADMIN_KEY },
});
check("9. cleanup empleado", del.status === 200, String(del.status));

console.log(`\n2A: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
