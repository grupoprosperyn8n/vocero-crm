// e2e Bloque 1E — Conector webhook de entrada /api/bot/inbound.
// Corre contra el dev 3001. Verifica: auth, validación, ingesta con dedup,
// hilo estable por externalId, handoff con router (sin online => bandeja).
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
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const stamp = Date.now().toString(36);
const stampNum = Date.now();
const PHONE = `5491155550${stampNum % 1000}`.padEnd(13, "0").slice(0, 13); // único por corrida
const NAME = `Ana E2E ${stamp}`;
const EMAIL = `e2e1e-${stamp}@test.local`;
const PASS = "E2E-1E-2026!";

// 0) auth: sin key => 401
{
  const r = await api("/api/bot/inbound", {
    method: "POST",
    body: { channel: "whatsapp", externalId: PHONE, text: "hola" },
  });
  check("0. sin bot key => 401", r.status === 401, String(r.status));
}
// 1) channel inválido => 422
{
  const r = await api("/api/bot/inbound", {
    method: "POST",
    headers: { "x-api-key": BOT_KEY },
    body: { channel: "signal", externalId: "x", text: "hola" },
  });
  check("1. channel desconocido => 422", r.status === 422, String(r.status));
}

// 2) alta empleado de prueba (para mirar la bandeja por API)
const alta = await api("/api/admin/users", {
  method: "PUT",
  headers: { "x-admin-key": ADMIN_KEY },
  body: { email: EMAIL, name: NAME, password: PASS, role: "member" },
});
check("2. alta empleado e2e", alta.status === 201 || alta.json?.created === false, String(alta.status));

// login del empleado para listar conversaciones
const loginRes = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: ORIGIN },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];
check("2b. login empleado", loginRes.status === 200 && !!cookie, String(loginRes.status));

const listConvs = async () => {
  const res = await fetch(`${BASE}/api/conversations`, { headers: { cookie } });
  const j = await res.json().catch(() => ({}));
  return (j.conversations ?? j ?? []).map((c) => c);
};

// 3) mensaje nuevo de WhatsApp => contacto+conv creados
const evt1 = `wa-${stamp}-1`;
const r3 = await api("/api/bot/inbound", {
  method: "POST",
  headers: { "x-api-key": BOT_KEY },
  body: {
    channel: "whatsapp",
    externalId: PHONE,
    profileName: "Ana Perez",
    text: "Hola, quiero info de una poliza",
    eventId: evt1,
    topic: "cotizacion",
  },
});
check("3. ingesta mensaje nuevo", r3.status === 200 && r3.json?.deduplicated === false, JSON.stringify(r3.json));
const convId1 = r3.json?.conversationId;
check("3b. devuelve conversationId", !!convId1, convId1 ?? "null");

// 4) reintento mismo eventId => deduplicated true, mismo conversationId
const r4 = await api("/api/bot/inbound", {
  method: "POST",
  headers: { "x-api-key": BOT_KEY },
  body: {
    channel: "whatsapp",
    externalId: PHONE,
    profileName: "Ana Perez",
    text: "Hola, quiero info de una poliza",
    eventId: evt1,
  },
});
check(
  "4. dedup por eventId",
  r4.status === 200 && r4.json?.deduplicated === true && r4.json?.conversationId === convId1,
  JSON.stringify(r4.json)
);

// 5) segundo mensaje, mismo cliente => misma conversación
const r5 = await api("/api/bot/inbound", {
  method: "POST",
  headers: { "x-api-key": BOT_KEY },
  body: {
    channel: "whatsapp",
    externalId: PHONE,
    text: "Me derivan con una persona?",
    eventId: `wa-${stamp}-2`,
  },
});
check(
  "5. hilo estable por externalId",
  r5.status === 200 && r5.json?.conversationId === convId1,
  JSON.stringify(r5.json)
);

// 6) requestHuman SIN nadie online => derivada, sin asignar (bandeja)
const r6 = await api("/api/bot/inbound", {
  method: "POST",
  headers: { "x-api-key": BOT_KEY },
  body: {
    channel: "whatsapp",
    externalId: PHONE,
    text: "Quiero hablar con una persona",
    eventId: `wa-${stamp}-3`,
    requestHuman: { reason: "pidió humano", topic: "atencion" },
  },
});
check(
  "6. requestHuman sin online => derivada sin chip",
  r6.status === 200 && r6.json?.handoff?.applied === true && r6.json?.handoff?.assignee === null,
  JSON.stringify(r6.json?.handoff)
);

// 6b. la conversación aparece en la bandeja con los 3 mensajes
const convs = await listConvs();
const found = convs.find((c) => c.id === convId1);
check("6b. conv visible en bandeja", !!found && found.contact?.name === "Ana Perez", JSON.stringify(found ? { name: found.contact?.name, unread: found.unreadCount } : null));
check("6c. topic 'atencion' guardado", found?.topic === "atencion", String(found?.topic));

// 7) requestHuman repetido => no re-deriva (idempotente), applied=false
const r7 = await api("/api/bot/inbound", {
  method: "POST",
  headers: { "x-api-key": BOT_KEY },
  body: {
    channel: "whatsapp",
    externalId: PHONE,
    text: "Sigo aca",
    eventId: `wa-${stamp}-4`,
    requestHuman: { topic: "reclamo" },
  },
});
check(
  "7. handoff idempotente (no pisa topic)",
  r7.status === 200 && r7.json?.handoff?.applied === false && r7.json?.handoff?.topic === "atencion",
  JSON.stringify(r7.json?.handoff)
);

// 8) canal telegram: gate CHANNELS del dev (default whatsapp => 404)
{
  const r = await api("/api/bot/inbound", {
    method: "POST",
    headers: { "x-api-key": BOT_KEY },
    body: { channel: "telegram", externalId: "12345", text: "hola" },
  });
  const channelsEnv = envOf("CHANNELS") ?? "whatsapp (default)";
  const esperado = channelsEnv.includes("telegram") ? 200 : 404;
  check(`8. telegram con CHANNELS='${channelsEnv}' => ${esperado}`, r.status === esperado, String(r.status));
}

// 9) limpieza del empleado e2e
const del = await api(
  `/api/admin/users?email=${encodeURIComponent(EMAIL)}`,
  { method: "DELETE", headers: { "x-admin-key": ADMIN_KEY } }
);
check("9. limpieza empleado", del.status === 200 && del.json?.removed === true, String(del.status));

console.log(`\nRESULTADO: ${pass} ok / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
