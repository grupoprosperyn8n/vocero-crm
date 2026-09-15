/** DTOs que viajan por la API interna (lado cliente). */

import type { Channel } from "@/lib/channels";

export type ConversationDto = {
  id: string;
  /** 014: canal de la conversacion, para el distintivo de la bandeja. */
  channel: Channel;
  contact: { id: string; name: string; phone: string | null };
  stageName: string | null;
  aiEnabled: boolean;
  handoffAt: string | null;
  handoffReason: string | null;
  /** 1B: etiqueta de negocio (catálogo lib/topics.ts; null = sin clasificar). */
  topic: string | null;
  /** 1D: empleado a cargo (router por presencia); null = sin asignar. */
  assignee: { id: string; name: string } | null;
  assignedAt: string | null;
  /** 1F: cerrada = salió de la cola; el SSE la descarta del estado local. */
  closedAt: string | null;
  /** 2A: resumen curado al cerrar (vista Cerradas: qué se gestionó). */
  closureSummary: string | null;
  /** 2A: operador que cerró la conversación. */
  closedByName: string | null;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  windowOpen: boolean;
  windowRemainingMs: number;
  preview: string | null;
};

/** 008 — Adjunto de un mensaje, para previsualización en el hilo. */
export type MessageMediaDto = {
  assetId: string;
  kind:
    | "image"
    | "video"
    | "audio"
    | "document"
    | "sticker"
    | "location"
    | "contacts";
  mimeType: string | null;
  fileName: string | null;
  fileSize: number | null;
  caption: string | null;
  fetchStatus: "available" | "pending" | "failed";
  /** location {latitude, longitude, name?, address?} / contacts (subset). */
  payload: unknown;
};

export type MessageDto = {
  id: string;
  conversationId: string;
  direction: "in" | "out";
  type: string;
  text: string | null;
  status: "pending" | "sent" | "delivered" | "read" | "failed";
  /** Motivo del fallo en lenguaje llano cuando status = "failed". */
  error: string | null;
  aiGenerated: boolean;
  /** 008 — Origen del saliente (en entrantes viene 'operator' y se ignora). */
  origin: "ai" | "operator" | "manual" | "template";
  media: MessageMediaDto | null;
  createdAt: string;
};

export type TemplateDto = {
  id: string;
  name: string;
  language: string;
  category: string;
  body: string;
  status: "draft" | "pending" | "approved" | "rejected";
  rejectionReason: string | null;
};

export type StageDto = {
  id: string;
  name: string;
  position: number;
  kind: "open" | "won" | "lost";
  /** 029 — tablero al que pertenece la etapa. */
  board: PipelineBoard;
};

/* ============================================================
 * 029 — Pipeline personal de dos tableros (ventas / gestiones)
 * ============================================================ */

/** Un tablero del pipeline: el comercial o el de gestiones. */
export type PipelineBoard = "ventas" | "gestiones";

/** De dónde salió una tarjeta del pipeline. */
export type PipelineSourceKind = "contact" | "sgsa_client" | "alert" | "sgsa_gestion";

/** 030 — una gestión del sistema (GESTIÓN GENERAL) para el buscador del pipeline. */
export type SgsaGestionDto = {
  recordId: string;
  idUnico: string | null;
  numero: number | null;
  clienteRecordId: string | null;
  clienteNombre: string | null;
  dni: string | null;
  telefono: string | null;
  motivo: string | null;
  tipoAtencion: string | null;
  prioridad: string | null;
  fecha: string | null;
  poliza: string | null;
  patente: string | null;
  marcaModelo: string | null;
  esCliente: boolean | null;
  /** Link a la interface del sistema (registro + cliente en uno). */
  registroUrl: string;
};

/**
 * Una tarjeta del tablero. Cada usuario tiene las SUYAS: `ownerUserId` es el
 * dueño, y solo él la mueve. Los roles de gestión (no «member») pueden ver las
 * de todos y filtrar por empleado, igual que la bandeja.
 */
