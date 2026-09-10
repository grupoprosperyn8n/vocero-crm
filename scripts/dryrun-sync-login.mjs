// Dry-run local del sync LOGIN: Airtable -> PUT al CRM dev (3001).
// La lógica de mapeo es ESPEJO del Code node que irá en el workflow n8n.
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

const logins = await atAll("LOGIN");
const emps = await atAll("EMPLEADOS");

// ==== mapeo (espejo del Code node n8n) ====
const nameByLogin = {};
const fichaByLogin = {};
for (const e of emps) {
  const f = e.fields || {};
  const nm = String(f["NOMBRE Y APELLIDO"] || "").trim();
  if (!nm) continue;
  const link = f["Login"];
  const ids = (Array.isArray(link) ? link : link ? [link] : [])
    .map((x) => (typeof x === "object" ? x && x.id || "" : String(x))).filter(Boolean);
  const ro = f["ROL OPERATIVO"];
  for (const id of ids) {
    nameByLogin[id] = nm;
    fichaByLogin[id] = {
      employeeCode: String(f["ID_UNICO_EMPLEADO"] || "").trim() || null,
      operationalRole: Array.isArray(ro) ? ro.join(", ") : String(ro || "").trim() || null,
      locality: String(f["LOCALIDAD"] || "").trim() || null,
      sourceStatus: String(f["ESTADO DEL EMPLEADO"] || "").trim() || null,
    };
  }
}
const rolMap = { "Dueño": "owner", "Gerente": "admin", "Empleado": "member" };
const items = [], skipped = [];
for (const r of logins) {
  const f = r.fields || {};
  const email = String(f["EMAIL"] || "").trim().toLowerCase();
  const rol = rolMap[String(f["ROL"] || "").trim()];
  const pwd = String(f["CONTRASEÑA"] || "");
  const activo = String(f["ESTADO"] || "").trim() === "Activo";
  if (!email) { skipped.push([r.id, "sin email"]); continue; }
  if (!rol) { skipped.push([email, "rol desconocido: " + f["ROL"]]); continue; }
  if (pwd.length < 6) { skipped.push([email, "password corta (" + pwd.length + ")"]); continue; }
  const name = nameByLogin[r.id] || email.split("@")[0];
  const ficha = fichaByLogin[r.id] || {};
  items.push({ email, name, password: pwd, role: rol, active: activo, ...ficha, _src: nameByLogin[r.id] ? "EMPLEADOS" : "email" });
}

// Cuenta dueño de Diego: su fila de LOGIN está linkeada al registro
// EMPLEADO TEST en Airtable y el sync la renombraría — no tocarla (decisión
// a revisar con él). Espejo del Code node de n8n.
const PROTEGIDOS = ["streethead01@gmail.com"];
for (let i = items.length - 1; i >= 0; i--) {
  if (PROTEGIDOS.includes(items[i].email)) { skipped.push([items[i].email, "protegido: no se toca"]); items.splice(i, 1); }
}

console.log(`LOGIN: ${logins.length} filas | a sincronizar: ${items.length} | skips: ${skipped.length}`);
for (const s of skipped) console.log("  skip:", s[0], "-", s[1]);
console.log("\n-- items a subir --");
for (const it of items) console.log(`${it.email} | ${it.name} | ${it.role} | active=${it.active} | pwd=${it.password.length} | nom=${it._src} | ${it.employeeCode || "-"} · ${it.operationalRole || "-"}`);

console.log("\n-- PUT dev CRM (3001) --");
let ok = 0, fail = 0;
for (const it of items) {
  const { _src, ...body } = it;
  // El schema del CRM no acepta null: los campos sin dato se omiten.
  for (const k of Object.keys(body)) if (body[k] === null || body[k] === undefined) delete body[k];
  const r = await fetch(`${CRM}/api/admin/users`, { method: "PUT", headers: { "content-type": "application/json", "x-admin-key": DEV_KEY }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 200 || r.status === 201) { ok++; console.log(`  ${r.status} ${it.email} created=${j.created} changes=${JSON.stringify(j.changes)}`); }
  else { fail++; console.log(`  FAIL ${r.status} ${it.email} ${JSON.stringify(j).slice(0, 200)}`); }
}
console.log(`\nResultado: ok=${ok} fail=${fail}`);
const who = await fetch(`${CRM}/api/admin/users`, { headers: { "x-admin-key": DEV_KEY } });
const wj = await who.json();
console.log("miembros en dev ahora:", (wj.members || []).length);
