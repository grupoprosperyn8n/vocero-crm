// E2E "Nueva conversación" (2026-09-13) — abrir un chat desde el CRM
// eligiendo contacto (del CRM o del sistema) y plataforma (WhatsApp/Telegram).
// HTTP puro contra el dev 3001 (mismo patrón que 1F/1E/2A).
//
// Casos: hilo existente (mismo, sin duplicar) · cerrado → reabre · contacto
// sin hilo → lo crea · plataforma sin identidad → 422 claro · Telegram.
// Todo sintético y con perfiles de prueba.
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
const EMAIL = `e2e-nc-${stamp}@test.local`;
const PASS = "E2E-NC-2026!";
const NAME = `E2E NC ${stamp}`;

// 0) alta empleado de prueba + login (cookie)
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

const fetchConvs = async (status) => {
  const r = await api(`/api/conversations?status=${status}`, { headers: auth });
  return r.json?.conversations ?? [];
};

const mkInbound = (channel, externalId, text, profileName) =>
  api("/api/bot/inbound", {
    method: "POST",
    headers: { "x-api-key": BOT_KEY },
    body: { channel, externalId, profileName, text, eventId: `e2e-nc-${stamp}-${text.slice(0, 10)}-${channel}` },
  });

// 1) WhatsApp: contacto que ya vino por el conector (hilo existente)
const waPhone = `549${String(stampNum % 100000000).padStart(8, "0")}31`;
const waIn = await mkInbound("whatsapp", waPhone, "Hola, quiero cotizar", `${NAME} WA`);
check(
  "1. inbound WhatsApp creó contacto + hilo",
  waIn.status === 200 && !!waIn.json?.contactId && !!waIn.json?.conversationId,
  `status ${waIn.status}`
);
const waContactId = waIn.json?.contactId;
const waConvId = waIn.json?.conversationId;

const open1 = await api("/api/conversations/open", {
  method: "POST",
  headers: auth,
  body: { contactId: waContactId, channel: "whatsapp" },
});
check(
  "2. abrir WhatsApp: mismo hilo, sin duplicar",
  open1.status === 200 && open1.json?.conversationId === waConvId &&
    open1.json?.created === false && open1.json?.reopened === false,
  `status ${open1.status} ${JSON.stringify(open1.json)}`
);

const cola1 = await fetchConvs("open");
check("3. el hilo está en la cola (En curso)", cola1.some((c) => c.id === waConvId));

// 2) cerrada → al abrirla de nuevo se reabre y vuelve a la cola
const cierre = await api(`/api/conversations/${waConvId}`, {
  method: "PATCH",
  headers: auth,
  body: { close: true },
});
check("4. cerrar (archivar)", cierre.status === 200, `status ${cierre.status}`);
const colaCerradas = await fetchConvs("closed");
check("4b. quedó en Cerradas", colaCerradas.some((c) => c.id === waConvId));

const open2 = await api("/api/conversations/open", {
  method: "POST",
  headers: auth,
  body: { contactId: waContactId, channel: "whatsapp" },
});
check(
  "5. abrir de nuevo: la reabre",
  open2.status === 200 && open2.json?.conversationId === waConvId && open2.json?.reopened === true,
  `status ${open2.status} ${JSON.stringify(open2.json)}`
);
const cola2 = await fetchConvs("open");
check("5b. volvió a la cola", cola2.some((c) => c.id === waConvId));

// 3) plataforma sin identidad → error claro, sin abrir nada
const mismatch = await api("/api/conversations/open", {
  method: "POST",
  headers: auth,
  body: { contactId: waContactId, channel: "telegram" },
});
check(
  "6. WhatsApp→Telegram: 422 claro",
  mismatch.status === 422 && mismatch.json?.error?.code === "channel_mismatch",
  `status ${mismatch.status} ${JSON.stringify(mismatch.json?.error ?? null)}`
);

// 4) contacto del CRM capturado a mano (sin hilo): lo crea
const manualPhone = `549${String(stampNum % 100000000).padStart(8, "0")}32`;
const contacto = await api("/api/contacts", {
  method: "POST",
  headers: auth,
  body: { name: `${NAME} manual`, phone: manualPhone, notes: "e2e nueva conversación" },
});
const manualId = contacto.json?.contact?.id;
check("7. contacto manual creado", contacto.status === 201 && !!manualId, `status ${contacto.status}`);

const open3 = await api("/api/conversations/open", {
  method: "POST",
  headers: auth,
  body: { contactId: manualId, channel: "whatsapp" },
});
check(
  "8. contacto sin hilo: lo crea (created=true)",
  open3.status === 200 && open3.json?.created === true,
  `status ${open3.status} ${JSON.stringify(open3.json)}`
);
const cola3 = await fetchConvs("open");
check("8b. el hilo nuevo está en la cola", cola3.some((c) => c.id === open3.json?.conversationId));

// 5) Telegram: contacto que ya escribió al bot
const tgChat = `7${String(stampNum % 1000000000).padStart(9, "0")}`;
const tgIn = await mkInbound("telegram", tgChat, "Hola desde Telegram", `${NAME} TG`);
check(
  "9. inbound Telegram creó contacto + hilo",
  tgIn.status === 200 && !!tgIn.json?.contactId && !!tgIn.json?.conversationId,
  `status ${tgIn.status}`
);
const openTg = await api("/api/conversations/open", {
  method: "POST",
  headers: auth,
  body: { contactId: tgIn.json?.contactId, channel: "telegram" },
});
check(
  "10. abrir Telegram: mismo hilo",
  openTg.status === 200 && openTg.json?.conversationId === tgIn.json?.conversationId,
  `status ${openTg.status} ${JSON.stringify(openTg.json)}`
);

// limpieza del empleado e2e (las convs quedan en el dev DB — archivar, no borrar)
const del = await api(`/api/admin/users?email=${encodeURIComponent(EMAIL)}`, {
  method: "DELETE",
  headers: { "x-admin-key": ADMIN_KEY },
});
check("11. cleanup empleado", del.status === 200, String(del.status));

console.log(`\nNueva conversación: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
