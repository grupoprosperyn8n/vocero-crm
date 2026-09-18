/**
 * 041 — FICHA 360° del cliente (panel de control del CRM).
 *
 * Arma TODO lo que muestra el panel en un solo viaje: identidad, pólizas con
 * importes y vencimientos, gestiones del sistema por mes, historia y el
 * costado CRM (actividad de WhatsApp y propuestas comerciales). Solo lectura
 * contra Airtable SGSA — la base sigue siendo la fuente única y acá no se
 * escribe absolutamente nada.
 *
 * Pedido Diego (2026-09-18): «primero que tenga métricas y gráficas del
 * cliente 360 que potenciabilicen la mejora y entendimiento».
 */
import { count, desc, eq, gte, inArray } from "drizzle-orm";
import type {
  ClientFichaDto,
  FichaGestion,
  FichaGestionesMonthPoint,
  FichaMonthPoint,
  FichaPolicy,
  FichaProductSlice,
  FichaWhatsapp,
  ProposalDto,
} from "@/lib/types";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { airtableList } from "@/server/clients/sgsa";
import { matchContactsByPhoneKeys } from "@/server/clients/link";
import { phoneDigits, phoneKey } from "@/server/clients/phone";

const CLIENTES_TABLE = "CLIENTES";
const POLIZAS_TABLE = "POLIZAS";
const GESTIONES_TABLE = "GESTIÓN GENERAL";
const PRODUCTOS_TABLE = "PRODUCTOS";
const COMPANIA_TABLE = "COMPANIA";

/** Campos del cliente que alimentan la identidad y los contadores. */
const CLIENTE_FIELDS = [
  "NOMBRES",
  "APELLIDO",
  "DNI",
  "TELEFONO",
  "TELEFONO NORMALIZADO",
  "EMAIL",
  "🏷️ ESTADO_CLIENTE",
  "ID_UNICO_CLIENTE",
  "FECHA DE ALTA",
  "FECHA DE BAJA",
  "✅ CANTIDAD_POLIZAS",
  "🟢 POLIZAS_ACTIVAS",
  "🔴 POLIZAS_ANULADAS",
  "🟡 POLIZAS_EN_TRAMITES",
  "🟣 POLIZAS_SIN_VIGENCIA",
  "📆 LA_POLIZAS VENCE EN 30 DIAS",
  "📆 LA_POLIZAS VENCE EN 7 DIAS",
  "OFICINAS",
  "PERFIL_DE_RIESGO_IA",
  "FOTO PERFIL",
  "POLIZAS",
  "GESTIÓN GENERAL",
] as const;

const POLIZA_FIELDS = [
  "N° DE POLIZA",
  "IMPORTE",
  "ESTADO DE LA POLIZA",
  "FECHA VENCIMIENTO DE LA POLIZA",
  "FECHA DE INICIO DE LA POLIZA",
  "FECHA DE ANULACION",
  "PRODUCTO LINK",
  "COMPANIA LINK",
  "OFICINA",
  "TIPO ENDOSO / ANULACIÓN",
] as const;

const GESTION_FIELDS = [
  "ID_UNICO_GESTION",
  "MOTIVOS DE LA CONSULTA",
  "TIPO DE SOLICITUD",
  "ESTADO DE LA SOLICITUD",
  "FECHA DE CREACION",
  "IMPORTE",
  "TIPO DE ATENCIÓN",
  "N°  POLIZA GESTIONADA",
] as const;

type AirtableRecord = { id: string; fields: Record<string, unknown> };

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function linkIds(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function firstLink(v: unknown): string | null {
  return linkIds(v)[0] ?? null;
}

/** Fechas de Airtable: "2026-08-10" (a veces ISO con hora). Clave "YYYY-MM". */
function monthKey(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})/.exec(v);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** Fecha ordenable (ISO simple si se puede). */
function dayText(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return s.slice(0, 10);
}

