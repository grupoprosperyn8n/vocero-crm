/* E2E del Bloque 1D — router de asignación por presencia SSE.
   Corre contra el dev server local (puerto 3001, ROUTER_ASSIGN=on).

   Casos:
    1. Handoff con NADIE online   -> conversación sin asignar (assignee null).
    2. Handoff con A online       -> asignada a A (único candidato).
    3. Handoff con A y B online, A con carga 1 (caso 2 pendiente) y B con 0
                                    -> asignada a B (menor carga).
    4. El SSE de A recibe conversation.updated con assigneeId (en vivo).
   Al final da de baja a los empleados de prueba (DELETE admin) y cierra los SSE.

   Uso: node --env-file=.env scripts/e2e-1d-router.mjs   (o BASE_URL=... )
*/
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const envLocal = fs.existsSync(".env.local")
  ? fs.readFileSync(".env.local", "utf8")
  : "";
// mejor-auth valida el Origin contra APP_BASE_URL (que puede diferir del
// puerto de dev: 3000 canónico vs 3001 del dev de 1C/1D).
const envLocalOrigin = () => {
  const m = envLocal.match(/^APP_BASE_URL=(.*)$/m);
  return m ? m[1].trim() : undefined;
};
const ORIGIN = process.env.E2E_ORIGIN ?? envLocalOrigin() ?? BASE;
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const ADMIN_KEY =
  process.env.E2E_ADMIN_KEY ?? envOf("ADMIN_API_KEY") ?? "test-admin-key-1c-2026-abcdef";
const BOT_KEY = process.env.E2E_BOT_KEY ?? envOf("BOT_API_KEY");
if (!BOT_KEY) {
  console.error("Falta BOT_API_KEY en .env.local (o E2E_BOT_KEY)");
  process.exit(1);
}

const stamp = Date.now();
const emailA = `e2e-router-a-${stamp}@router.test`;
const emailB = `e2e-router-b-${stamp}@router.test`;
const PASS = "Router-1D-2026!";
const NAME_A = "Router A";
const NAME_B = "Router B";