export type PipelineCardDto = {
  id: string;
  board: PipelineBoard;
  stageId: string;
  position: number;
  ownerUserId: string | null;
  ownerName: string | null;
  sourceKind: PipelineSourceKind;
  /** Referencia externa: cliente del sistema (rec…) o alerta (rec…). */
  sgsaRef: string | null;
  /** Rótulo para tarjetas sin contacto (cliente del sistema / alerta). */
  label: string | null;
  /** Foto mínima de la fuente (tipo/urgencia/cliente de una alerta). */
  meta: Record<string, unknown> | null;
  lastActivityAt: string | null;
  amountCents: number | null;
  currency: string | null;
  priority: PriorityValue | null;
  /** Contacto del CRM; NULL si la tarjeta es un cliente del sistema o alerta. */
  contact: { id: string; name: string; phone: string | null } | null;
  conversationId: string | null;
};

/** Un dato de la ficha. Escalar a propósito: ver `server/bot/ficha`. */
export type FichaValue = string | number | boolean;

/**
 * Ficha de calificación del lead. Claves libres: cada negocio califica
 * distinto, así que las define quien pregunta —el agente o el dueño— y el CRM
 * no las cablea.
 */
export type FichaDto = Record<string, FichaValue>;

export type ContactDto = {
  id: string;
  name: string;
  /** null en contactos que llegaron solo con BSUID (003). */
  phone: string | null;
  notes: string | null;
  /** Etapa del embudo del lead asociado; null si el contacto no tiene lead. */
  stageName: string | null;
  archivedAt: string | null;
  /** De dónde salió el prospecto, capturada o deducida. */
  source?: SourceDto;
  /** Prioridad del lead asociado; null si nadie la fijó. */
  priority?: PriorityValue | null;
  /** Lo que se sabe del lead. `{}` mientras nadie haya calificado. */
  ficha?: FichaDto;
  /** Canal por el que vive el contacto (014). */
  channel?: string;
  /** 0023: dato de prueba/demo marcado para limpieza posterior. */
  isTest?: boolean;
  /** Alta del contacto en el CRM (ISO). */
  createdAt?: string;
};

/* ============================================================
 * Clientes del sistema de gestión (SGSA / seguros) — matching backend↔CRM
 * ============================================================ */

export type SystemClientPolizasDto = {
  total: number | null;
  activas: number | null;
  anuladas: number | null;
  enTramite: number | null;
  vence7: number | null;
  vence30: number | null;
};

/** Cliente leído del sistema de gestión (Airtable) — solo lectura. */
export type SystemClientDto = {
  recordId: string;
  nombre: string;
  apellido: string;
  /** «NOMBRE NORMALIZADO» de la base: el nombre canónico del sistema (ej. «TEST IA»). */
  nombreNormalizado: string | null;
  dni: string | null;
  /** Dígitos del teléfono, como los guarda el sistema. */
  telefono: string | null;
  telefonoRaw: string | null;
  email: string | null;
  estado: string | null;
  oficina: string | null;
  idUnico: string | null;
  fechaAlta: string | null;
  perfilRiesgo: string | null;
  polizas: SystemClientPolizasDto;
};

export type ClientConversationDto = {
  id: string;
  channel: string;
  closed: boolean;
  isTest: boolean;
  lastMessageAt: string | null;
};

/** Cómo está este cliente del sistema dentro del CRM (si ya existe). */
export type ClientCrmMatchDto = {
  contactId: string;
  name: string;
  phone: string | null;
  channel: string;
  isTest: boolean;
  archivedAt: string | null;
  conversations: ClientConversationDto[];
};

export type SystemClientSearchResultDto = {
  client: SystemClientDto;
  crm: ClientCrmMatchDto | null;
};

/* ============================================================
 * 027 — Alertas del sistema de seguros (backend SGSA)
 * ============================================================ */

/**
 * Alerta operativa normalizada desde el backend de seguros. El estado del
 * ciclo de vida (leída / en progreso / concluida…) vive en el sistema de
 * origen: acá solo viaja la foto para mostrarla y accionar.
 */