/** Fila(s) por ids: OR(RECORD_ID()="...") en lotes (límite de fórmula). */
async function fetchByIds(
  table: string,
  ids: string[],
  fields: readonly string[],
  chunk = 40
): Promise<AirtableRecord[]> {
  const out: AirtableRecord[] = [];
  const unique = Array.from(new Set(ids));
  for (let i = 0; i < unique.length; i += chunk) {
    const slice = unique.slice(i, i + chunk);
    const params = new URLSearchParams();
    params.set("maxRecords", String(slice.length));
    params.set(
      "filterByFormula",
      `OR(${slice.map((id) => `RECORD_ID()="${id}"`).join(",")})`
    );
    for (const f of fields) params.append("fields[]", f);
    const recs = await airtableList(table, params).catch(() => []);
    out.push(...recs);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Cachés chicas (catálogos que se repiten entre clientes)             */
/* ------------------------------------------------------------------ */

type ProductoInfo = { nombre: string; icono: string | null };
const productoCache = new Map<string, ProductoInfo>();
const companiaCache = new Map<string, string>();

async function resolveProductos(ids: string[]): Promise<Map<string, ProductoInfo>> {
  const missing = ids.filter((id) => !productoCache.has(id));
  if (missing.length) {
    const recs = await fetchByIds(PRODUCTOS_TABLE, missing, [
      "NOMBRE PRODUCTO",
      "ICONO",
    ]);
    for (const r of recs) {
      productoCache.set(r.id, {
        nombre: str(r.fields["NOMBRE PRODUCTO"]) ?? "Producto",
        icono: str(r.fields["ICONO"]),
      });
    }
  }
  const out = new Map<string, ProductoInfo>();
  for (const id of ids) {
    const info = productoCache.get(id);
    if (info) out.set(id, info);
  }
  return out;
}

async function resolveCompanias(ids: string[]): Promise<Map<string, string>> {
  const missing = ids.filter((id) => !companiaCache.has(id));
  if (missing.length) {
    const recs = await fetchByIds(COMPANIA_TABLE, missing, ["NOMBRE"]);
    for (const r of recs) {
      companiaCache.set(r.id, str(r.fields["NOMBRE"]) ?? "Compañía");
    }
  }
  const out = new Map<string, string>();
  for (const id of ids) {
    const nombre = companiaCache.get(id);
    if (nombre) out.set(id, nombre);
  }
  return out;
}

/** ¿La póliza está vigente hoy? (estados compuestos del sistema) */
function esVigente(estado: string[]): boolean {
  const s = estado.join(" ").toUpperCase();
  if (/ANULA|SIN VIGENCIA|SIN POLIZA|EN TRAMITE/.test(s)) return false;
  return /VIGENTE|VENCE|VENCER|2 SEMANAS|DIAS? PARA VENCER/.test(s);
}

/** Últimos 12 meses (claves "YYYY-MM"), más viejo primero. */
function lastMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Próximos 12 meses (desde el mes actual), para vencimientos. */
function nextMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Ficha                                                               */
/* ------------------------------------------------------------------ */

export class FichaError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "FichaError";
  }
}

type CacheEntry = { expires: number; data: ClientFichaDto };
const fichaCache = new Map<string, CacheEntry>();
const FICHA_TTL_MS = 90_000;

