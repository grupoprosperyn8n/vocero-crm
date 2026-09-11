#!/usr/bin/env node
/**
 * E2E — Canal de Telegram (Bloque C): conexión del bot + circuito completo.
 *
 * Corre contra el dev 3001 (escribe en su DB: solo localhost).
 * Cubre:
 *  - settings/telegram owner-only: member/admin 403; owner GET/PUT.
 *  - PUT con token inválido → 422 (llamada REAL a la Bot API: la traducción
 *    de errores se prueba contra Telegram, no contra un mock).
 *  - webhook: secreto desconocido 404, formato inválido 404, header firmado
 *    ausente/incorrecto 401, update válido ingesta (contacto + conversación).
 *  - dedup por message_id: el mismo update dos veces = un solo mensaje.
 *  - foto (media entrante): el mensaje queda type=image con su asset.
 *  - salida: con token inválido la Bot API responde 401 → 409
 *    reconnect_required y la credencial queda marcada para reconectar.
 *  - limpieza: credencial e2e borrada, contacto archivado, usuarios de baja.
 */

import { createCipheriv, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(BASE)) {
  throw new Error(
    "Este e2e escribe en la DB del dev (credencial de prueba): correrlo solo contra localhost"
  );
}

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
function envOf(key) {
  const line = env.split("\n").find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`Falta ${key} en .env.local`);
  return line.slice(key.length + 1).trim();
}
const ADMIN_KEY = envOf("ADMIN_API_KEY");
const ORIGIN = envOf("APP_BASE_URL");
const DB_URL = envOf("DATABASE_URL");
const ENC_KEY = envOf("ENCRYPTION_KEY");

const stamp = Date.now().toString(36);
const PASS = `E2eTg-${stamp}-2026`;
const EMAILS = {
  owner: `e2e.tg.owner.${stamp}@test.local`,
  admin: `e2e.tg.admin.${stamp}@test.local`,
  member: `e2e.tg.member.${stamp}@test.local`,
};
const CHAT_ID = 555000000 + (parseInt(stamp, 36) % 1000000);
const TG_NAME = `E2E Tg ${stamp}`;

