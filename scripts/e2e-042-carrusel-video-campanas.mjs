// e2e 042 — PUBLICIDAD VIVA + CAMPAÑAS 360:
//   · carrusel de fotos + video MP4 en la página pública (/p/<token>)
//   · página con diseño claro/glass en movimiento y botón directo al WhatsApp
//     del equipo (derivada a una persona → la nombra; si no, atiende la IA)
//   · derivar a la IA como destino («IA primero»)
//   · tablero maestro de campañas (/api/proposals/overview) solo owner/admin/manager
//   · «Panel 360» en la cola de hoy y en el tablero maestro
//
// Uso: node scripts/e2e-042-carrusel-video-campanas.mjs     (dev 3001)
// Seguridad: escribe SOLO sobre el perfil TEST IA.
import fs from "node:fs";
import crypto from "node:crypto";
import { chromium, request as pwRequest } from "playwright";
import sharp from "sharp";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const TEST_CLIENT = "rechYRnw7FzaGjfpA"; // TEST IA
const envLocal = fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8") : "";
const envOf = (k) => {
  const m = envLocal.match(new RegExp(`^${k}=(.*)$`, "m"));
  return m ? m[1].trim() : undefined;
};
const ADMIN_KEY = envOf("ADMIN_API_KEY");
const BOT_KEY = envOf("BOT_API_KEY");
const ORIGIN = envOf("APP_BASE_URL") ?? BASE;

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  if (ok) pass++;
  else fail++;
}

const stamp = Date.now().toString(36);
const EMAIL_OWNER = `e2e-042-${stamp}@test.local`;
const EMAIL_MEMBER = `e2e-042-m-${stamp}@test.local`;
const PASS = "E2E-042-2026!";