export async function getClientFicha(input: {
  organizationId: string;
  recordId: string;
  force?: boolean;
}): Promise<ClientFichaDto> {
  const key = `${input.organizationId}:${input.recordId}`;
  const cached = fichaCache.get(key);
  if (cached && cached.expires > Date.now() && !input.force) {
    return cached.data;
  }

  const params = new URLSearchParams();
  params.set("maxRecords", "1");
  params.set("filterByFormula", `RECORD_ID()="${input.recordId}"`);
  for (const f of CLIENTE_FIELDS) params.append("fields[]", f);
  const [cliente] = await airtableList(CLIENTES_TABLE, params);
  if (!cliente) {
    throw new FichaError("El cliente no existe en el sistema de gestión", 404);
  }

  const f = cliente.fields;
  const telDigits =
    str(f["TELEFONO NORMALIZADO"]) ?? phoneDigits(str(f["TELEFONO"]) ?? "");

  /* --- Pólizas --- */
  const policyIds = linkIds(f["POLIZAS"]).slice(0, 80);
  const polRecs = policyIds.length
    ? await fetchByIds(POLIZAS_TABLE, policyIds, POLIZA_FIELDS)
    : [];

  const prodIds = Array.from(
    new Set(polRecs.flatMap((r) => linkIds(r.fields["PRODUCTO LINK"])))
  );
  const compIds = Array.from(
    new Set(polRecs.flatMap((r) => linkIds(r.fields["COMPANIA LINK"])))
  );
  const [productos, companias] = await Promise.all([
    resolveProductos(prodIds),
    resolveCompanias(compIds),
  ]);

  const policies: FichaPolicy[] = polRecs
    .map((r) => {
      const pf = r.fields;
      const estado = Array.isArray(pf["ESTADO DE LA POLIZA"])
        ? (pf["ESTADO DE LA POLIZA"] as string[])
        : [];
      const prodId = firstLink(pf["PRODUCTO LINK"]);
      const compId = firstLink(pf["COMPANIA LINK"]);
      const prodInfo = prodId ? productos.get(prodId) : undefined;
      return {
        id: r.id,
        numero: str(pf["N° DE POLIZA"]),
        productoNombre: prodInfo?.nombre ?? null,
        productoIcono: prodInfo?.icono ?? null,
        companiaNombre: compId ? companias.get(compId) ?? null : null,
        estado,
        vigente: esVigente(estado),
        premium: num(pf["IMPORTE"]),
        inicio: dayText(pf["FECHA DE INICIO DE LA POLIZA"]),
        vencimiento: dayText(pf["FECHA VENCIMIENTO DE LA POLIZA"]),
        anulacion: dayText(pf["FECHA DE ANULACION"]),
        oficina: str(pf["OFICINA"]),
      } satisfies FichaPolicy;
    })
    .sort((a, b) => (b.inicio ?? "").localeCompare(a.inicio ?? ""));

  const vigentes = policies.filter((p) => p.vigente);
  const premiumActiva = vigentes.reduce((acc, p) => acc + (p.premium ?? 0), 0);

  /** Prima por producto (solo vigentes). */
  const byProduct = new Map<string, FichaProductSlice>();
  for (const p of vigentes) {
    const pid = p.productoNombre ?? "—";
    const slice =
      byProduct.get(pid) ??
      ({
        productId: null,
        nombre: p.productoNombre ?? "Otros",
        icono: p.productoIcono,
        prima: 0,
        polizas: 0,
      } satisfies FichaProductSlice);
    slice.prima += p.premium ?? 0;
    slice.polizas += 1;
    byProduct.set(pid, slice);
  }
  const premiumByProduct = Array.from(byProduct.values()).sort(
    (a, b) => b.prima - a.prima
  );

  /** Vencimientos por mes (próximos 12 meses, vigentes con fecha). */
  const expMap = new Map<string, FichaMonthPoint>();
  for (const m of nextMonths(12)) expMap.set(m, { month: m, count: 0, amount: 0 });
  for (const p of vigentes) {
    const mk = monthKey(p.vencimiento);
    const point = mk ? expMap.get(mk) : null;
    if (point) {
      point.count += 1;
      point.amount += p.premium ?? 0;
    }
  }
  const expirationsByMonth = Array.from(expMap.values());

  /* --- Gestiones (últimas del link; recortamos a las más recientes) --- */
  const gestionIds = linkIds(f["GESTIÓN GENERAL"]);
  const recentGestionIds = gestionIds.slice(-240);
  const gestionesRecs = recentGestionIds.length
    ? await fetchByIds(GESTIONES_TABLE, recentGestionIds, GESTION_FIELDS)
    : [];

  const gestiones: FichaGestion[] = gestionesRecs
    .map((r) => {
      const gf = r.fields;
      const polizaRaw =
        gf["N°  POLIZA GESTIONADA"] !== undefined
          ? gf["N°  POLIZA GESTIONADA"]
          : gf["N° DE POLIZA"];
      return {
        id: r.id,
        idUnico: str(gf["ID_UNICO_GESTION"]),
        fecha: str(gf["FECHA DE CREACION"]),
        motivo: str(gf["MOTIVOS DE LA CONSULTA"]),
        tipoSolicitud: str(gf["TIPO DE SOLICITUD"]),
        estado: str(gf["ESTADO DE LA SOLICITUD"]),
        atencion: str(gf["TIPO DE ATENCIÓN"]),
        importe: num(gf["IMPORTE"]),
        poliza: Array.isArray(polizaRaw)
          ? str((polizaRaw as unknown[])[0])
          : str(polizaRaw),
      } satisfies FichaGestion;
    })
    .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));

  /** Gestiones por mes (últimos 12 meses) con su tipo. */
  const gMonths = lastMonths(12);
  const gMap = new Map<string, FichaGestionesMonthPoint>();
  for (const m of gMonths) {
    gMap.set(m, {
      month: m,
      altas: 0,
      cotizaciones: 0,
      anulaciones: 0,
      siniestros: 0,
      otros: 0,
      total: 0,
    });
  }
  let gestionesTotal12m = 0;
  for (const g of gestiones) {
    const mk = monthKey(g.fecha);
    const point = mk ? gMap.get(mk) : null;
    if (!point) continue;
    const motivo = (g.motivo ?? "").toUpperCase();
    const solicitud = (g.tipoSolicitud ?? "").toUpperCase();
    if (motivo.includes("ALTA") || solicitud.includes("ALTA")) point.altas += 1;
    else if (motivo.includes("ANULA")) point.anulaciones += 1;
    else if (motivo.includes("SINIESTRO") || solicitud.includes("DENUNCIA"))
      point.siniestros += 1;
    else if (motivo.includes("COTIZ") || solicitud.includes("COTIZ"))
      point.cotizaciones += 1;
    else point.otros += 1;
    point.total += 1;
    gestionesTotal12m += 1;
  }
  const gestionesByMonth = Array.from(gMap.values());

  /* --- Costado CRM: WhatsApp + propuestas --- */
  const { whatsapp, proposals } = await crmSide({
    organizationId: input.organizationId,
    recordId: input.recordId,
    telefono: telDigits ?? null,
  });

  const data: ClientFichaDto = {
    recordId: cliente.id,
    nombre: str(f["NOMBRES"]) ?? "",
    apellido: str(f["APELLIDO"]) ?? "",
    nombreCompleto: `${str(f["NOMBRES"]) ?? ""} ${str(f["APELLIDO"]) ?? ""}`.trim(),
    dni: str(f["DNI"]),
    telefono: telDigits || null,
    email: str(f["EMAIL"]),
    estado: str(f["🏷️ ESTADO_CLIENTE"]),
    oficina: null,
    fotoUrl: f["FOTO PERFIL"] ? `/api/avatars/cli:${cliente.id}` : null,
    perfilRiesgo: (() => {
      const p = str(f["PERFIL_DE_RIESGO_IA"]);
      return p ? p.slice(0, 2000) : null;
    })(),
    fechaAlta: dayText(f["FECHA DE ALTA"]),
    fechaBaja: dayText(f["FECHA DE BAJA"]),
    idUnico: str(f["ID_UNICO_CLIENTE"]),
    polizas: {
      total: num(f["✅ CANTIDAD_POLIZAS"]) ?? policies.length,
      activas: num(f["🟢 POLIZAS_ACTIVAS"]) ?? vigentes.length,
      anuladas: num(f["🔴 POLIZAS_ANULADAS"]) ?? 0,
      enTramite: num(f["🟡 POLIZAS_EN_TRAMITES"]) ?? 0,
      sinVigencia: num(f["🟣 POLIZAS_SIN_VIGENCIA"]) ?? 0,
      vence7: num(f["📆 LA_POLIZAS VENCE EN 7 DIAS"]) ?? 0,
      vence30: num(f["📆 LA_POLIZAS VENCE EN 30 DIAS"]) ?? 0,
    },
    premiumActiva: Math.round(premiumActiva * 100) / 100,
    policies,
    premiumByProduct,
    expirationsByMonth,
    gestionesByMonth,
    gestiones: gestiones.slice(0, 60),
    gestionesTotal12m,
    whatsapp,
    proposals,
    generatedAt: new Date().toISOString(),
  };

  fichaCache.set(key, { expires: Date.now() + FICHA_TTL_MS, data });
  return data;
}

