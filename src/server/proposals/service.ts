/**
 * 041 — Propuestas comerciales: servicio del CRM.
 *
 * Acá vive todo lo que NO es HTTP: plantillas por tipo de sugerencia (con
 * textos base de fábrica), creación de la propuesta (imagen, logo del emisor,
 * compañía auspiciada con su logo bajado a la DB, oferta y beneficio),
 * DERIVACIÓN al empleado con aviso en el chat interno (igual mecánica que las
 * alertas: se deriva y se le asigna prioridad), y el registro de envío.
 *
 * El cliente/pólizas siguen en Airtable (solo lectura): esto es contenido
 * propio del CRM.
 */
import { randomBytes } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import {
  PROPOSAL_KINDS,
  type FollowUpItemDto,
  type ProposalDto,
  type ProposalPriority,
  type ProposalTemplateDto,
} from "@/lib/types";
import { proposalToDto } from "@/server/clients/ficha";
import { canManageAlertAssignments } from "@/server/alerts/assignments";
import { resolveOrLinkClient, ClientLinkError } from "@/server/clients/link";
import { airtableList } from "@/server/clients/sgsa";
import { createDmRoom, postChatMessage } from "@/server/internal/chat";
import { sniffFaviconMime } from "@/lib/favicon";
import { isAngleId, isToneId } from "@/lib/proposals/copy";
import { normalizeAdImage } from "@/server/images/normalize";
import { recordProposalEvent, resolveUserName } from "./events";

export class ProposalError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string = "proposal_error"
  ) {
    super(message);
    this.name = "ProposalError";
  }
}

