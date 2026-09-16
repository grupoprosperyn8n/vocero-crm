import { customAlphabet } from "nanoid";

const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nano = customAlphabet(alphabet, 20);

const prefixes = {
  organization: "org",
  member: "mem",
  contact: "ct",
  conversation: "cv",
  message: "msg",
  lead: "ld",
  stage: "stg",
  leadStageEvent: "lse",
  credentials: "cred",
  agentProfile: "agp",
  kbEntry: "kb",
  template: "tpl",
  testRun: "run",
  testCase: "case",
  mediaAsset: "ma",
  // 015 — motor de agenda
  calendarSettings: "cal",
  booking: "bk",
  offeredSlot: "ofs",
  zoomCredentials: "zcred",
  googleCredentials: "gcred",
  // 016 — atribución de anuncios
  adAttribution: "att",
  conversionEvent: "cve",
  // 1F — conectores salientes (webhooks de cierre hacia el backend)
  outboundWebhook: "owh",
  capiSettings: "capi",
  // 019 — instalador de IA
  aiSettings: "ais",
  // Equipo (sync LOGIN v2) — ficha del empleado + oficinas
  staffProfile: "stf",
  office: "off",
  // 022 — chat interno del equipo
  chatRoom: "chtr",
  chatRoomMember: "chmb",
  chatMessage: "chms",
  // 023 — sucursal del día
  staffOfficeDay: "ofd",
  // 026 — bandeja por usuario
  conversationArchive: "carch",
  // 034 — pin personal (chat interno + bandeja del CRM)
  conversationPin: "cpin",
  // 028 — reglas/derivación de alertas
  alertAssignmentRule: "alrule",
  alertAssignment: "alassn",
  // 033 — revisión de envío SGSA (tarjetas de aprobación en el chat interno)
  reviewRequest: "rvrq",
  /** Usuario de sistema que firma las tarjetas de revisión (no es una persona). */
  systemUser: "sysu",
} as const;

export type IdKind = keyof typeof prefixes;

export function newId(kind: IdKind): string {
  return `${prefixes[kind]}_${nano()}`;
}
