// e2e Bloque 1G — Conectores salientes configurables (multi conector).
// Corre contra el dev 3001. Verifica: CRUD de conectores (021: la
// customización es del PROPIETARIO; admin y member rebotan 403), cierre emite
// a TODOS los habilitados con destino+destino en el payload, apagado deja de
// recibir, y el receptor de prueba acumula los eventos.
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const envLocal = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const BOT_KEY = envOf("BOT_API_KEY");
const ADMIN_KEY = envOf("ADMIN_API_KEY");
const ORIGIN = envOf("APP_BASE_URL") ?? BASE;

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

const stamp = Date.now().toString(36);
const stampNum = Date.now();
try { fs.rmSync("/tmp/closure-hook.jsonl", { force: true }); } catch {}
const PHONE = `5491166666${String(stampNum % 1000).padStart(3, "0")}`.slice(0, 13);
const EMAIL_OWNER = `e2e1g-owner-${stamp}@test.local`;
const EMAIL_ADMIN = `e2e1g-admin-${stamp}@test.local`;
const EMAIL_MEMBER = `e2e1g-member-${stamp}@test.local`;
const PW = "E2E-1G-2026!";

// 0) altas owner/admin/member de prueba, login de los tres
const mkUser = async (email, name, role) => {
  const r = await api("/api/admin/users", {
    method: "PUT",
    headers: { "x-admin-key": ADMIN_KEY },
    body: { email, name, password: PW, role },
  });
  check(`0. alta ${role} ${name}`, r.status === 201 || r.json?.created === false, String(r.status));
  const lr = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ email, password: PW }),
  });
  const cookie = (lr.headers.get("set-cookie") || "").split(";")[0];
  return cookie;
};
// 021 — El CRUD de conectores va con el PROPIETARIO; admin y member
// verifican que la customización quedó bloqueada para ellos.
const cookieOwner = await mkUser(EMAIL_OWNER, "Owner 1G", "owner");
const cookieAdmin = await mkUser(EMAIL_ADMIN, "Admin 1G", "admin");
const cookieMember = await mkUser(EMAIL_MEMBER, "Member 1G", "member");

// 1) member NO puede crear conectores (021: customización solo propietario)
{
  const r = await api("/api/settings/connectors", {
    method: "POST",
    headers: { cookie: cookieMember },
    body: { name: "no-deberia", url: "http://127.0.0.1:3901/hook" },
  });
  check("1. member => 403 al crear", r.status === 403, String(r.status));
}

// 1b) el administrador tampoco (021)
{
  const r = await api("/api/settings/connectors", {
    method: "POST",
    headers: { cookie: cookieAdmin },
    body: { name: "no-deberia-admin", url: "http://127.0.0.1:3901/hook" },
  });
  check("1b. admin => 403 al crear", r.status === 403, String(r.status));
  const rl = await api("/api/settings/connectors", { headers: { cookie: cookieAdmin } });
  check("1c. admin => 403 al listar", rl.status === 403, String(rl.status));
}

// 2) el propietario crea dos conectores: uno OK y uno apagado
const HOOK = "http://127.0.0.1:3901/hook";
const c1 = await api("/api/settings/connectors", {
  method: "POST",
  headers: { cookie: cookieOwner },
  body: { name: "Receptor 1G OK", url: HOOK, secret: "secret-1g-ok-123456" },
});
const id1 = c1.json?.connector?.id;
check("2. alta conector 1 (con firma)", c1.status === 201 && !!id1 && c1.json?.connector?.secretSet === true, String(c1.status));

const c2 = await api("/api/settings/connectors", {
  method: "POST",
  headers: { cookie: cookieOwner },
  body: { name: "Receptor 1G apagado", url: HOOK },
});
const id2 = c2.json?.connector?.id;
check("2b. alta conector 2", c2.status === 201 && !!id2, String(c2.status));

// 3) la lista no expone el secreto
{
  const r = await api("/api/settings/connectors", { headers: { cookie: cookieOwner } });
  const list = r.json?.connectors ?? [];
  const c = list.find((x) => x.id === id1);
  check("3. GET lista + secret nunca viaja", r.status === 200 && c?.secretSet === true && c?.secret === undefined, `n=${list.length}`);
}

// 4) apagar el conector 2
{
  const r = await api(`/api/settings/connectors/${id2}`, {
    method: "PATCH",
    headers: { cookie: cookieOwner },
    body: { enabled: false },
  });
  check("4. apagar conector 2", r.status === 200, String(r.status));
}