export function kindLabel(kind: string): string {
  return PROPOSAL_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

export function isProposalKind(kind: string): boolean {
  return PROPOSAL_KINDS.some((k) => k.id === kind);
}

const PRIORITIES: ProposalPriority[] = ["alta", "media", "baja"];
export function isPriority(p: string): p is ProposalPriority {
  return (PRIORITIES as string[]).includes(p);
}

/** Textos base de fábrica por tipo (lo que se ve hasta que se configure). */
export const DEFAULT_TEMPLATES: ProposalTemplateDto[] = [
  {
    id: null,
    kind: "renovacion",
    title: "Tu póliza está por renovarse",
    subtitle: "Renovación acompañada, sin sorpresas",
    body: "Faltan pocos días para el vencimiento de tu póliza. Renová con nosotros y seguís con la misma cobertura y atención de siempre.",
    productName: null,
    offer: "Renovación con continuidad de cobertura y asesoramiento personalizado.",
    benefit: null,
    ctaLabel: "Quiero renovar",
    ctaUrl: null,
    ctaKind: "link",
    assetId: null,
    logoAssetId: null,
    hasImage: false,
    hasLogo: false,
    updatedAt: null,
  },
  {
    id: null,
    kind: "retencion",
    title: "Cuidamos lo que más te importa",
    subtitle: "Tu cobertura, siempre a mano",
    body: "Queremos que sigas protegido sin interrupciones. Revisemos juntos tu cobertura actual y ajustemos lo que haga falta.",
    productName: null,
    offer: "Revisión de tu cobertura vigente con un asesor dedicado.",
    benefit: null,
    ctaLabel: "Quiero que me contacten",
    ctaUrl: null,
    ctaKind: "link",
    assetId: null,
    logoAssetId: null,
    hasImage: false,
    hasLogo: false,
    updatedAt: null,
  },
  {
    id: null,
    kind: "venta_cruzada",
    title: "Sumá una cobertura a tu medida",
    subtitle: "¿Sabías que podés ampliar tu protección?",
    body: "Ya tenés una cobertura con nosotros. Sumá la que te falta y protegé todo lo que construiste, con la comodidad de un solo lugar.",
    productName: null,
    offer: "Segunda cobertura con atención personalizada y cotización en el día.",
    benefit: null,
    ctaLabel: "Quiero más información",
    ctaUrl: null,
    ctaKind: "link",
    assetId: null,
    logoAssetId: null,
    hasImage: false,
    hasLogo: false,
    updatedAt: null,
  },
  {
    id: null,
    kind: "reactivacion",
    title: "Volvé a estar protegido",
    subtitle: "Tu cobertura te está esperando",
    body: "Hace un tiempo no tenemos novedades tuyas. Las condiciones cambiaron y hoy podés retomar tu cobertura con beneficios pensados para vos.",
    productName: null,
    offer: "Reactivación de tu cobertura con condiciones actuales.",
    benefit: null,
    ctaLabel: "Quiero reactivar mi cobertura",
    ctaUrl: null,
    ctaKind: "link",
    assetId: null,
    logoAssetId: null,
    hasImage: false,
    hasLogo: false,
    updatedAt: null,
  },
  {
    id: null,
    kind: "fidelizacion",
    title: "Gracias por confiar en nosotros",
    subtitle: "Beneficios por ser cliente",
    body: "Cuidar lo tuyo es nuestro trabajo. Te dejamos beneficios pensados para clientes que, como vos, eligen estar cubiertos.",
    productName: null,
    offer: "Beneficios exclusivos para clientes activos.",
    benefit: null,
    ctaLabel: "Ver mis beneficios",
    ctaUrl: null,
    ctaKind: "link",
    assetId: null,
    logoAssetId: null,
    hasImage: false,
    hasLogo: false,
    updatedAt: null,
  },
];

/* ------------------------------------------------------------------ */
/* Plantillas                                                          */
/* ------------------------------------------------------------------ */

export async function listTemplates(
  organizationId: string
): Promise<ProposalTemplateDto[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.proposalTemplate)
    .where(scoped(schema.proposalTemplate.organizationId, organizationId));
  const byKind = new Map(rows.map((r) => [r.kind, r]));
  return DEFAULT_TEMPLATES.map((base) => {
    const row = byKind.get(base.kind);
    if (!row) return base;
    return {
      id: row.id,
      kind: row.kind,
      title: row.title || base.title,
      subtitle: row.subtitle ?? base.subtitle,
      body: row.body || base.body,
      productName: row.productName,
      offer: row.offer ?? base.offer,
      benefit: row.benefit,
      ctaLabel: row.ctaLabel ?? base.ctaLabel,
      ctaUrl: row.ctaUrl,
      ctaKind: row.ctaKind,
      assetId: row.assetId,
      logoAssetId: row.logoAssetId,
      hasImage: Boolean(row.assetId),
      hasLogo: Boolean(row.logoAssetId),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function getTemplate(
  organizationId: string,
  kind: string
): Promise<ProposalTemplateDto> {
  const all = await listTemplates(organizationId);
  const found = all.find((t) => t.kind === kind);
  if (!found) {
    throw new ProposalError("Tipo de propuesta desconocido", 400, "bad_kind");
  }
  return found;
}

export async function upsertTemplate(input: {
  organizationId: string;
  kind: string;
  title?: string;
  subtitle?: string | null;
  body?: string;
  productName?: string | null;
  offer?: string | null;
  benefit?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  ctaKind?: "link" | "pdf";
  assetId?: string | null;
  logoAssetId?: string | null;
}): Promise<ProposalTemplateDto> {
  if (!isProposalKind(input.kind)) {
    throw new ProposalError("Tipo de propuesta desconocido", 400, "bad_kind");
  }
  const sanitized = sanitizeTemplateInput(input);
  const db = getDb();
  const id = await ensureTemplateRow(input.organizationId, input.kind);
  await db
    .update(schema.proposalTemplate)
    .set({ ...sanitized, updatedAt: new Date() })
    .where(
      scoped(
        schema.proposalTemplate.organizationId,
        input.organizationId,
        eq(schema.proposalTemplate.id, id)
      )
    );
  return getTemplate(input.organizationId, input.kind);
}

async function ensureTemplateRow(
  organizationId: string,
  kind: string
): Promise<string> {
  const db = getDb();
  const existing = await db
    .select({ id: schema.proposalTemplate.id })
    .from(schema.proposalTemplate)
    .where(
      scoped(
        schema.proposalTemplate.organizationId,
        organizationId,
        eq(schema.proposalTemplate.kind, kind)
      )
    )
    .limit(1);
  if (existing[0]) return existing[0].id;
  const id = newId("proposalTemplate");
  const base = DEFAULT_TEMPLATES.find((t) => t.kind === kind)!;
  await db.insert(schema.proposalTemplate).values({
    id,
    organizationId,
    kind,
    title: base.title,
    subtitle: base.subtitle,
    body: base.body,
    ctaLabel: base.ctaLabel,
    ctaKind: "link",
  });
  return id;
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function cleanUrl(v: unknown): string | null {
  const t = cleanText(v, 500);
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : null;
}

function sanitizeTemplateInput(input: {
  title?: string;
  subtitle?: string | null;
  body?: string;
  productName?: string | null;
  offer?: string | null;
  benefit?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  ctaKind?: "link" | "pdf";
  assetId?: string | null;
  logoAssetId?: string | null;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) out.title = cleanText(input.title, 120) ?? "";
  if (input.subtitle !== undefined)
    out.subtitle = cleanText(input.subtitle, 160);
  if (input.body !== undefined) out.body = cleanText(input.body, 1600) ?? "";
  if (input.productName !== undefined)
    out.productName = cleanText(input.productName, 120);
  if (input.offer !== undefined) out.offer = cleanText(input.offer, 400);
  if (input.benefit !== undefined) out.benefit = cleanText(input.benefit, 200);
  if (input.ctaLabel !== undefined) out.ctaLabel = cleanText(input.ctaLabel, 60);
  if (input.ctaUrl !== undefined) out.ctaUrl = cleanUrl(input.ctaUrl);
  if (input.ctaKind !== undefined)
    out.ctaKind = input.ctaKind === "pdf" ? "pdf" : "link";
  if (input.assetId !== undefined)
    out.assetId = input.assetId ? String(input.assetId).slice(0, 60) : null;
  if (input.logoAssetId !== undefined)
    out.logoAssetId = input.logoAssetId
      ? String(input.logoAssetId).slice(0, 60)
      : null;
  return out;
}

/* ------------------------------------------------------------------ */
/* Assets (imágenes)                                                   */
/* ------------------------------------------------------------------ */

export const ASSET_MAX_BYTES = 2_500_000;

/** 041b — Tope de la SUBIDA, antes de adaptar: las fotos reales pesan esto. */
export const ASSET_UPLOAD_MAX_BYTES = 8_000_000;

export async function storeAsset(input: {
  organizationId: string;
  mime: string;
  filename?: string | null;
  data: string; // base64 sin prefijo
}): Promise<string> {
  const buf = Buffer.from(input.data, "base64");
  if (!buf.byteLength) {
    throw new ProposalError("La imagen llegó vacía", 422, "empty_asset");
  }
  // 041b — El formato sale de los BYTES, no del mime declarado: la foto que
  // sale del celular es HEIC y antes se rechazaba. Entra igual y se ADAPTA a
  // WebP de hasta 1920 px (cientos de KB, que es lo que viaja bien por
  // WhatsApp). El GIF animado pasa tal cual, sin rasterizar.
  const sniff = sniffFaviconMime(new Uint8Array(buf));
  const permitido =
    sniff !== null && /^image\/(png|jpe?g|webp|gif|avif|heic|heif)$/.test(sniff);
  if (!permitido) {
    throw new ProposalError(
      "Formato de imagen no soportado. Probá con PNG, JPG, WebP, HEIC, AVIF o GIF",
      422,
      "bad_mime"
    );
  }
  if (buf.byteLength > ASSET_UPLOAD_MAX_BYTES) {
    throw new ProposalError(
      `La imagen no puede pasar de ${Math.round(ASSET_UPLOAD_MAX_BYTES / (1024 * 1024))} MB`,
      422,
      "asset_too_big"
    );
  }
  let stored = buf;
  let storedMime: string = sniff!;
  if (sniff !== "image/gif") {
    try {
      const normalizada = await normalizeAdImage(new Uint8Array(buf));
      stored = Buffer.from(normalizada.data);
      storedMime = normalizada.mime;
    } catch (err) {
      console.error("[proposals] no se pudo adaptar la imagen:", err);
      throw new ProposalError("No pude procesar esa imagen", 422, "unreadable_asset");
    }
  }
  const id = newId("proposalAsset");
  const db = getDb();
  await db.insert(schema.proposalAsset).values({
    id,
    organizationId: input.organizationId,
    mime: storedMime,
    filename: cleanText(input.filename, 160),
    byteSize: stored.byteLength,
    data: stored.toString("base64"),
  });
  return id;
}

async function downloadToAsset(input: {
  organizationId: string;
  url: string;
  filename: string;
}): Promise<string | null> {
  try {
    const res = await fetch(input.url, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "image/png").split(";")[0]!;
    if (!/^image\//i.test(mime)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.byteLength || buf.byteLength > ASSET_MAX_BYTES) return null;
    return storeAsset({
      organizationId: input.organizationId,
      mime,
      filename: input.filename,
      data: buf.toString("base64"),
    });
  } catch {
    return null;
  }
}

/** Logo de una compañía del sistema (attachment de Airtable) bajado a asset. */
export async function downloadCompanyLogo(input: {
  organizationId: string;
  companyRef: string;
}): Promise<{ companyName: string | null; assetId: string | null }> {
  if (!/^rec[A-Za-z0-9]{4,30}$/.test(input.companyRef)) {
    return { companyName: null, assetId: null };
  }
  const params = new URLSearchParams();
  params.set("maxRecords", "1");
  params.set("filterByFormula", `RECORD_ID()="${input.companyRef}"`);
  params.append("fields[]", "NOMBRE");
  params.append("fields[]", "LOGO");
  const recs = await airtableList("COMPANIA", params).catch(() => []);
  const rec = recs[0];
  if (!rec) return { companyName: null, assetId: null };
  const nombre =
    typeof rec.fields["NOMBRE"] === "string"
      ? (rec.fields["NOMBRE"] as string)
      : null;
  const logo = Array.isArray(rec.fields["LOGO"])
    ? (rec.fields["LOGO"] as Array<{
        url?: string;
        thumbnails?: { large?: { url?: string } };
      }>)
    : [];
  const url = logo[0]?.thumbnails?.large?.url ?? logo[0]?.url ?? null;
  const assetId = url
    ? await downloadToAsset({
        organizationId: input.organizationId,
        url,
        filename: `compania-${input.companyRef}`,
      })
    : null;
  return { companyName: nombre, assetId };
}

/* ------------------------------------------------------------------ */
/* Propuestas                                                          */
/* ------------------------------------------------------------------ */

function newToken(): string {
  return randomBytes(9).toString("base64url");
}

export function absoluteProposalUrl(token: string): string {
  const base = getEnv().APP_BASE_URL.replace(/\/+$/, "");
  return `${base}/p/${token}`;
}

export async function createProposal(input: {
  organizationId: string;
  userId: string;
  kind: string;
  clientRef: string;
  clientName: string;
  clientDni?: string | null;
  clientPhone?: string | null;
  title?: string | null;
  subtitle?: string | null;
  body?: string | null;
  productName?: string | null;
  offer?: string | null;
  benefit?: string | null;
  companyRef?: string | null;
  companyName?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  ctaKind?: "link" | "pdf";
  assetId?: string | null;
  logoAssetId?: string | null;
  assigneeUserId?: string | null;
  priority?: ProposalPriority;
  /** 041c — tono y concepto de venta elegidos para escribir la publicidad. */
  tone?: string | null;
  angle?: string | null;
}): Promise<ProposalDto> {
  if (!isProposalKind(input.kind)) {
    throw new ProposalError("Tipo de propuesta desconocido", 400, "bad_kind");
  }
  if (!/^rec[A-Za-z0-9]{4,30}$/.test(input.clientRef)) {
    throw new ProposalError("Cliente inválido", 400, "bad_client");
  }
  const tpl = await getTemplate(input.organizationId, input.kind);

  let companyAssetId: string | null = null;
  let companyName = cleanText(input.companyName, 120);
  if (input.companyRef) {
    const logo = await downloadCompanyLogo({
      organizationId: input.organizationId,
      companyRef: input.companyRef,
    });
    if (logo.companyName) companyName = logo.companyName;
    companyAssetId = logo.assetId;
  }

  const id = newId("proposal");
  const token = newToken();
  const db = getDb();
  await db.insert(schema.proposal).values({
    id,
    organizationId: input.organizationId,
    token,
    kind: input.kind,
    clientRef: input.clientRef,
    clientName: cleanText(input.clientName, 160) ?? "Cliente",
    clientDni: cleanText(input.clientDni, 20),
    clientPhone: cleanText(input.clientPhone, 30),
    title: cleanText(input.title, 120) ?? tpl.title,
    subtitle: cleanText(input.subtitle, 160) ?? tpl.subtitle,
    body: cleanText(input.body, 1600) ?? tpl.body,
    productName: cleanText(input.productName, 120) ?? tpl.productName,
    offer: cleanText(input.offer, 400) ?? tpl.offer,
    benefit: cleanText(input.benefit, 200) ?? tpl.benefit,
    companyRef: input.companyRef ?? null,
    companyName,
    companyAssetId,
    logoAssetId: input.logoAssetId ?? tpl.logoAssetId ?? null,
    ctaLabel: cleanText(input.ctaLabel, 60) ?? tpl.ctaLabel,
    ctaUrl: cleanUrl(input.ctaUrl) ?? tpl.ctaUrl,
    ctaKind: input.ctaKind ?? tpl.ctaKind,
    assetId: input.assetId ?? tpl.assetId ?? null,
    assigneeUserId: input.assigneeUserId ?? null,
    priority: input.priority && isPriority(input.priority) ? input.priority : "media",
    tone: isToneId(input.tone) ? input.tone : null,
    angle: isAngleId(input.angle) ? input.angle : null,
    createdBy: input.userId,
  });

  // 041e — el historial arranca con quien la creó.
  await recordProposalEvent({
    organizationId: input.organizationId,
    proposalId: id,
    actorId: input.userId,
    actorName: await resolveUserName(input.userId),
    action: "creada",
    detail: `Creó la publicidad «${cleanText(input.title, 120) ?? tpl.title}»`,
  });

  return getProposalById(input.organizationId, id);
}

export async function getProposalById(
  organizationId: string,
  id: string
): Promise<ProposalDto> {
  const db = getDb();
  const rows = await db
    .select({ p: schema.proposal, assigneeName: schema.user.name })
    .from(schema.proposal)
    .leftJoin(schema.user, eq(schema.proposal.assigneeUserId, schema.user.id))
    .where(
      scoped(
        schema.proposal.organizationId,
        organizationId,
        eq(schema.proposal.id, id),
        isNull(schema.proposal.deletedAt)
      )
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new ProposalError("Propuesta no encontrada", 404, "not_found");
  const dto = proposalToDto(row.p, {
    assigneeName: row.assigneeName,
    respondedAt: await respondedAtFor(row.p),
  });
  return dto;
}

async function respondedAtFor(
  p: typeof schema.proposal.$inferSelect
): Promise<string | null> {
  if (!p.conversationId || !p.sentAt) return null;
  const db = getDb();
  const rows = await db
    .select({ lastInboundAt: schema.conversation.lastInboundAt })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        p.organizationId,
        eq(schema.conversation.id, p.conversationId)
      )
    )
    .limit(1);
  const li = rows[0]?.lastInboundAt ?? null;
  if (li && li.getTime() > p.sentAt.getTime()) return li.toISOString();
  return null;
}

export async function listProposals(input: {
  organizationId: string;
  assigneeUserId?: string | null;
  /** 041b — filtrar por grupo destino. */
  assigneeGroupId?: string | null;
  status?: string | null;
  clientRef?: string | null;
  limit?: number;
  /**
   * 041b — alcance por rol, igual que la bandeja (026): gerente, propietario
   * y administrador ven TODAS las gestiones; un miembro ve las suyas (las que
   * gestiona, las de sus grupos y las que creó).
   */
  viewerUserId?: string;
  viewerRole?: string;
  /** 041e — por defecto se ocultan las archivadas; el panel las pide aparte. */
  includeArchived?: boolean;
  /** 041e — solo las archivadas (el filtro «Archivadas» del panel). */
  archivedOnly?: boolean;
}): Promise<{ proposals: ProposalDto[]; funnel: ProposalFunnel }> {
  const db = getDb();
  const conditions: SQL[] = [];

  // 041e — lo eliminado no se lista jamás.
  conditions.push(isNull(schema.proposal.deletedAt));

  if (input.archivedOnly) {
    conditions.push(isNotNull(schema.proposal.archivedAt));
  } else if (!input.includeArchived) {
    conditions.push(isNull(schema.proposal.archivedAt));
  }
  if (input.assigneeUserId) {
    conditions.push(eq(schema.proposal.assigneeUserId, input.assigneeUserId));
  }
  if (input.assigneeGroupId) {
    conditions.push(eq(schema.proposal.assigneeGroupId, input.assigneeGroupId));
  }
  if (input.status && ["borrador", "derivada", "enviada"].includes(input.status)) {
    conditions.push(
      eq(schema.proposal.status, input.status as "borrador" | "derivada" | "enviada")
    );
  }
  if (input.clientRef) {
    conditions.push(eq(schema.proposal.clientRef, input.clientRef));
  }

  if (
    input.viewerUserId &&
    input.viewerRole &&
    !canManageAlertAssignments(input.viewerRole)
  ) {
    const misGrupos = await db
      .select({ roomId: schema.chatRoomMember.roomId })
      .from(schema.chatRoomMember)
      .where(
        and(
          eq(schema.chatRoomMember.organizationId, input.organizationId),
          eq(schema.chatRoomMember.userId, input.viewerUserId),
          isNull(schema.chatRoomMember.pausedAt)
        )
      );
    const grupoIds = misGrupos.map((g) => g.roomId);
    const alcance = [
      eq(schema.proposal.assigneeUserId, input.viewerUserId),
      eq(schema.proposal.createdBy, input.viewerUserId),
    ];
    if (grupoIds.length) {
      alcance.push(inArray(schema.proposal.assigneeGroupId, grupoIds));
    }
    conditions.push(or(...alcance)!);
  }

  const rows = await db
    .select({
      p: schema.proposal,
      assigneeName: schema.user.name,
      groupName: schema.chatRoom.name,
      lastInboundAt: schema.conversation.lastInboundAt,
    })
    .from(schema.proposal)
    .leftJoin(schema.user, eq(schema.proposal.assigneeUserId, schema.user.id))
    .leftJoin(schema.chatRoom, eq(schema.proposal.assigneeGroupId, schema.chatRoom.id))
    .leftJoin(
      schema.conversation,
      eq(schema.proposal.conversationId, schema.conversation.id)
    )
    .where(scoped(schema.proposal.organizationId, input.organizationId, ...conditions))
    .orderBy(desc(schema.proposal.createdAt))
    .limit(Math.min(input.limit ?? 120, 300));

  const proposals = rows.map(({ p, assigneeName, groupName, lastInboundAt }) => {
    const respondedAt =
      p.sentAt && lastInboundAt && lastInboundAt.getTime() > p.sentAt.getTime()
        ? lastInboundAt.toISOString()
        : null;
    const quien = p.assigneeGroupId
      ? groupName?.trim() || "Grupo"
      : assigneeName;
    return proposalToDto(p, { assigneeName: quien, respondedAt });
  });

  const funnel: ProposalFunnel = {
    total: proposals.length,
    borrador: proposals.filter((p) => p.status === "borrador").length,
    derivada: proposals.filter((p) => p.status === "derivada").length,
    enviada: proposals.filter((p) => p.status === "enviada").length,
    vistas: proposals.filter((p) => p.views > 0).length,
    respondidas: proposals.filter((p) => p.respondedAt).length,
  };
  return { proposals, funnel };
}

export type ProposalFunnel = {
  total: number;
  borrador: number;
  derivada: number;
  enviada: number;
  vistas: number;
  respondidas: number;
};

/**
 * DERIVACIÓN (mecánica de las alertas): se asigna a un empleado con
 * prioridad, se registra en el historial del tablero y se le manda el AVISO
 * a su chat interno (DM) con el link público de la pieza.
 */
export async function deriveProposal(input: {
  organizationId: string;
  userId: string;
  id: string;
  /** 041b — destino: empleado del CRM O grupo del chat interno (uno solo). */
  assigneeUserId?: string | null;
  assigneeGroupId?: string | null;
  priority: ProposalPriority;
  note?: string | null;
}): Promise<ProposalDto> {
  if (!isPriority(input.priority)) {
    throw new ProposalError("Prioridad inválida", 422, "bad_priority");
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.proposal)
    .where(
      scoped(
        schema.proposal.organizationId,
        input.organizationId,
        eq(schema.proposal.id, input.id)
      )
    )
    .limit(1);
  const p = rows[0];
  if (!p) throw new ProposalError("Propuesta no encontrada", 404, "not_found");

  // El destino: un empleado del equipo (con su DM) o un grupo del chat
  // interno (la sala ya existe) — la misma mecánica que las alertas.
  const destinoEmpleado = input.assigneeUserId?.trim() || null;
  const destinoGrupo = input.assigneeGroupId?.trim() || null;
  if ((destinoEmpleado && destinoGrupo) || (!destinoEmpleado && !destinoGrupo)) {
    throw new ProposalError("Elegí un empleado o un grupo (uno solo)", 422, "bad_target");
  }

  let assigneeUserId: string | null = null;
  let assigneeGroupId: string | null = null;
  let avisoRoomId: string | null = null;

  let assigneeName: string | null = null;
  let assigneeGroupName: string | null = null;

  if (destinoEmpleado) {
    // Tiene que ser parte del equipo (mismo requisito que el DM).
    const memberRow = await db
      .select({ userId: schema.member.userId, name: schema.user.name })
      .from(schema.member)
      .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
      .where(
        scoped(
          schema.member.organizationId,
          input.organizationId,
          eq(schema.member.userId, destinoEmpleado)
        )
      )
      .limit(1);
    if (!memberRow[0]) {
      throw new ProposalError("Ese empleado no es parte del equipo", 404, "no_member");
    }
    assigneeUserId = memberRow[0].userId;
    assigneeName = memberRow[0].name;
  } else {
    const groupRow = await db
      .select({ id: schema.chatRoom.id, name: schema.chatRoom.name })
      .from(schema.chatRoom)
      .where(
        scoped(
          schema.chatRoom.organizationId,
          input.organizationId,
          eq(schema.chatRoom.kind, "group"),
          eq(schema.chatRoom.id, destinoGrupo!)
        )
      )
      .limit(1);
    if (!groupRow[0]) {
      throw new ProposalError("Ese grupo no existe en el chat interno", 404, "no_group");
    }
    assigneeGroupId = groupRow[0].id;
    assigneeGroupName = groupRow[0].name;
    avisoRoomId = groupRow[0].id;
  }

  await db
    .update(schema.proposal)
    .set({
      assigneeUserId,
      assigneeGroupId,
      priority: input.priority,
      status: p.status === "borrador" ? "derivada" : p.status,
      derivedAt: new Date(),
      derivedBy: input.userId,
    })
    .where(
      scoped(
        schema.proposal.organizationId,
        input.organizationId,
        eq(schema.proposal.id, input.id)
      )
    );
  await db.insert(schema.dashboardAction).values({
    id: newId("dashboardAction"),
    organizationId: input.organizationId,
    source: "propuesta",
    playId: p.kind,
    module: "propuestas",
    contactId: p.contactId,
    conversationId: p.conversationId,
    clientRef: p.clientRef,
    clientName: p.clientName,
    userId: input.userId,
  });

  // AVISO: al empleado por DM; al grupo en su propia sala (no hace falta
  // crearla). Mismo mecanismo que las alertas.
  const url = absoluteProposalUrl(p.token);
  const bodyLines = [
    `🎯 Propuesta de ${kindLabel(p.kind).toLowerCase()} para ${p.clientName}`,
    `Prioridad: ${input.priority.toUpperCase()}`,
    p.offer ? `Oferta: ${p.offer}` : null,
    p.benefit ? `Beneficio: ${p.benefit}` : null,
    input.note ? `Nota: ${input.note}` : null,
    "",
    `Abrila y compartila desde acá: ${url}`,
  ].filter((l): l is string => l !== null);
  try {
    const roomId =
      avisoRoomId ??
      (await createDmRoom(input.organizationId, input.userId, assigneeUserId!)).id;
    await postChatMessage({
      organizationId: input.organizationId,
      roomId,
      senderId: input.userId,
      body: bodyLines.join("\n"),
    });
  } catch (err) {
    // El aviso no puede tumbar la derivación: queda registrada igual.
    console.error("[proposals] no se pudo enviar el aviso al chat:", err);
  }

  // 041e — al historial: quién la derivó y a quién.
  await recordProposalEvent({
    organizationId: input.organizationId,
    proposalId: input.id,
    actorId: input.userId,
    actorName: await resolveUserName(input.userId),
    action: "derivada",
    detail: destinoEmpleado
      ? `Derivada a ${assigneeName ?? "un empleado"} · prioridad ${input.priority}`
      : `Derivada al grupo «${assigneeGroupName ?? "grupo"}» · prioridad ${input.priority}`,
  });

  return getProposalById(input.organizationId, input.id);
}

/**
 * Marca la propuesta como ENVIADA: garantiza contacto/conversación del
 * cliente (mismo camino que «Mandar mensaje») y registra el hito para el
 * embudo. Devuelve la propuesta + a qué conversación ir con el borrador.
 */
export async function markProposalSent(input: {
  organizationId: string;
  userId: string;
  id: string;
}): Promise<ProposalDto & { conversationId: string | null; contactId: string | null }> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.proposal)
    .where(
      scoped(
        schema.proposal.organizationId,
        input.organizationId,
        eq(schema.proposal.id, input.id)
      )
    )
    .limit(1);
  const p = rows[0];
  if (!p) throw new ProposalError("Propuesta no encontrada", 404, "not_found");

  let contactId = p.contactId;
  let conversationId = p.conversationId;
  try {
    const linked = await resolveOrLinkClient({
      organizationId: input.organizationId,
      recordId: p.clientRef,
      name: p.clientName,
      phone: p.clientPhone,
      userId: input.userId,
    });
    contactId = linked.contactId;
    conversationId = linked.conversationId;
  } catch (err) {
    if (!(err instanceof ClientLinkError)) throw err;
    // Sin teléfono no hay conversación: la propuesta igual queda enviada
    // (el asesor puede copiar el link y mandarlo por otra vía).
    if (err.code !== "no_phone") throw err;
  }

  await db
    .update(schema.proposal)
    .set({
      status: "enviada",
      sentAt: p.sentAt ?? new Date(),
      contactId,
      conversationId,
    })
    .where(
      scoped(
        schema.proposal.organizationId,
        input.organizationId,
        eq(schema.proposal.id, input.id)
      )
    );

  if (!p.sentAt) {
    await db.insert(schema.dashboardAction).values({
      id: newId("dashboardAction"),
      organizationId: input.organizationId,
      source: "propuesta",
      playId: p.kind,
      module: "propuestas",
      contactId,
      conversationId,
      clientRef: p.clientRef,
      clientName: p.clientName,
      userId: input.userId,
    });
  }

  // 041e — al historial: el envío (primera vez o reenvío).
  if (!p.sentAt) {
    await recordProposalEvent({
      organizationId: input.organizationId,
      proposalId: input.id,
      actorId: input.userId,
      actorName: await resolveUserName(input.userId),
      action: "enviada",
      detail: `Enviada a ${p.clientName} por WhatsApp`,
    });
  }

  const dto = await getProposalById(input.organizationId, input.id);
  return { ...dto, conversationId, contactId };
}

/* ------------------------------------------------------------------ */
/* Página pública                                                      */
/* ------------------------------------------------------------------ */

export type PublicProposal = {
  token: string;
  title: string;
  subtitle: string | null;
  body: string;
  productName: string | null;
  offer: string | null;
  benefit: string | null;
  companyName: string | null;
  companyAssetId: string | null;
  logoAssetId: string | null;
  assetId: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  ctaKind: "link" | "pdf";
  clientName: string;
  kind: string;
  /** 041e — la publicidad se puede pausar (online/offline) desde el panel. */
  online: boolean;
};

/** Lectura pública por token + registro de vista (primera y última). */
export async function loadPublicProposal(
  token: string,
  opts: { countView?: boolean } = {}
): Promise<PublicProposal | null> {
  const clean = (token ?? "").trim();
  if (!/^[A-Za-z0-9_-]{8,32}$/.test(clean)) return null;
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.proposal)
    .where(eq(schema.proposal.token, clean))
    .limit(1);
  const p = rows[0];
  if (!p) return null;
  // 041e — eliminada no existe para el mundo; pausada tampoco suma vistas.
  if (p.deletedAt) return null;

  if (opts.countView !== false && p.online) {
    await db
      .update(schema.proposal)
      .set({
        views: p.views + 1,
        lastViewAt: new Date(),
        firstViewAt: p.firstViewAt ?? new Date(),
      })
      .where(eq(schema.proposal.id, p.id));
  }

  return {
    token: p.token,
    title: p.title,
    subtitle: p.subtitle,
    body: p.body,
    productName: p.productName,
    offer: p.offer,
    benefit: p.benefit,
    companyName: p.companyName,
    companyAssetId: p.companyAssetId,
    logoAssetId: p.logoAssetId,
    assetId: p.assetId,
    ctaLabel: p.ctaLabel,
    ctaUrl: p.ctaUrl,
    ctaKind: p.ctaKind,
    clientName: p.clientName,
    kind: p.kind,
    online: p.online,
  };
}

/* ------------------------------------------------------------------ */
/* 041b — Seguimiento comercial                                        */
/* ------------------------------------------------------------------ */

/**
 * Todo el seguimiento comercial de las acciones del Cliente 360: cada
 * propuesta con sus hitos (creada → derivada → enviada → vista → respondió)
 * más las acciones que el sistema registró (mensajes disparados desde la
 * Cola de hoy y desde la ficha). Ordenado de lo más nuevo a lo más viejo.
 *
 * Alcance por rol (mismo criterio que la bandeja): gerente, propietario y
 * administrador ven todo el equipo; un miembro ve lo suyo.
 */
export async function listCommercialFollowUp(input: {
  organizationId: string;
  viewerUserId: string;
  viewerRole: string;
  clientRef?: string | null;
  assigneeUserId?: string | null;
  limit?: number;
}): Promise<{ items: FollowUpItemDto[] }> {
  const db = getDb();
  const restringido = !canManageAlertAssignments(input.viewerRole);
  const tope = Math.min(input.limit ?? 250, 400);

  const { proposals } = await listProposals({
    // 041e — el seguimiento es archivo histórico: muestra también archivadas.
    includeArchived: true,
    organizationId: input.organizationId,
    clientRef: input.clientRef,
    assigneeUserId: input.assigneeUserId,
    limit: 250,
    viewerUserId: input.viewerUserId,
    viewerRole: input.viewerRole,
  });

  const items: FollowUpItemDto[] = [];
  for (const p of proposals) {
    const base = {
      type: "propuesta" as const,
      source: "propuesta" as const,
      clientRef: p.clientRef,
      clientName: p.clientName,
      userName: p.createdByName ?? p.assigneeName,
      token: p.token,
      status: p.statusLabel,
    };
    items.push({
      id: `${p.id}:c`,
      at: p.createdAt,
      what: "creada",
      detail: kindLabel(p.kind),
      ...base,
    });
    if (p.derivedAt) {
      items.push({
        id: `${p.id}:d`,
        at: p.derivedAt,
        what: "derivada",
        detail: p.assigneeName ? `gestiona: ${p.assigneeName}` : null,
        ...base,
      });
    }
    if (p.sentAt) {
      items.push({ id: `${p.id}:s`, at: p.sentAt, what: "enviada", detail: null, ...base });
    }
    if (p.firstViewAt) {
      items.push({
        id: `${p.id}:v`,
        at: p.firstViewAt,
        what: "vista",
        detail: `${p.views} vista${p.views === 1 ? "" : "s"}`,
        ...base,
      });
    }
    if (p.respondedAt) {
      items.push({ id: `${p.id}:r`, at: p.respondedAt, what: "respondio", detail: null, ...base });
    }
    // 041e — estado de gestión: archivada y online/offline también son hitos.
    if (p.archivedAt) {
      items.push({
        id: `${p.id}:a`,
        at: p.archivedAt,
        what: "archivada",
        detail: "fuera del trabajo activo (se puede desarchivar)",
        ...base,
      });
    }
    if (p.status === "enviada" && !p.online) {
      items.push({
        id: `${p.id}:o`,
        at: p.sentAt ?? p.createdAt,
        what: "pausada",
        detail: "la publicidad está offline",
        ...base,
      });
    }
  }

  // Acciones que el sistema ya registraba en el tablero (040): los mensajes
  // disparados desde la Cola de hoy y desde la ficha. Las de origen
  // «propuesta» no se repiten: el hito «derivada» ya las cuenta arriba.
  const condiciones = [eq(schema.dashboardAction.organizationId, input.organizationId)];
  if (input.clientRef) {
    condiciones.push(eq(schema.dashboardAction.clientRef, input.clientRef));
  }
  if (input.assigneeUserId) {
    condiciones.push(eq(schema.dashboardAction.userId, input.assigneeUserId));
  }
  if (restringido) {
    condiciones.push(eq(schema.dashboardAction.userId, input.viewerUserId));
  }
  const acciones = await db
    .select({
      id: schema.dashboardAction.id,
      at: schema.dashboardAction.createdAt,
      source: schema.dashboardAction.source,
      module: schema.dashboardAction.module,
      playId: schema.dashboardAction.playId,
      clientRef: schema.dashboardAction.clientRef,
      clientName: schema.dashboardAction.clientName,
      userName: schema.user.name,
    })
    .from(schema.dashboardAction)
    .leftJoin(schema.user, eq(schema.dashboardAction.userId, schema.user.id))
    .where(and(...condiciones))
    .orderBy(desc(schema.dashboardAction.createdAt))
    .limit(tope);

  for (const a of acciones) {
    if (a.source === "propuesta") continue;
    items.push({
      id: a.id,
      at: a.at.toISOString(),
      type: "accion",
      what: "accion",
      source: a.source === "ficha" ? "ficha" : "cola",
      clientRef: a.clientRef,
      clientName: a.clientName,
      userName: a.userName,
      detail: [a.module, a.playId].filter(Boolean).join(" · ") || null,
      token: null,
      status: null,
    });
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { items: items.slice(0, tope) };
}
