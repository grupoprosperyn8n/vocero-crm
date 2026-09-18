// 041 — Carga las imágenes demo como assets, configura la plantilla
// «renovación» (foto + logo) y saca evidencia visual: panel de un cliente con
// cartera real (solo lectura) + página pública de la pieza.
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
const EMAIL = `demo-041-${stamp}@test.local`;
const PASS = "Demo-041-2026!";

const alta = await fetch(`${BASE}/api/admin/users`, {
  method: "PUT",
  headers: { "content-type": "application/json", "x-admin-key": ADMIN_KEY },
  body: JSON.stringify({ email: EMAIL, name: "Demo 041", password: PASS, role: "owner" }),
});
console.log("alta owner:", alta.status);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: EMAIL, password: PASS },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});

// 1) Subir imágenes
const upload = async (path, mime) => {
  const data = fs.readFileSync(path).toString("base64");
  const res = await ctx.request.post(`${BASE}/api/proposals/assets`, {
    data: { mime, filename: path.split("/").pop(), data },
    headers: { origin: ORIGIN, "content-type": "application/json" },
  });
  const j = await res.json();
  console.log("asset", path, res.status(), j.id);
  return j.id;
};
const pubId = await upload("/tmp/demo-publicidad.png", "image/png");
const logoId = await upload("/tmp/demo-logo.png", "image/png");

// 2) Plantilla renovación con foto + logo
const put = await ctx.request.put(`${BASE}/api/proposals/templates`, {
  data: { kind: "renovacion", assetId: pubId, logoAssetId: logoId },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
console.log("plantilla renovacion:", put.status(), JSON.stringify((await put.json()).template?.hasImage));

// 3) Propuesta demo para TEST IA y abrir la página pública
const creada = await ctx.request.post(`${BASE}/api/proposals`, {
  data: {
    kind: "renovacion",
    clientRef: "rechYRnw7FzaGjfpA",
    clientName: "TEST IA",
    clientDni: "26322995",
    clientPhone: "3417035515",
    benefit: "15% OFF en tu renovación",
  },
  headers: { origin: ORIGIN, "content-type": "application/json" },
});
const prop = (await creada.json()).proposal;
console.log("propuesta:", prop.publicUrl);
const anon = await browser.newContext();
const pub = await anon.newPage();
await pub.goto(`${BASE}${prop.publicUrl}`, { waitUntil: "networkidle" });
await pub.screenshot({ path: "artifacts/041-pagina-publica.png", fullPage: true });
await anon.close();

// 4) Panel de control con cartera real: buscar TYRNER y abrir el panel
await page.goto(`${BASE}/dashboard-management`, { waitUntil: "domcontentloaded" });
await page.getByText("Pulso del negocio").first().waitFor({ timeout: 300_000 });
const skip = page.getByRole("button", { name: "Después" });
if (await skip.count()) await skip.first().click().catch(() => {});
await page.getByRole("button", { name: /^\s*Cliente 360/ }).first().click();
const searchInput = page.getByPlaceholder("Ej. Juan Pérez, DNI o teléfono");
await searchInput.waitFor({ timeout: 60_000 });
await searchInput.fill("TYRNER NICOLAS");
await page.getByRole("button", { name: "Buscar cliente", exact: true }).first().click();
const panelBtn = page.getByRole("button", { name: "Panel de control" }).first();
await panelBtn.waitFor({ timeout: 240_000 });
await panelBtn.click();
await page.getByText("Métricas del cliente").first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(2500); // que terminen de animarse las gráficas
await page.screenshot({ path: "artifacts/041-panel-cliente.png", fullPage: false });
// scroll interno para capturar gestiones + propuestas
await page.mouse.wheel(0, 900);
await page.waitForTimeout(600);
await page.screenshot({ path: "artifacts/041-panel-cliente-2.png", fullPage: false });
console.log("screenshots ok");
await browser.close();