/**
 * Lado CRM de la ficha: contacto vinculado (por `sgsa:<recordId>` o
 * teléfono), actividad de WhatsApp de los últimos 30 días y propuestas.
 */
async function crmSide(input: {
  organizationId: string;
  recordId: string;
  telefono: string | null;
}): Promise<{ whatsapp: FichaWhatsapp | null; proposals: ProposalDto[] }> {
  const db = getDb();

  let contactId: string | null = null;
  const byRef = await db
    .select({ id: schema.contact.id })
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        input.organizationId,
        eq(schema.contact.externalRef, `sgsa:${input.recordId}`)
      )
    )
    .limit(1);
  contactId = byRef[0]?.id ?? null;

  if (!contactId && input.telefono && input.telefono.length >= 8) {
    const matches = await matchContactsByPhoneKeys(input.organizationId, [
      phoneKey(input.telefono),
    ]);
    const match = matches.get(phoneKey(input.telefono));
    if (match) contactId = match.contactId;
  }

  let whatsapp: FichaWhatsapp | null = null;
  if (contactId) {
    const contact = await db
      .select({ id: schema.contact.id, name: schema.contact.name })
      .from(schema.contact)
      .where(
        scoped(
          schema.contact.organizationId,
          input.organizationId,
          eq(schema.contact.id, contactId)
        )
      )
      .limit(1);
    const convs = await db
      .select({
        id: schema.conversation.id,
        lastMessageAt: schema.conversation.lastMessageAt,
        lastInboundAt: schema.conversation.lastInboundAt,
        assigneeId: schema.conversation.assigneeId,
      })
      .from(schema.conversation)
      .where(
        scoped(
          schema.conversation.organizationId,
          input.organizationId,
          eq(schema.conversation.contactId, contactId),
          eq(schema.conversation.isTest, false)
        )
      )
      .orderBy(desc(schema.conversation.lastMessageAt))
      .limit(5);

    const conv = convs[0] ?? null;
    let assigneeName: string | null = null;
    if (conv?.assigneeId) {
      const u = await db
        .select({ name: schema.user.name })
        .from(schema.user)
        .where(eq(schema.user.id, conv.assigneeId))
        .limit(1);
      assigneeName = u[0]?.name ?? null;
    }

    const messages30 = { inbound: 0, outbound: 0 };
    const lastInboundAt: string | null = conv?.lastInboundAt?.toISOString() ?? null;
    const lastMessageAt: string | null = conv?.lastMessageAt?.toISOString() ?? null;
    const convIds = convs.map((c) => c.id);
    if (convIds.length) {
      const since = new Date(Date.now() - 30 * 24 * 3600_000);
      const rows = await db
        .select({
          direction: schema.message.direction,
          total: count(),
        })
        .from(schema.message)
        .where(
          scoped(
            schema.message.organizationId,
            input.organizationId,
            inArray(schema.message.conversationId, convIds),
            gte(schema.message.createdAt, since)
          )
        )
        .groupBy(schema.message.direction);
      for (const r of rows) {
        if (r.direction === "in") messages30.inbound = Number(r.total);
        if (r.direction === "out") messages30.outbound = Number(r.total);
      }
    }

    if (contact[0]) {
      whatsapp = {
        contactId: contact[0].id,
        contactName: contact[0].name,
        conversationId: conv?.id ?? null,
        messages30,
        lastInboundAt,
        lastMessageAt,
        assigneeName,
      };
    }
  }

  /* Propuestas del cliente (por recordId del sistema). */
  const propRows = await db
    .select({
      p: schema.proposal,
      assigneeName: schema.user.name,
    })
    .from(schema.proposal)
    .leftJoin(schema.user, eq(schema.proposal.assigneeUserId, schema.user.id))
    .where(
      scoped(
        schema.proposal.organizationId,
        input.organizationId,
        eq(schema.proposal.clientRef, input.recordId)
      )
    )
    .orderBy(desc(schema.proposal.createdAt))
    .limit(25);

  const proposals: ProposalDto[] = propRows.map(({ p, assigneeName }) => {
    // Respondida = hubo mensaje entrante después de enviarla.
    const respondedAt =
      p.sentAt && whatsapp?.lastInboundAt &&
      new Date(whatsapp.lastInboundAt).getTime() > p.sentAt.getTime()
        ? whatsapp.lastInboundAt
        : null;
    return proposalToDto(p, {
      assigneeName,
      createdByName: null,
      respondedAt,
    });
  });

  return { whatsapp, proposals };
}