let pass = 0;
let fail = 0;
function check(name, cond, extra = "") {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}${extra ? ` — ${extra}` : ""}`);
  }
}
function section(title) {
  console.log(`\n== ${title}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(path, { method = "GET", body, cookie, adminKey, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...(adminKey ? { "x-admin-key": ADMIN_KEY } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, setCookie: res.headers.getSetCookie?.() ?? [] };
}

async function withDb(fn) {
  // Mismo driver que el CRM (postgres.js): evita sumar una dependencia.
  const { default: postgres } = await import("postgres");
  const sql = postgres(DB_URL, { max: 1, onnotice: () => {} });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

function encryptEnv(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(ENC_KEY, "base64"), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return {
    cipher: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function tgMessage(extra) {
  const person = { first_name: "E2E", last_name: `Tg ${stamp}`, language_code: "es" };
  return {
    date: Math.floor(Date.now() / 1000),
    chat: { id: CHAT_ID, type: "private", ...person },
    from: { id: CHAT_ID, is_bot: false, ...person },
    ...extra,
  };
}

async function tgPost(secret, update, { header = true } = {}) {
  return req(`/api/webhooks/telegram/${secret}`, {
    method: "POST",
    body: update,
    headers: header ? { "x-telegram-bot-api-secret-token": secret } : {},
  });
}

async function main() {
  console.log(`E2E Telegram (Bloque C) — ${BASE}`);

  const health = await req("/api/health");
  if (health.status !== 200) throw new Error(`Dev no responde en ${BASE}: ${health.status}`);

  section("Sesiones de prueba");
  await req("/api/admin/users", {
    method: "PUT",
    adminKey: true,
    body: { email: EMAILS.owner, name: "E2E Tg Owner", password: PASS, role: "owner", active: true },
  });
  await req("/api/admin/users", {
    method: "PUT",
    adminKey: true,
    body: { email: EMAILS.admin, name: "E2E Tg Admin", password: PASS, role: "admin", active: true },
  });
  await req("/api/admin/users", {
    method: "PUT",
    adminKey: true,
    body: { email: EMAILS.member, name: "E2E Tg Member", password: PASS, role: "member", active: true },
  });
  const cookies = {};
  for (const [role, email] of Object.entries(EMAILS)) {
    const res = await req("/api/auth/sign-in/email", { method: "POST", body: { email, password: PASS } });
    if (res.status !== 200) throw new Error(`Login ${role} → ${res.status}: ${JSON.stringify(res.data)}`);
    const cookie = res.setCookie.find((c) => /session/i.test(c));
    if (!cookie) throw new Error(`Login ${role} sin cookie de sesión`);
    cookies[role] = cookie.split(";")[0];
  }
  check("3 usuarios de prueba (owner/admin/member) con sesión", true);

  section("settings/telegram — reparto owner-only");
  await withDb((sql) => sql`delete from telegram_credentials`);
  const gMember = await req("/api/settings/telegram", { cookie: cookies.member });
  check("member GET → 403", gMember.status === 403, `status ${gMember.status}`);
  const gAdmin = await req("/api/settings/telegram", { cookie: cookies.admin });
  check("admin GET → 403", gAdmin.status === 403, `status ${gAdmin.status}`);
  const gOwner = await req("/api/settings/telegram", { cookie: cookies.owner });
  check(
    "owner GET → 200 sin conexión",
    gOwner.status === 200 && gOwner.data?.connection === null,
    `status ${gOwner.status} ${JSON.stringify(gOwner.data)}`
  );

  section("PUT — validación contra la Bot API real");
  const putMember = await req("/api/settings/telegram", {
    method: "PUT",
    cookie: cookies.member,
    body: { token: "999999:AAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  });
  check("member PUT → 403", putMember.status === 403, `status ${putMember.status}`);
  const putAdmin = await req("/api/settings/telegram", {
    method: "PUT",
    cookie: cookies.admin,
    body: { token: "999999:AAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  });
  check("admin PUT → 403", putAdmin.status === 403, `status ${putAdmin.status}`);
  const putShort = await req("/api/settings/telegram", {
    method: "PUT",
    cookie: cookies.owner,
    body: { token: "corto" },
  });
  check("token con formato irreal → 422", putShort.status === 422, `status ${putShort.status}`);
  const putBad = await req("/api/settings/telegram", {
    method: "PUT",
    cookie: cookies.owner,
    body: { token: "999999:AAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  });
  check(
    "token inexistente rechazado por Telegram → 422",
    putBad.status === 422,
    `status ${putBad.status} ${JSON.stringify(putBad.data)}`
  );

  section("Webhook — firma y enrutado");
  const SECRET = randomBytes(24).toString("hex");
  const unknown = await tgPost(randomBytes(24).toString("hex"), { update_id: 1, message: tgMessage({ message_id: 1, text: "x" }) });
  check("secreto desconocido → 404", unknown.status === 404, `status ${unknown.status}`);
  const badFormat = await req("/api/webhooks/telegram/zzz", { method: "POST", body: {} });
  check("segmento con formato inválido → 404", badFormat.status === 404, `status ${badFormat.status}`);

  const orgId = await withDb(async (sql) => {
    const r = await sql`select m.organization_id as org from member m join "user" u on u.id = m.user_id where u.email = ${EMAILS.owner} limit 1`;
    return r[0]?.org ?? null;
  });
  check("org de la instancia resuelta", !!orgId);
  const encTok = encryptEnv("999999:FAKE-E2E-TOKEN");
  await withDb((sql) =>
    sql`insert into telegram_credentials
          (id, organization_id, bot_id, bot_username, token_cipher, token_iv, token_tag, webhook_secret, status)
        values (${`cred_e2e_tg_${stamp}`}, ${orgId}, ${"999999"}, ${"e2e_tg_bot"}, ${encTok.cipher}, ${encTok.iv}, ${encTok.tag}, ${SECRET}, 'connected')
        on conflict (organization_id) do update set
          bot_id = excluded.bot_id, bot_username = excluded.bot_username,
          token_cipher = excluded.token_cipher, token_iv = excluded.token_iv,
          token_tag = excluded.token_tag, webhook_secret = excluded.webhook_secret,
          status = 'connected', updated_at = now()`
  );

  const gConn = await req("/api/settings/telegram", { cookie: cookies.owner });
  check("GET owner muestra la conexión", gConn.data?.connection?.botUsername === "e2e_tg_bot", JSON.stringify(gConn.data));
  check(
    "webhookUrl lleva el secreto en el path",
    typeof gConn.data?.connection?.webhookUrl === "string" &&
      gConn.data.connection.webhookUrl.includes(`/api/webhooks/telegram/${SECRET}`),
    JSON.stringify(gConn.data?.connection?.webhookUrl)
  );

  const noHeader = await tgPost(SECRET, { update_id: 2, message: tgMessage({ message_id: 2, text: "no" }) }, { header: false });
  check("sin header firmado → 401", noHeader.status === 401, `status ${noHeader.status}`);
  const wrongHeader = await req(`/api/webhooks/telegram/${SECRET}`, {
    method: "POST",
    body: { update_id: 2, message: tgMessage({ message_id: 2, text: "no" }) },
    headers: { "x-telegram-bot-api-secret-token": "0".repeat(48) },
  });
  check("header incorrecto → 401", wrongHeader.status === 401, `status ${wrongHeader.status}`);

  section("Ingesta — mensajes entrantes");
  const T1 = `Hola E2E Telegram ${stamp}`;
  const post1 = await tgPost(SECRET, { update_id: 100, message: tgMessage({ message_id: 100, text: T1 }) });
  check("update aceptado (200 ok:true)", post1.status === 200 && post1.data?.ok === true, `status ${post1.status} ${JSON.stringify(post1.data)}`);

  let conv = null;
  for (let i = 0; i < 20 && !conv; i += 1) {
    await sleep(500);
    const list = await req("/api/conversations", { cookie: cookies.owner });
    conv = (list.data?.conversations ?? []).find((c) => c.contact?.name === TG_NAME) ?? null;
  }
  check("conversación de Telegram en la bandeja", !!conv, JSON.stringify(conv).slice(0, 220));
  check("canal de la conversación = telegram", conv?.channel === "telegram", JSON.stringify(conv).slice(0, 220));

  const READ = () => req(`/api/conversations/${conv.id}/messages`, { cookie: cookies.owner });
  const msgs1 = await READ();
  const in1 = (msgs1.data?.messages ?? []).filter((m) => m.text === T1);
  check("mensaje entrante en el hilo", in1.length === 1 && in1[0].direction === "in", JSON.stringify(msgs1.data).slice(0, 220));

  await tgPost(SECRET, { update_id: 100, message: tgMessage({ message_id: 100, text: T1 }) });
  await sleep(800);
  const msgs2 = await READ();
  check(
    "dedup: el mismo update dos veces = un solo mensaje",
    (msgs2.data?.messages ?? []).filter((m) => m.text === T1).length === 1
  );

  const T2 = `Segundo E2E Telegram ${stamp}`;
  await tgPost(SECRET, { update_id: 101, message: tgMessage({ message_id: 101, text: T2 }) });
  const CAP = `Foto E2E ${stamp}`;
  await tgPost(SECRET, {
    update_id: 102,
    message: tgMessage({
      message_id: 102,
      caption: CAP,
      photo: [
        { file_id: "AgACAgEAAxkBAAEe2e-1-fake", file_size: 1234, width: 90, height: 60 },
        { file_id: "AgACAgEAAxkBAAEe2e-2-fake", file_size: 5555, width: 800, height: 600 },
      ],
    }),
  });
  await sleep(900);
  const msgs3 = (await READ()).data?.messages ?? [];
  check("segundo texto ingerido", msgs3.filter((m) => m.text === T2).length === 1);
  const foto = msgs3.find((m) => m.type === "image");
  check(
    "foto ingerida como imagen con asset",
    !!foto && foto.media?.kind === "image" && foto.media?.mimeType === "image/jpeg",
    JSON.stringify(foto).slice(0, 220)
  );
  check("el caption queda en el asset", foto?.media?.caption === CAP);

  section("Salida — envío por el bot (token inválido = reconnect_required)");
  const send1 = await req(`/api/conversations/${conv.id}/messages`, {
    method: "POST",
    cookie: cookies.owner,
    body: { text: "Respuesta E2E" },
  });
  check(
    "envío → 409 reconnect_required",
    send1.status === 409 && JSON.stringify(send1.data).includes("reconnect_required"),
    `status ${send1.status} ${JSON.stringify(send1.data)}`
  );
  const gAfter = await req("/api/settings/telegram", { cookie: cookies.owner });
  check(
    "la credencial queda marcada para reconectar",
    gAfter.data?.connection?.status === "reconnect_required",
    JSON.stringify(gAfter.data)
  );

  section("Limpieza");
  await withDb((sql) => sql`delete from telegram_credentials where webhook_secret = ${SECRET}`);
  const gClean = await req("/api/settings/telegram", { cookie: cookies.owner });
  check("credencial e2e borrada (GET → sin conexión)", gClean.data?.connection === null);

  const contactId = await withDb(async (sql) => {
    const r = await sql`select id from contact where wa_identity = ${`tg:${CHAT_ID}`} limit 1`;
    return r[0]?.id ?? null;
  });
  if (contactId) {
    const arch = await req(`/api/contacts/${contactId}`, {
      method: "PATCH",
      cookie: cookies.owner,
      body: { archived: true },
    });
    check("contacto de prueba archivado", [200, 204].includes(arch.status), `status ${arch.status}`);
  } else {
    check("contacto de prueba archivado", false, "no se encontró el contacto");
  }

  for (const [role, email] of Object.entries(EMAILS)) {
    const del = await req(`/api/admin/users?email=${encodeURIComponent(email)}`, { method: "DELETE", adminKey: true });
    // 409 = era el único propietario de una instancia sin dueño previo (dev):
    // se informa sin romper la limpieza.
    check(`baja usuario ${role}`, del.status === 200 || del.status === 409, `status ${del.status}`);
  }

  console.log(`\nRESULTADO: ${pass}/${fail}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nE2E Telegram interrumpido: ${err.message}`);
  process.exit(1);
});