const mk = async (email, name, role) => {
  const res = await fetch(`${BASE}/api/admin/users`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY ?? "" },
    body: JSON.stringify({ email, name, password: PASS, role }),
  });
  return res.status;
};
const sOwner = await mk(EMAIL_OWNER, `E2E 042 ${stamp}`, "owner");
const sMember = await mk(EMAIL_MEMBER, `E2E 042 Colab ${stamp}`, "member");
check("1. usuarios temporales (owner + colaborador)", sOwner === 201 && sMember === 201, `${sOwner}/${sMember}`);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = m.location()?.url ?? "";
  if (/\/api\/avatars\//.test(url)) return;
  consoleErrors.push(`${m.text().slice(0, 140)} @ ${url}`.slice(0, 200));
});
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`.slice(0, 200)));

// El sign-in de better-auth tiene rate limit: si pega 429, espera y reintenta.
const loginRetry = async (reqCtx, email) => {
  for (let i = 0; i < 4; i++) {
    const res = await reqCtx.post(`${BASE}/api/auth/sign-in/email`, {
      data: { email, password: PASS },
      headers: { origin: ORIGIN, "content-type": "application/json" },
    });
    if (res.status() !== 429) return res;
    console.log(`  (login 429 — espero 70 s, intento ${i + 2})`);
    await new Promise((r2) => setTimeout(r2, 70_000));
  }
  return reqCtx.post(`${BASE}/api/auth/sign-in/email`, {
    data: { email, password: PASS },
    headers: { origin: ORIGIN, "content-type": "application/json" },
  });
};

const login = await loginRetry(ctx.request, EMAIL_OWNER);
check("2. login owner", login.status() === 200, String(login.status()));

/* ---------- medios: 2 fotos + 1 video MP4 ---------- */

const img1 = await sharp({
  create: { width: 900, height: 600, channels: 3, background: { r: 210, g: 80, b: 60 } },
})
  .png()
  .toBuffer();
const img2 = await sharp({
  create: { width: 900, height: 600, channels: 3, background: { r: 40, g: 120, b: 200 } },
})
  .png()
  .toBuffer();
const video = fs.readFileSync("/tmp/probe-video.mp4");

const subir = async (mime, filename, buf, purpose = "media") => {
  const res = await ctx.request.post(`${BASE}/api/proposals/assets`, {
    data: { mime, filename, data: buf.toString("base64"), purpose },
    headers: { origin: ORIGIN, "content-type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status(), id: data?.id, mime: data?.mime, message: data?.message };
};

const a1 = await subir("image/png", "foto-1.png", img1);
check("3. sube foto 1 (medios)", (a1.status === 200 || a1.status === 201) && Boolean(a1.id), `${a1.status} ${a1.mime}`);
const a2 = await subir("image/png", "foto-2.png", img2);
check("4. sube foto 2 (medios)", (a2.status === 200 || a2.status === 201) && Boolean(a2.id), `${a2.status} ${a2.mime}`);
const av = await subir("video/mp4", "promo.mp4", video, "media");
check("5. sube VIDEO MP4 a los medios", (av.status === 200 || av.status === 201) && av.mime === "video/mp4", `${av.status} ${av.mime} ${av.message ?? ""}`);

const avLogo = await subir("video/mp4", "promo.mp4", video, "logo");
check("6. video como LOGO se rechaza (415)", avLogo.status === 415, `${avLogo.status} ${avLogo.message ?? ""}`);

/* ---------- propuesta con carrusel + video ---------- */

const propRes = await ctx.request.post(`${BASE}/api/proposals`, {
  data: {
    kind: "renovacion",
    clientRef: TEST_CLIENT,
    clientName: "TEST IA",
    clientDni: "26322995",
    clientPhone: "3417035515",
    title: `E2E 042 carrusel ${stamp}`,
    benefit: "20% OFF + cuota fija",
    ctaLabel: "Quiero mi beneficio",
    ctaUrl: "https://vocero.sistemasagenticos.cloud",
    mediaIds: [a1.id, av.id, a2.id, "pass_zzzz"],
  },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const propData = await propRes.json().catch(() => ({}));
const prop = propData?.proposal;
check(
  "7. propuesta creada con medios (id basura filtrado)",
  propRes.status() === 201 &&
    Array.isArray(prop?.mediaIds) &&
    prop.mediaIds.length === 3 &&
    prop.mediaIds[0] === a1.id &&
    prop.mediaIds[1] === av.id,
  `${propRes.status()} ${JSON.stringify(prop?.mediaIds ?? propData).slice(0, 120)}`
);
check(
  "8. imagen principal = primera FOTO (adjunto del chat)",
  String(prop?.imageUrl ?? "").includes(a1.id),
  prop?.imageUrl ?? "null"
);

/* ---------- página pública: carrusel + video + WhatsApp ---------- */

const anon = await pwRequest.newContext();
const pub1 = await anon.get(`${BASE}${prop?.publicUrl ?? "/p/inexistente"}`);
const html1 = await pub1.text();
check("9. página pública responde", pub1.status() === 200, String(pub1.status()));
check("10. carrusel en el HTML (data-carousel + 3 medios)", /data-carousel/.test(html1) && (html1.match(/\/api\/public\/propuesta\/img\//g) ?? []).length >= 3, "");
check("11. hay <video> (MP4) además de fotos", /<video/.test(html1), "");
check("12. diseño vivo: blur + animación", /backdrop-blur/.test(html1) && /rp-fade-up/.test(html1), "");
check("13. nombre COMPLETO del cliente en el diseño", /Para/.test(html1) && /TEST IA/.test(html1), "");
check("14. botón al WhatsApp del equipo (wa.me)", /wa\.me\/525500000000/.test(html1), "");
check("15. sin derivar: atiende la IA (asistente virtual)", /asistente virtual/.test(html1), "");

const vRes = await anon.get(`${BASE}/api/public/propuesta/img/${av.id}`);
const vBuf = await vRes.body();
check(
  "16. el video se sirve como video/mp4",
  vRes.status() === 200 && String(vRes.headers()["content-type"] ?? "").includes("video/mp4") && vBuf.byteLength > 1000,
  `${vRes.status()} ${vRes.headers()["content-type"]} ${vBuf.byteLength} B`
);

/* ---------- derivar a la IA ---------- */

const derRes = await ctx.request.post(`${BASE}/api/proposals/${prop.id}/derive`, {
  data: { assigneeKind: "ia", priority: "alta", note: null },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const derData = await derRes.json().catch(() => ({}));
check(
  "17. derivar a la IA (sin empleado ni grupo)",
  derRes.status() === 200 && derData?.proposal?.status === "derivada" && Boolean(derData?.proposal?.derivedAt),
  `${derRes.status()} ${derData?.proposal?.status ?? derData?.message ?? ""}`
);

const derBad = await ctx.request.post(`${BASE}/api/proposals/${prop.id}/derive`, {
  data: { assigneeKind: "ia", assigneeUserId: "no-va" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("18. IA + empleado juntos se rechaza", derBad.status() === 422, String(derBad.status()));

/* ---------- tablero maestro ---------- */

const ovRes = await ctx.request.get(`${BASE}/api/proposals/overview`);
const ov = (await ovRes.json().catch(() => ({})))?.overview;
check(
  "19. overview owner: totales y campaña nueva",
  ovRes.status() === 200 && ov?.totals?.total >= 1 && ov.recent.some((r) => r.id === prop.id && r.mediaCount === 3),
  `${ovRes.status()} total=${ov?.totals?.total}`
);

const ctxMember = await api_login_member();
async function api_login_member() {
  const c = await pwRequest.newContext();
  const res = await loginRetry(c, EMAIL_MEMBER);
  if (res.status() !== 200) throw new Error(`login member: ${res.status()}`);
  return c;
}
const ovMember = await ctxMember.get(`${BASE}/api/proposals/overview`);
check("20. overview para colaborador: 403", ovMember.status() === 403, String(ovMember.status()));

/* ---------- UI: tablero maestro + panel 360 ---------- */

// El dev compila al primer pedido: se espera al NAV, no a un tiempo fijo.
await page.goto(`${BASE}/dashboard-management`, { waitUntil: "domcontentloaded" });
const colaNav = page.getByRole("button", { name: /Cola de hoy/ }).first();
await colaNav.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
const tabBtn = page.getByRole("button", { name: /Campañas 360/ }).first();
await tabBtn.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
const tabVisible = await tabBtn.isVisible().catch(() => false);
check("21. pestaña «Campañas 360» visible para owner", tabVisible, "");

if (tabVisible) {
  await tabBtn.click();
  await page
    .getByText("Macro de campañas 360")
    .first()
    .waitFor({ state: "visible", timeout: 30000 })
    .catch(() => {});
  const macro = await page.getByText("Macro de campañas 360").first().isVisible().catch(() => false);
  const conCliente = await page.getByText("TEST IA").first().isVisible().catch(() => false);
  check("22. el tablero carga (embudo + lista)", macro && conCliente, `macro=${macro} fila=${conCliente}`);
}

// Cola de hoy → Panel 360
if (await colaNav.isVisible().catch(() => false)) {
  await colaNav.click();
  const panelBtns = page.getByRole("button", { name: /Panel 360/ });
  let n = 0;
  for (let i = 0; i < 20; i++) {
    n = await panelBtns.count().catch(() => 0);
    if (n > 0) break;
    await page.waitForTimeout(1000);
  }
  check("23. «Panel 360» disponible en la cola de hoy", n > 0, `${n} botones`);
  if (n > 0) {
    await panelBtns.first().click();
    await page.waitForTimeout(2500);
    const panelOpen = await page
      .getByText(/Cliente 360°|Panel de control|Gestión sugerida|Campañas de este cliente/i)
      .first()
      .isVisible()
      .catch(() => false);
    check("24. el panel del cliente abre desde la cola", panelOpen, "");
  }
} else {
  check("23. «Panel 360» disponible en la cola de hoy", false, "sin tab cola");
  check("24. el panel del cliente abre desde la cola", false, "sin tab cola");
}

// Panel del cliente → flujo de propuesta con medios múltiples
await page.goto(`${BASE}/dashboard-management`, { waitUntil: "domcontentloaded" });
const clientesBtn = page.getByRole("button", { name: /Cliente 360°/ }).first();
await clientesBtn.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
if (await clientesBtn.isVisible().catch(() => false)) {
  await clientesBtn.click();
  await page.waitForTimeout(2000);
  const searchBox = page.getByPlaceholder(/DNI o tel/i).first();
  await searchBox.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  if (await searchBox.isVisible().catch(() => false)) {
    await searchBox.fill("TEST IA");
    await page.waitForTimeout(3000);
    const panelBtn = page.getByRole("button", { name: /Panel de control/ }).first();
    await panelBtn.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    if (await panelBtn.isVisible().catch(() => false)) {
      await panelBtn.click();
      await page.waitForTimeout(3000);
      // El flujo de propuesta vive detrás de «Crear propuesta comercial».
      const abrirFlujo = page.getByRole("button", { name: /Crear propuesta comercial/ }).first();
      if (await abrirFlujo.isVisible().catch(() => false)) {
        await abrirFlujo.click();
        await page.waitForTimeout(1500);
      }
      const mediaLabel = await page.getByText(/Fotos o video \(carrusel\)/).first().isVisible().catch(() => false);
      check("25. flujo de publicidad con carrusel en el panel", mediaLabel, `carrusel=${mediaLabel}`);
    } else {
      check("25. flujo de publicidad con carrusel en el panel", false, "sin botón Panel de control");
    }
  } else {
    check("25. flujo de publicidad con carrusel en el panel", false, "sin buscador");
  }
} else {
  check("25. flujo de publicidad con carrusel en el panel", false, "sin tab Cliente 360°");
}

/* ---------- mobile: la pública no desborda ---------- */
const small = await browser.newContext({ viewport: { width: 390, height: 844 } });
const sp = await small.newPage();
await sp.goto(`${BASE}${prop?.publicUrl ?? "/p/x"}`, { waitUntil: "domcontentloaded" });
await sp.waitForTimeout(1500);
const overflow = await sp.evaluate(
  () => document.scrollingElement.scrollWidth - window.innerWidth
);
check("26. pública en celu 390px sin scroll horizontal", overflow <= 2, `+${overflow}px`);
await small.close();

/* ---------- 042b: el asesor firma la página y el aviso vuelve a su chat ---------- */

// Derivar a una PERSONA: la página la firma con su nombre y el texto la nombra.
const dirRes = await ctx.request.get(`${BASE}/api/staff/directory`);
const viewer = (await dirRes.json().catch(() => ({})))?.viewer ?? {};
const derPer = await ctx.request.post(`${BASE}/api/proposals/${prop.id}/derive`, {
  data: { assigneeUserId: viewer.userId, priority: "alta", note: null },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const perData = await derPer.json().catch(() => ({}));
const asesor = perData?.proposal?.assigneeName ?? "";
check(
  "27. derivada a un empleado (el asesor que la envía)",
  derPer.status() === 200 && asesor.length > 0,
  `${derPer.status()} ${asesor}`
);

const htmlAs = await (await anon.get(`${BASE}${prop.publicUrl}`)).text();
const firmaOk = htmlAs.includes("Te la envió") && Boolean(asesor) && htmlAs.includes(asesor);
const refOk = htmlAs.includes("ref%20") && /wa\.me\/525500000000\?text=/.test(htmlAs);
check(
  "28. la página la firma el asesor y el texto lleva la referencia",
  firmaOk && refOk,
  `firma=${firmaOk} ref=${refOk}`
);

// El cliente manda el texto prellenado (lo entrega el bot por /api/bot/inbound):
// al entrar al CRM, el aviso tiene que caerle al asesor en su chat interno.
const waText = `¡Hola! Vi la propuesta «${prop.title}» que me envió ${asesor}. ¿Me cuentan un poco más? (ref ${prop.token})`;
const inRes = await fetch(`${BASE}/api/bot/inbound`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-key": BOT_KEY ?? "" },
  body: JSON.stringify({
    channel: "whatsapp",
    externalId: "5491100000042",
    profileName: "Cliente Referido E2E",
    text: waText,
    eventId: `e2e-042-ref-${stamp}`,
  }),
});
check("29. el texto referido entra al CRM (conector del bot)", inRes.status === 200, String(inRes.status));

let aviso = false;
const roomsRes = await ctx.request.get(`${BASE}/api/internal/rooms`);
const rooms = (await roomsRes.json().catch(() => ({})))?.rooms ?? [];
for (const r of rooms.slice(0, 12)) {
  const mRes = await ctx.request.get(`${BASE}/api/internal/rooms/${r.id}/messages`);
  const data = await mRes.json().catch(() => ({}));
  const msgs = data?.messages ?? data?.items ?? [];
  if (msgs.some((m) => String(m?.body ?? "").includes("respondió a tu publicidad"))) {
    aviso = true;
    break;
  }
}
check("30. el asesor recibe el aviso en su chat interno", aviso, `${rooms.length} salas`);

/* ---------- limpieza ---------- */

const del = await ctx.request.post(`${BASE}/api/proposals/${prop.id}/lifecycle`, {
  data: { action: "delete" },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
check("31. limpieza: campaña de prueba eliminada", del.status() === 200, String(del.status()));
for (const email of [EMAIL_OWNER, EMAIL_MEMBER]) {
  await fetch(`${BASE}/api/admin/users?email=${encodeURIComponent(email)}`, {
    method: "DELETE",
    headers: { "x-admin-key": ADMIN_KEY ?? "" },
  });
}

const errTrasLimpieza = consoleErrors.filter((e) => !/sign-in|401/.test(e)).slice(0, 3);
check("32. sin errores de consola (fuera de auth)", errTrasLimpieza.length === 0, errTrasLimpieza.join(" | ").slice(0, 220));

await anon.dispose();
await ctxMember.dispose();
await browser.close();

console.log(`\n${pass} PASS · ${fail} FAIL`);
process.exit(fail === 0 ? 0 : 1);
