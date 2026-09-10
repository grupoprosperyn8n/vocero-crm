// Test del espejo de OFICINAS: Airtable -> PUT /api/admin/offices (dev 3001).
import fs from "node:fs";

const envFile = (p) => Object.fromEntries(
  fs.readFileSync(p, "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const hermes = envFile("/home/diegol/.hermes/.env");
const repo = envFile("/home/diegol/Documentos/vocero-crm/.env.local");
const AT = hermes.AIRTABLE_API_KEY || hermes.AIRTABLE_API_TOKEN;
const DEV_KEY = repo.ADMIN_API_KEY;
const BASE = "appuhslj3GFf60Tea";
const CRM = "http://localhost:3001";

async function atAll(table) {
  const out = [];
  let offset = "";
  do {
    const r = await fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(table)}?pageSize=100${offset ? `&offset=${offset}` : ""}`, { headers: { Authorization: `Bearer ${AT}` } });
    const d = await r.json();
    if (!d.records) throw new Error(JSON.stringify(d).slice(0, 200));
    out.push(...d.records);
    offset = d.offset || "";
  } while (offset);
  return out;
}

const ofs = await atAll("OFICINAS");
const offices = ofs.map((r) => {
  const f = r.fields;
  return {
    externalId: r.id,
    name: String(f["OFICINAS"] || "").trim(),
    cleanName: String(f["NOMBRE_OFICINA_LIMPIO_WEB"] || "").trim() || null,
    locality: String(f["LOCALIDAD DE OFICINAS"] || "").trim() || null,
    sortOrder: typeof f["ORDEN"] === "number" ? f["ORDEN"] : null,
  };
}).filter((o) => o.name);

const strip = (o) => {
  const c = { ...o };
  for (const k of Object.keys(c)) if (c[k] === null || c[k] === undefined) delete c[k];
  return c;
};

async function put(list) {
  const r = await fetch(`${CRM}/api/admin/offices`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-admin-key": DEV_KEY },
    body: JSON.stringify({ offices: list.map(strip) }),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

console.log("OFICINAS en Airtable:", offices.length);

let out = await put(offices);
console.log("PUT#1:", out.status, JSON.stringify(out.json));

let pub = await (await fetch(`${CRM}/api/offices`)).json();
console.log("GET público tras #1:", pub.offices.length, "| ej:", pub.offices.slice(0, 3).map((o) => o.name).join(" · "));

out = await put(offices);
console.log("PUT#2 (idempotencia, esperado upserted=0):", out.status, JSON.stringify(out.json));

const sinUna = offices.slice(1);
out = await put(sinUna);
console.log(`PUT#3 (sin "${offices[0].name}", esperado deactivated=1):`, out.status, JSON.stringify(out.json));
pub = await (await fetch(`${CRM}/api/offices`)).json();
console.log("¿sigue en la lista pública?:", pub.offices.some((o) => o.name === offices[0].name), "| total:", pub.offices.length);

out = await put(offices);
pub = await (await fetch(`${CRM}/api/offices`)).json();
console.log("PUT#4 (restaurado):", out.status, JSON.stringify(out.json), "| total público:", pub.offices.length);

const adm = await (await fetch(`${CRM}/api/admin/offices`, { headers: { "x-admin-key": DEV_KEY } })).json();
console.log("GET admin:", adm.offices.length, "| inactivas:", adm.offices.filter((o) => !o.active).length);
