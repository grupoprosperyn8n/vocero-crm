// 041 — verifica el aviso de derivación de punta a punta: crea usuarios A y
// B, deriva una propuesta de A hacia B (empleado distinto) y comprueba que el
// mensaje llegó al DM del chat interno de B.
import fs from "node:fs";
import { chromium } from "playwright";

const BASE = "http://localhost:3001";
const envLocal = fs.readFileSync(".env.local", "utf8");
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const ADMIN_KEY = envOf("ADMIN_API_KEY");
const ORIGIN = envOf("APP_BASE_URL") ?? BASE;
const stamp = Date.now().toString(36);

const mk = async (name, role) => {
  const slug = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const email = `dm-041-${stamp}-${slug}@test.local`;
  const pass = "DM-041-2026!";
  const res = await fetch(`${BASE}/api/admin/users`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
    body: JSON.stringify({ email, name, password: pass, role }),
  });
  return { email, pass, status: res.status };
};

const A = await mk(`Aviso A ${stamp}`, "owner");
const B = await mk(`Aviso B ${stamp}`, "owner");
console.log("usuarios:", A.status, B.status);

const browser = await chromium.launch();
// sesión de A
const ctxA = await browser.newContext();
const reqA = ctxA.request;
await reqA.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: A.email, password: A.pass },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
// id de B vía el directorio (A es owner)
const dir = await (await reqA.get(`${BASE}/api/staff/directory`)).json();
const bUser = (dir.members ?? []).find((m) => String(m.name).includes(`Aviso B ${stamp}`));
console.log("B userId:", bUser?.userId ? "ok" : "NO");

// propuesta de A (TEST IA) y derivación a B
const creada = await reqA.post(`${BASE}/api/proposals`, {
  data: {
    kind: "venta_cruzada",
    clientRef: "rechYRnw7FzaGjfpA",
    clientName: "TEST IA",
    clientDni: "26322995",
    clientPhone: "3417035515",
    title: `Aviso DM ${stamp}`,
  },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const creadaJson = await creada.json().catch(() => ({}));
const prop = creadaJson.proposal;
console.log("crear:", creada.status(), JSON.stringify(creadaJson).slice(0, 300));
if (!prop) process.exit(1);
const der = await reqA.post(`${BASE}/api/proposals/${prop.id}/derive`, {
  data: { assigneeUserId: bUser.userId, priority: "alta", note: "probando el aviso" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const derJson = await der.json();
console.log("derivar:", der.status(), "status=", derJson?.proposal?.status);

// sesión de B → sus salas → el DM con A debe tener el mensaje del aviso
const ctxB = await browser.newContext();
const reqB = ctxB.request;
await reqB.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: B.email, password: B.pass },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const rooms = await (await reqB.get(`${BASE}/api/internal/rooms`)).json();
const list = rooms.rooms ?? [];
const room = list.find((r) => JSON.stringify(r).includes(`Aviso A ${stamp}`));
console.log("sala DM de B:", room?.id ? `ok (${room.id})` : `NO (${list.length} salas: ${JSON.stringify(list).slice(0, 300)})`);
if (room?.id) {
  const msgs = await (await reqB.get(`${BASE}/api/internal/rooms/${room.id}/messages`)).json();
  const arr = msgs.messages ?? [];
  const hit = arr.find((m) => String(m.body ?? "").includes("Propuesta de venta cruzada para TEST IA") && String(m.body ?? "").includes("Prioridad: ALTA"));
  console.log(hit
    ? "AVISO_OK: " + String(hit.body).slice(0, 200).replace(/\n/g, " / ")
    : `AVISO NO ENCONTRADO (${arr.length} mensajes: ${JSON.stringify(arr.slice(-2)).slice(0, 300)})`);
}
await browser.close();