/** Mapea una fila `proposal` a su DTO público (compartido con /api/proposals). */
export function proposalToDto(
  p: typeof schema.proposal.$inferSelect,
  extra: {
    assigneeName?: string | null;
    createdByName?: string | null;
    respondedAt?: string | null;
  } = {}
): ProposalDto {
  return {
    id: p.id,
    token: p.token,
    publicUrl: `/p/${p.token}`,
    kind: p.kind,
    status: p.status,
    priority: p.priority,
    title: p.title,
    subtitle: p.subtitle,
    body: p.body,
    productName: p.productName,
    offer: p.offer,
    benefit: p.benefit,
    companyName: p.companyName,
    hasCompanyLogo: Boolean(p.companyAssetId),
    hasLogo: Boolean(p.logoAssetId),
    hasImage: Boolean(p.assetId),
    ctaLabel: p.ctaLabel,
    ctaUrl: p.ctaUrl,
    ctaKind: p.ctaKind,
    clientRef: p.clientRef,
    clientName: p.clientName,
    clientDni: p.clientDni,
    clientPhone: p.clientPhone,
    assigneeUserId: p.assigneeUserId,
    assigneeGroupId: p.assigneeGroupId ?? null,
    assigneeKind: p.assigneeGroupId
      ? "group"
      : p.assigneeUserId
        ? "employee"
        : null,
    assigneeName: extra.assigneeName ?? null,
    createdByName: extra.createdByName ?? null,
    imageUrl: p.assetId ? `/api/public/propuesta/img/${p.assetId}` : null,
    contactId: p.contactId,
    conversationId: p.conversationId,
    statusLabel:
      p.status === "borrador"
        ? "Borrador"
        : p.status === "derivada"
          ? "Derivada — aviso enviado"
          : "Enviada al cliente",
    views: p.views,
    firstViewAt: p.firstViewAt?.toISOString() ?? null,
    lastViewAt: p.lastViewAt?.toISOString() ?? null,
    sentAt: p.sentAt?.toISOString() ?? null,
    derivedAt: p.derivedAt?.toISOString() ?? null,
    respondedAt: extra.respondedAt ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

/** Invalida la caché de una ficha (tras derivar/enviar una propuesta). */
export function invalidateFicha(organizationId: string, recordId: string): void {
  fichaCache.delete(`${organizationId}:${recordId}`);
}

/** Solo para tests. */
export function clearFichaCaches(): void {
  fichaCache.clear();
  productoCache.clear();
  companiaCache.clear();
}
