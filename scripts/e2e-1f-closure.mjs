// e2e Bloque 1F — Cierre de conversación con curado y webhook saliente.
// Corre contra el dev 3001 (requiere CLOSURE_WEBHOOK_URL=http://127.0.0.1:3901/hook
// en el entorno del dev; el receptor local acumula en /tmp/closure-hook.jsonl).
// Verifica: cierre idempotente, fuera de la cola, resumen curado en el
// payload, firma y datos de gestión correctos, sin re-emisión.
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
// Log fresco del receptor (puede tener eventos de corridas anteriores).
try { fs.rmSync("/tmp/closure-hook.jsonl", { force: true }); } catch {}
const PHONE = `5491155551${String(stampNum % 1000).padStart(3, "0")}`.slice(0, 13);
const NAME = `Claudio E2E 1F ${stamp}`;
const EMAIL = `e2e1f-${stamp}@test.local`;
const PASS = "E2E-1F-2026!";

const received = () => {
  try {
    return fs
      .readFileSync("/tmp/closure-hook.jsonl", "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

// 0) alta empleado de prueba + login (misma mecánica que 1E)
const alta = await api("/api/admin/users", {
  method: "PUT",
  headers: { "x-admin-key": ADMIN_KEY },
  body: { email: EMAIL, name: NAME, password: PASS, role: "member" },
});
check("0. alta empleado e2e", alta.status === 201 || alta.json?.created === false, String(alta.status));

const loginRes = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: ORIGIN },
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];
check("0b. login empleado", loginRes.status === 200 && !!cookie, String(loginRes.status));

// 1) ingestar una conversación por el conector (como haría el backend)
const evt = `1f-${stamp}-1`;
const r1 = await api("/api/bot/inbound", {
  method: "POST",
  headers: { "x-api-key": BOT_KEY },
  body: {
    channel: "whatsapp",
    externalId: PHONE,
    profileName: "Claudio Rodriguez",
    text: "Hola, quiero cotizar un seguro de auto para mi Cronos 2022",
    eventId: evt,
    topic: "cotizacion",
  },
});
const convId = r1.json?.conversationId;
check("1. ingesta por conector", r1.status === 200 && !!convId, convId ?? String(r1.status));

// 2) clasificar la conversación (el topic lo define el operador/agente, no
// el conector — diseño 1B) y verificar que quedó abierta en la cola
{
  const p = await api(`/api/conversations/${convId}`, {
    method: "PATCH",
    headers: { cookie },
    body: { topic: "cotizacion" },
  });
  check("2. clasificación aplicada", p.status === 200 && p.json?.conversation?.topic === "cotizacion");
  const res = await fetch(`${BASE}/api/conversations`, { headers: { cookie } });
  const j = await res.json().catch(() => ({}));
  const convs = j.conversations ?? j ?? [];
  const c = convs.find((x) => x.id === convId);
  check(
    "2b. conv visible en la cola (abierta)",
    !!c && c.closedAt === null && c.topic === "cotizacion",
    c ? `closedAt=${c.closedAt} topic=${c.topic}` : "no está"
  );
}

// 3) cerrar la conversación => DTO cerrado + webhook enviado al receptor
const r3 = await api(`/api/conversations/${convId}`, {
  method: "PATCH",
  headers: { cookie },
  body: { close: true },
});
const closure = r3.json?.closure;
check(
  "3. cierre: 200 + DTO cerrado",
  r3.status === 200 && r3.json?.conversation?.closedAt !== null,
  JSON.stringify(closure ?? r3.json?.error)
);
check("3b. webhook enviado al receptor", closure?.webhook === "sent", String(closure?.webhook));
check("3c. resumen curado presente o null explícito", "summary" in (closure ?? {}), String(closure?.summary));

// 4) el receptor recibió el payload curado correcto
await new Promise((r) => setTimeout(r, 600));
{
  const evts = received();
  const e = evts[0];
  check("4. receptor recibió 1 evento", evts.length === 1, String(evts.length));
  check("4b. event=conversation.closed", e?.event === "conversation.closed", e?.event);
  const b = e?.body ?? {};
  check("4c. payload con conversationId + contact + topic", b.conversationId === convId && b.contact?.phone === PHONE && b.topic === "cotizacion", b.contact?.phone);
  check("4d. closedBy = empleado que cerró", b.closedBy?.name === NAME, b.closedBy?.name);
  check("4e. channel y conteo de mensajes", b.channel === "whatsapp" && b.messageCount >= 1, `msgs=${b.messageCount}`);
  check("4f. el transcript NO viaja", !b.transcript && !b.messages, "ok");
}

// 5) fuera de la cola: el listado ya no la muestra
{
  const res = await fetch(`${BASE}/api/conversations`, { headers: { cookie } });
  const j = await res.json().catch(() => ({}));
  const convs = j.conversations ?? j ?? [];
  check("5. conv cerrada fuera de la cola", !convs.some((x) => x.id === convId), String(convs.length));
}

// 6) idempotencia: cerrar de nuevo => alreadyClosed y SIN re-emisión
{
  const r6 = await api(`/api/conversations/${convId}`, {
    method: "PATCH",
    headers: { cookie },
    body: { close: true },
  });
  await new Promise((r) => setTimeout(r, 400));
  check("6. re-cierre idempotente", r6.json?.closure?.alreadyClosed === true, JSON.stringify(r6.json?.closure));
  check("6b. sin re-emisión al receptor", received().length === 1, String(received().length));
}

// 7) cerrar una conv inexistente => 404
{
  const r7 = await api("/api/conversations/cv_noexiste_1f", {
    method: "PATCH",
    headers: { cookie },
    body: { close: true },
  });
  check("7. conv inexistente => 404", r7.status === 404, String(r7.status));
}

// 8) cleanup del empleado e2e
{
  const del = await api(`/api/admin/users?email=${encodeURIComponent(EMAIL)}`, {
    method: "DELETE",
    headers: { "x-admin-key": ADMIN_KEY },
  });
  check("8. cleanup empleado e2e", del.status === 200, String(del.status));
}

console.log(`\n1F: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