export type SgsaAlertDto = {
  /** Id del store del backend (string numérico) — el que usan ack/status. */
  id: string;
  /** Record de la tabla ALERTAS (Airtable), si ya está persistida. */
  airtableRecordId: string | null;
  tipo: string;
  prioridad: string;
  urgencia: 0 | 1 | 2 | 3;
  urgenciaLabel: string;
  titulo: string;
  cuerpo: string;
  detalle: string;
  linkRegistro: string | null;
  estado: string;
  leida: boolean;
  fecha: string | null;
  fechaVisto: string | null;
  clienteNombre: string | null;
  empleadoLeido: string | null;
  /** Empleados (airtable ids) con los que se compartió la alerta. */
  compartidaCon: string[];
  /** Grupos del chat interno con los que se compartió (log de texto). */
  compartidaGrupos: string | null;
  /** 028b — record del cliente (CLIENTES) para «Abrir cliente» en la interface. */
  clienteRecordId?: string | null;
  /** 028 — responsables derivados desde el CRM (usuario o grupo local). */
  asignaciones?: {
    targetKind: "employee" | "group";
    targetId: string;
    targetName: string;
    /** assumed (030): el empleado la tomó sin derivación previa. */
    source: "manual" | "rule" | "assumed";
    status: string;
  }[];
  /** true cuando la alerta está asignada directa o por grupo al usuario actual. */
  asignadaParaMi?: boolean;
};

/* ============================================================
 * Bitácora de etapas
 * ============================================================ */

/** Por qué se perdió un trato. Lista corta a propósito: una taxonomía larga
 *  se responde "otro" y deja de informar. */
export type LossReason =
  | "precio"
  | "no_es_perfil"
  | "sin_presupuesto"
  | "eligio_otro"
  | "nunca_contesto"
  | "otro";

export const LOSS_REASON_LABEL: Record<LossReason, string> = {
  precio: "Le pareció caro",
  no_es_perfil: "No era el perfil",
  sin_presupuesto: "Sin presupuesto ahora",
  eligio_otro: "Se fue con otro",
  nunca_contesto: "Nunca contestó",
  otro: "Otro",
};

/** Quién provocó un movimiento de etapa. */
export type StageChangeSource = "dueno" | "bot" | "sistema" | "migracion";

/* ============================================================
 * Fuente del prospecto
 * ============================================================ */

export type SourceValue =
  | "anuncio"
  | "organico"
  | "referido"
  | "conocido"
  | "otro";

export type SourceDto = {
  /** "desconocida" cuando nadie la capturó y no se pudo deducir. */
  value: SourceValue | "desconocida";
  /** `deducida` = la infirió el sistema; `capturada` = la puso el dueño. */
  source: "capturada" | "deducida";
};

/* ============================================================
 * Prioridad del lead
 * ============================================================ */

/** La fija el dueño; NULL = nadie la ha decidido (no es "media"). */
export type PriorityValue = "alta" | "media" | "baja";

/* ============================================================
 * Chat interno — contacto compartido (025)
 * ============================================================ */

/** Snapshot de un contacto (del CRM o del sistema) compartido en el chat interno. */
export type ChatContactShareDto = {
  source: "crm" | "system";
  name: string;
  phone: string | null;
  /** CRM: id del contacto y canal por el que vive (whatsapp/telegram/web). */
  contactId?: string | null;
  channel?: string | null;
  /** Sistema: record id de Airtable + pólizas totales (contexto). */
  recordId?: string | null;
  policies?: number | null;
};

/** Snapshot seguro de una alerta SGSA compartida en el chat interno. */
export type ChatAlertShareDto = {
  id: string;
  /** Airtable ALERTAS record id, when the alert is already persisted. */
  airtableRecordId?: string | null;
  /** English + source-language aliases are kept so cards and future APIs stay stable. */
  title: string;
  titulo: string;
  body: string;
  cuerpo: string;
  type: string;
  tipo: string;
  urgencyLabel: string;
  urgenciaLabel: string;
  /** Optional safe context fields. */
  recordUrl?: string | null;
  linkRegistro?: string | null;
  /** 028b — record del cliente (CLIENTES) para «Abrir cliente» en la interface. */
  clienteRecordId?: string | null;
  estado?: string | null;
  fecha?: string | null;
};

export type ChatMessagePayloadDto = ChatContactShareDto | ChatAlertShareDto;