let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "ok  " : "FAIL"} - ${name}${extra ? " | " + extra : ""}`);
};

async function api(path, { method = "GET", body, headers = {}, raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      // node/undici manda sec-fetch-mode:cors sin Origin -> mejor-auth 403
      // (MISSING_OR_NULL_ORIGIN). Mismo fix que el e2e de 1C.
      origin: ORIGIN,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  let json = null;
  try { json = await res.json(); } catch {}
  return {
    status: res.status,
    json,
    cookie: (res.headers.get("set-cookie") ?? "").split(";")[0],
  };
}

const admin = (path, opts = {}) =>
  api(path, { ...opts, headers: { "x-admin-key": ADMIN_KEY, ...(opts.headers ?? {}) } });

// ── Alta de los dos empleados de prueba (miembros) ─────────────────────────
for (const [em, nm] of [[emailA, NAME_A], [emailB, NAME_B]]) {
  const r = await admin("/api/admin/users", {
    method: "PUT",
    body: { email: em, name: nm, password: PASS, role: "member" },
  });
  check(`alta de ${nm}`, r.status === 201 && r.json?.created === true,
    `${r.status} ${JSON.stringify(r.json)}`);
}

const login = await api("/api/auth/sign-in/email", {
  method: "POST",
  body: { email: emailA, password: PASS },
});
const loginB = await api("/api/auth/sign-in/email", {
  method: "POST",
  body: { email: emailB, password: PASS },
});
check("login A (cookie)", login.status === 200 && !!login.cookie, String(login.status));
check("login B (cookie)", loginB.status === 200 && !!loginB.cookie, String(loginB.status));
const cookieA = login.cookie;
const cookieB = loginB.cookie;

// ── Helpers ─────────────────────────────────────────────────────────────────
async function listAs(cookie) {
  const r = await api("/api/conversations", { headers: { cookie } });
  return r.json?.conversations ?? [];
}

/** Crea una conversación web fresca (widget público) y devuelve su id. */
async function newWebConversation(label) {
  const s = await api("/api/public/web/session", { method: "POST" });
  const sessionId = s.json?.sessionId;
  if (!sessionId) return null;
  await api("/api/public/web/messages", {
    method: "POST",
    body: { sessionId, text: `Hola, necesito ${label}`, profileName: label },
  });
  // La conv nace del primer mensaje; la encontramos por el nombre del contacto.
  for (let i = 0; i < 20; i++) {
    const list = await listAs(cookieA);
    const found = list.find((c) => c.contact.name === label);
    if (found) return found.id;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

async function handoff(conversationId, topic) {
  return api("/api/bot/handoff", {
    method: "POST",
    body: { conversationId, topic },
    headers: { "x-api-key": BOT_KEY },
  });
}

/** Abre un SSE autenticado y devuelve { abort, events } con los eventos vistos. */
async function openSse(cookie) {
  const ctrl = new AbortController();
  const events = [];
  const res = await fetch(`${BASE}/api/events`, {
    headers: { cookie },
    signal: ctrl.signal,
  });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const pump = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const ev = frame.split("\n").find((l) => l.startsWith("event: "));
          const data = frame.split("\n").find((l) => l.startsWith("data: "));
          if (ev && data) {
            try { events.push({ type: ev.slice(7), data: JSON.parse(data.slice(6)) }); }
            catch {}
          }
        }
      }
    } catch {}
  })();
  // Espera a que el server confirme la conexión (": conectado") -> presencia ya registrada.
  await new Promise((r) => setTimeout(r, 600));
  return { abort: () => ctrl.abort(), events, done: pump };
}

// ── Caso 1: nadie online -> queda sin asignar ───────────────────────────────
const conv1 = await newWebConversation(`Cliente 1D-1 ${stamp}`);
check("crea conversación web 1", !!conv1, conv1 ?? "null");
if (conv1) {
  const h1 = await handoff(conv1, "cotizacion");
  check("handoff 1 responde ok", h1.status === 200, String(h1.status));
  const l1 = await listAs(cookieA);
  const c1 = l1.find((c) => c.id === conv1);
  check("caso 1: sin nadie online -> assignee null", c1 && c1.assignee === null,
    JSON.stringify({ assignee: c1?.assignee, handoffAt: c1?.handoffAt }));
}

// ── Caso 2: solo A online -> se asigna a A ──────────────────────────────────
const sseA = await openSse(cookieA);
const conv2 = await newWebConversation(`Cliente 1D-2 ${stamp}`);
if (conv2) {
  await handoff(conv2, "siniestro");
  let c2 = null;
  for (let i = 0; i < 15 && !c2?.assignee; i++) {
    const l = await listAs(cookieA);
    c2 = l.find((c) => c.id === conv2) ?? null;
    if (!c2?.assignee) await new Promise((r) => setTimeout(r, 300));
  }
  check("caso 2: A online -> asignada a A", c2?.assignee?.name === NAME_A,
    JSON.stringify(c2?.assignee));
  // caso 4 (en vivo): el SSE de A vio el conversation.updated con assignee.
  await new Promise((r) => setTimeout(r, 800));
  const sawAssign = sseA.events.some(
    (e) =>
      e.type === "conversation.updated" &&
      e.data?.conversation?.id === conv2 &&
      e.data?.conversation?.assigneeId
  );
  check("caso 4: SSE de A recibió la asignación en vivo", sawAssign,
    JSON.stringify(sseA.events.map((e) => e.type)));
}

// ── Caso 3: A (carga 1) + B (carga 0) online -> se asigna a B ───────────────
const sseB = await openSse(cookieB);
const conv3 = await newWebConversation(`Cliente 1D-3 ${stamp}`);
if (conv3) {
  await handoff(conv3, "cotizacion");
  let c3 = null;
  for (let i = 0; i < 15 && !c3?.assignee; i++) {
    const l = await listAs(cookieA);
    c3 = l.find((c) => c.id === conv3) ?? null;
    if (!c3?.assignee) await new Promise((r) => setTimeout(r, 300));
  }
  check("caso 3: menor carga (B=0 vs A=1) -> asignada a B",
    c3?.assignee?.name === NAME_B, JSON.stringify(c3?.assignee));
}

// ── Limpieza ────────────────────────────────────────────────────────────────
sseA.abort();
sseB.abort();
for (const em of [emailA, emailB]) {
  const r = await admin(`/api/admin/users?email=${encodeURIComponent(em)}`, {
    method: "DELETE",
  });
  console.log(`limpieza ${em}: ${r.status} ${JSON.stringify(r.json)}`);
}

console.log(`\nRESULTADO: ${pass} ok / ${fail} fail`);
process.exit(fail > 0 ? 1 : 0);