// 5) cerrar una conversación => emite SOLO al conector habilitado, con su
//    destino en el payload y firma del secreto propio
{
  const evt = `1g-${stamp}`;
  const ing = await api("/api/bot/inbound", {
    method: "POST",
    headers: { "x-api-key": BOT_KEY },
    body: {
      channel: "whatsapp",
      externalId: PHONE,
      profileName: "Gaston 1G",
      text: "Quiero saber si mi poliza de hogar cubre daños por agua",
      eventId: evt,
    },
  });
  const convId = ing.json?.conversationId;
  check("5. ingesta conv", ing.status === 200 && !!convId, convId ?? String(ing.status));

  const cl = await api(`/api/conversations/${convId}`, {
    method: "PATCH",
    headers: { cookie: cookieOwner },
    body: { close: true },
  });
  await new Promise((r) => setTimeout(r, 800));
  check(
    "5b. cierre enviado (webhook=sent)",
    cl.json?.closure?.webhook === "sent",
    JSON.stringify(cl.json?.closure?.webhookError)
  );

  const evts = received();
  check("5c. receptor recibió 1 evento (solo el habilitado)", evts.length === 1, String(evts.length));
  const b = evts[0]?.body ?? {};
  check(
    "5d. payload con destination del conector 1",
    b.destination?.id === id1 && b.destination?.name === "Receptor 1G OK",
    JSON.stringify(b.destination)
  );
  check("5e. firma presente (secreto del conector)", typeof evts[0]?.signature === "string" && evts[0].signature.length === 64, String(evts[0]?.signature?.length));
  check("5f. gestión curada en el payload", typeof b.summary === "string" && b.summary.length > 0, String(typeof b.summary));
}

// 6) apagar el conector 1 => la siguiente conv cierra con skipped (sin destinos)
{
  await api(`/api/settings/connectors/${id1}`, {
    method: "PATCH",
    headers: { cookie: cookieOwner },
    body: { enabled: false },
  });
  const ing = await api("/api/bot/inbound", {
    method: "POST",
    headers: { "x-api-key": BOT_KEY },
    body: {
      channel: "whatsapp",
      externalId: PHONE.replace(/\d$/, "9"),
      profileName: "Gaston 1G bis",
      text: "Consulta de prueba",
      eventId: `1g-${stamp}-bis`,
    },
  });
  const cl = await api(`/api/conversations/${ing.json?.conversationId}`, {
    method: "PATCH",
    headers: { cookie: cookieOwner },
    body: { close: true },
  });
  check("6. sin conectores habilitados => skipped", cl.json?.closure?.webhook === "skipped", JSON.stringify(cl.json?.closure));
}

// 7) test del conector: reencendido + POST test verifica el circuito
{
  await api(`/api/settings/connectors/${id1}`, {
    method: "PATCH",
    headers: { cookie: cookieOwner },
    body: { enabled: true },
  });
  const r = await api(`/api/settings/connectors/${id1}/test`, {
    method: "POST",
    headers: { cookie: cookieOwner },
  });
  await new Promise((r2) => setTimeout(r2, 500));
  const evts = received();
  const last = evts[evts.length - 1];
  check("7. prueba de conector OK", r.status === 200 && r.json?.ok === true, String(r.json?.status));
  check("7b. evento test llegó al destino", last?.event === "test" && last?.body?.destination?.id === id1, last?.event);
}

// 8) borrar el conector 1 (y el 2 apagado); DELETE gate: member y admin 403
{
  const rM = await api(`/api/settings/connectors/${id1}`, {
    method: "DELETE",
    headers: { cookie: cookieMember },
  });
  check("8. member => 403 al eliminar", rM.status === 403, String(rM.status));
  const rA = await api(`/api/settings/connectors/${id1}`, {
    method: "DELETE",
    headers: { cookie: cookieAdmin },
  });
  check("8a. admin => 403 al eliminar", rA.status === 403, String(rA.status));
  const r = await api(`/api/settings/connectors/${id1}`, {
    method: "DELETE",
    headers: { cookie: cookieOwner },
  });
  check("8b. DELETE conector 1 (owner)", r.status === 200, String(r.status));
  const r404 = await api(`/api/settings/connectors/${id1}`, {
    method: "PATCH",
    headers: { cookie: cookieOwner },
    body: { enabled: true },
  });
  check("8c. conector borrado => 404", r404.status === 404, String(r404.status));
  // limpiar el conector 2
  await api(`/api/settings/connectors/${id2}`, {
    method: "DELETE",
    headers: { cookie: cookieOwner },
  });
}

// 9) cleanup usuarios
for (const email of [EMAIL_OWNER, EMAIL_ADMIN, EMAIL_MEMBER]) {
  const d = await api(`/api/admin/users?email=${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: { "x-admin-key": ADMIN_KEY },
  });
  check("9. cleanup " + email, d.status === 200, String(d.status));
}

console.log(`\n1G: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
