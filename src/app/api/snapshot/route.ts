import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { withSnapshotKey } from "@/server/snapshot/auth";

export const dynamic = "force-dynamic";

/**
 * 040 — Snapshot del CRM EN VIVO (solo lectura).
 *
 * Devuelve el mismo JSON que generaba scripts/sync-crm.mjs (contactos,
 * conversaciones, mensajes, días, leads y etapas) MÁS las acciones del
 * tablero con su respuesta (embudo sugerencia → acción → respuesta).
 *
 * Lo consume el cockpit (rafael-intelligence) cada pocos minutos, con
 * fallback al archivo local si esta superficie no responde. Nada se
 * escribe en Airtable desde acá: es una foto de lectura de Postgres.
 */

const SNAPSHOT_SQL = `
SELECT json_build_object(
  'generatedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'),
  'contacts', (SELECT COALESCE(json_agg(json_build_object(
      'id', id, 'name', name, 'phone', phone, 'channel', channel, 'source', source,
      'isTest', COALESCE(is_test, false), 'externalRef', external_ref,
      'createdAt', to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS'))), '[]'::json)
    FROM contact WHERE archived_at IS NULL),
  'conversations', (SELECT COALESCE(json_agg(json_build_object(
      'id', id, 'contactId', contact_id, 'channel', channel,
      'isTest', COALESCE(is_test, false), 'topic', topic, 'assigneeId', assignee_id,
      'createdAt', to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'lastMessageAt', to_char(last_message_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'lastInboundAt', to_char(last_inbound_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'closedAt', to_char(closed_at, 'YYYY-MM-DD"T"HH24:MI:SS'))), '[]'::json)
    FROM conversation),
  'messageStats', (SELECT COALESCE(json_agg(x), '[]'::json) FROM (
      SELECT m.conversation_id AS "conversationId", count(*) AS total,
        sum((m.direction = 'in')::int) AS inbound,
        sum((m.direction = 'out')::int) AS outbound,
        sum((m.ai_generated)::int) AS ai
      FROM message m GROUP BY m.conversation_id) x),
  'dailyMessages', (SELECT COALESCE(json_agg(y), '[]'::json) FROM (
      SELECT to_char(m.created_at::date, 'YYYY-MM-DD') AS day,
        COALESCE(c.is_test, false) AS "isTest",
        count(*) AS total,
        sum((m.direction = 'in')::int) AS inbound,
        sum((m.direction = 'out')::int) AS outbound,
        sum((m.ai_generated)::int) AS ai
      FROM message m JOIN conversation c ON c.id = m.conversation_id
      GROUP BY 1, 2 ORDER BY 1) y),
  'dailyConversations', (SELECT COALESCE(json_agg(z), '[]'::json) FROM (
      SELECT to_char(created_at::date, 'YYYY-MM-DD') AS day,
        COALESCE(is_test, false) AS "isTest", count(*) AS total
      FROM conversation GROUP BY 1, 2 ORDER BY 1) z),
  'leads', (SELECT COALESCE(json_agg(json_build_object(
      'id', l.id, 'contactId', l.contact_id, 'stage', ps.name, 'stageKind', ps.kind,
      'amountCents', COALESCE(l.amount_cents, 0), 'priority', l.priority,
      'createdAt', to_char(l.created_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'lastActivityAt', to_char(l.last_activity_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
      'contactName', ct.name, 'isTest', COALESCE(ct.is_test, false))), '[]'::json)
    FROM lead l
    JOIN pipeline_stage ps ON ps.id = l.stage_id
    JOIN contact ct ON ct.id = l.contact_id),
  'stages', (SELECT COALESCE(json_agg(json_build_object(
      'name', name, 'kind', kind, 'position', position) ORDER BY position), '[]'::json)
    FROM pipeline_stage),
  'usersCount', (SELECT count(*) FROM "user"),
  'actions', (SELECT COALESCE(json_agg(a), '[]'::json) FROM (
      SELECT da.id, da.source, da.play_id AS "playId", da.module,
        da.contact_id AS "contactId", da.conversation_id AS "conversationId",
        da.client_ref AS "clientRef", da.client_name AS "clientName",
        to_char(da.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS "createdAt",
        (SELECT to_char(min(m.created_at), 'YYYY-MM-DD"T"HH24:MI:SS')
          FROM message m
          WHERE m.conversation_id = da.conversation_id
            AND m.direction = 'in'
            AND m.created_at > da.created_at) AS "respondedAt"
      FROM dashboard_action da
      ORDER BY da.created_at DESC
      LIMIT 500) a)
) AS snapshot;
`;

export const GET = withSnapshotKey(async () => {
  const db = getDb();
  const rows = (await db.execute(sql.raw(SNAPSHOT_SQL))) as unknown as {
    snapshot: Record<string, unknown> | null;
  }[];

  const snapshot = rows[0]?.snapshot ?? null;

  if (!snapshot || !Array.isArray(snapshot.contacts)) {
    return Response.json(
      { ok: false, error: "Snapshot vacío" },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }

  return Response.json(
    {
      ...snapshot,
      source: { host: "vocero-crm-live", db: "postgres" },
    },
    { headers: { "cache-control": "no-store" } }
  );
});
