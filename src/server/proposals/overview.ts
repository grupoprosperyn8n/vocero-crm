/*
 * 042 — Tablero MAESTRO de campañas 360 (para propietario, dueño y gerente).
 *
 * Mira TODAS las publicidades comerciales de la organización: el embudo
 * completo (creada → derivada → enviada → vista → respondió), cómo va cada
 * empleado, cada tipo de campaña y la última actividad. Cada fila puede abrir
 * la página pública o el panel de control del cliente (Cliente 360°).
 *
 * Es solo lectura sobre el CRM: no toca Airtable.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { kindLabel } from "@/server/proposals/service";

export type CampaignOverviewRow = {
  id: string;
  publicUrl: string;
  clientRef: string;
  clientName: string;
  kind: string;
  kindLabel: string;
  status: string;
  priority: string;
  tone: string | null;
  views: number;
  responded: boolean;
  archived: boolean;
  online: boolean;
  assigneeName: string | null;
  derivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  mediaCount: number;
};

export type CampaignOverview = {
  totals: {
    total: number;
    borradores: number;
    derivadas: number;
    enviadas: number;
    vistas: number;
    respondidas: number;
    archivadas: number;
    fueraDeLinea: number;
    vistasTotal: number;
    conMedios: number;
    sinDerivar: number;
  };
  byKind: { kind: string; label: string; total: number; enviadas: number; respondidas: number }[];
  byAssignee: { name: string; total: number; enviadas: number; respondidas: number }[];
  byDay: { day: string; creadas: number; enviadas: number }[];
  recent: CampaignOverviewRow[];
};

const DAYS = 14;

/** Fecha local (es-AR) en formato YYYY-MM-DD para los cubos diarios. */
function dayKey(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

export async function getCampaignOverview(
  organizationId: string
): Promise<CampaignOverview> {
  const db = getDb();

  const rows = await db
    .select({
      id: schema.proposal.id,
      token: schema.proposal.token,
      kind: schema.proposal.kind,
      status: schema.proposal.status,
      priority: schema.proposal.priority,
      tone: schema.proposal.tone,
      clientRef: schema.proposal.clientRef,
      clientName: schema.proposal.clientName,
      views: schema.proposal.views,
      online: schema.proposal.online,
      mediaIds: schema.proposal.mediaIds,
      assetId: schema.proposal.assetId,
      archivedAt: schema.proposal.archivedAt,
      derivedAt: schema.proposal.derivedAt,
      sentAt: schema.proposal.sentAt,
      createdAt: schema.proposal.createdAt,
      conversationId: schema.proposal.conversationId,
      assigneeName: schema.user.name,
    })
    .from(schema.proposal)
    .leftJoin(schema.user, eq(schema.user.id, schema.proposal.assigneeUserId))
    .where(
      and(
        eq(schema.proposal.organizationId, organizationId),
        isNull(schema.proposal.deletedAt)
      )
    )
    .orderBy(desc(schema.proposal.createdAt))
    .limit(1000);

  // Respondió: último mensaje entrante del cliente DESPUÉS del envío.
  const conversationIds = rows
    .map((r) => r.conversationId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const inbound = new Map<string, Date>();
  if (conversationIds.length) {
    const convRows = await db
      .select({
        id: schema.conversation.id,
        lastInboundAt: schema.conversation.lastInboundAt,
      })
      .from(schema.conversation)
      .where(
        and(
          eq(schema.conversation.organizationId, organizationId),
          inArray(schema.conversation.id, conversationIds)
        )
      );
    for (const c of convRows) {
      if (c.lastInboundAt) inbound.set(c.id, c.lastInboundAt);
    }
  }

  const respondedOf = (r: (typeof rows)[number]): boolean => {
    if (!r.conversationId || !r.sentAt) return false;
    const li = inbound.get(r.conversationId);
    return Boolean(li && li.getTime() > r.sentAt.getTime());
  };

  const totals = {
    total: rows.length,
    borradores: 0,
    derivadas: 0,
    enviadas: 0,
    vistas: 0,
    respondidas: 0,
    archivadas: 0,
    fueraDeLinea: 0,
    vistasTotal: 0,
    conMedios: 0,
    sinDerivar: 0,
  };

  const kindMap = new Map<string, { total: number; enviadas: number; respondidas: number }>();
  const assigneeMap = new Map<string, { total: number; enviadas: number; respondidas: number }>();
  const byDayMap = new Map<string, { creadas: number; enviadas: number }>();

  // Cubos de los últimos DAYS días (arrancan en cero: el gráfico no salta).
  const today = new Date();
  const dayKeys: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86_400_000);
    const key = dayKey(d);
    dayKeys.push(key);
    byDayMap.set(key, { creadas: 0, enviadas: 0 });
  }
  const oldest = dayKeys[0] ?? dayKey(today);

  for (const r of rows) {
    if (r.status === "borrador") totals.borradores++;
    if (r.status === "derivada") totals.derivadas++;
    if (r.status === "enviada") totals.enviadas++;
    if (r.views > 0) totals.vistas++;
    totals.vistasTotal += r.views;
    if (Array.isArray(r.mediaIds) && r.mediaIds.length) totals.conMedios++;
    if (r.archivedAt) totals.archivadas++;
    if (r.sentAt && !r.online) totals.fueraDeLinea++;
    if (!r.derivedAt && r.status === "borrador") totals.sinDerivar++;
    const responded = respondedOf(r);
    if (responded) totals.respondidas++;

    const k = kindMap.get(r.kind) ?? { total: 0, enviadas: 0, respondidas: 0 };
    k.total++;
    if (r.status === "enviada") k.enviadas++;
    if (responded) k.respondidas++;
    kindMap.set(r.kind, k);

    const name = r.assigneeName ?? "Sin derivar (atiende la IA)";
    const a = assigneeMap.get(name) ?? { total: 0, enviadas: 0, respondidas: 0 };
    a.total++;
    if (r.status === "enviada") a.enviadas++;
    if (responded) a.respondidas++;
    assigneeMap.set(name, a);

    const createdKey = dayKey(r.createdAt);
    if (createdKey >= oldest && byDayMap.has(createdKey)) {
      byDayMap.get(createdKey)!.creadas++;
    }
    if (r.sentAt) {
      const sentKey = dayKey(r.sentAt);
      if (sentKey >= oldest && byDayMap.has(sentKey)) {
        byDayMap.get(sentKey)!.enviadas++;
      }
    }
  }

  const iso = (d: Date | null) => (d ? d.toISOString() : null);

  return {
    totals,
    byKind: Array.from(kindMap.entries())
      .map(([kind, v]) => ({ kind, label: kindLabel(kind), ...v }))
      .sort((a, b) => b.total - a.total),
    byAssignee: Array.from(assigneeMap.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10),
    byDay: dayKeys.map((day) => ({ day, ...(byDayMap.get(day) ?? { creadas: 0, enviadas: 0 }) })),
    recent: rows.slice(0, 80).map((r) => ({
      id: r.id,
      publicUrl: `/p/${r.token}`,
      clientRef: r.clientRef,
      clientName: r.clientName,
      kind: r.kind,
      kindLabel: kindLabel(r.kind),
      status: r.status ?? "borrador",
      priority: r.priority ?? "media",
      tone: r.tone,
      views: r.views,
      responded: respondedOf(r),
      archived: Boolean(r.archivedAt),
      online: r.online,
      assigneeName: r.assigneeName,
      derivedAt: iso(r.derivedAt),
      sentAt: iso(r.sentAt),
      createdAt: r.createdAt.toISOString(),
      mediaCount: Array.isArray(r.mediaIds) && r.mediaIds.length ? r.mediaIds.length : r.assetId ? 1 : 0,
    })),
  };
}
