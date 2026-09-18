/*
 * 041c — Catálogo de tonos y conceptos de venta (compartido UI/servidor).
 *
 * Pedido de Diego: la publicidad se puede escribir con distintos tonos
 * (cercana y natural ↔ formal) y con conceptos que sirven para la venta.
 * Este archivo es client-safe (solo datos); el prompt vive en el servidor.
 */

/** Marca para el proveedor determinista del self-test (ai-mock). */
export const COPY_MARKER = "MARCA-PUBLICIDAD-041C";

export const TONE_IDS = ["cercana", "formal", "directa", "entusiasta"] as const;
export type ProposalToneId = (typeof TONE_IDS)[number];

export const TONES: Record<
  ProposalToneId,
  { label: string; hint: string; rule: string }
> = {
  cercana: {
    label: "Cercana y natural",
    hint: "Como una charla: cálida, simple, de vos.",
    rule: 'TONO CERCANO Y NATURAL: escribí de vos, como en una charla de mostrador; cálido y simple; cero palabras de marketing vacías; jamás "estimado cliente" ni "usted".',
  },
  formal: {
    label: "Formal",
    hint: "Sobria e institucional: de usted.",
    rule: "TONO FORMAL: tratá de usted; redacción sobria, ordenada e institucional; sin chistes, sin emojis, máxima claridad y respeto.",
  },
  directa: {
    label: "Directa",
    hint: "Frases cortas: el dato primero.",
    rule: "TONO DIRECTO: frases cortas y concretas; el beneficio o el dato en la primera línea; sin rodeos, sin relleno.",
  },
  entusiasta: {
    label: "Entusiasta",
    hint: "Energía: la oportunidad es ahora.",
    rule: "TONO ENTUSIASTA: con energía y optimismo; transmití que es una buena oportunidad y que conviene aprovecharla ya; sin exagerar ni prometer de más.",
  },
};

export const ANGLE_IDS = [
  "beneficio",
  "ahorro",
  "proteccion",
  "urgencia",
  "familia",
  "confianza",
] as const;
export type ProposalAngleId = (typeof ANGLE_IDS)[number];

export const ANGLES: Record<
  ProposalAngleId,
  { label: string; hint: string; rule: string }
> = {
  beneficio: {
    label: "Beneficio primero",
    hint: "Qué gana el cliente, en la primera línea.",
    rule: "CONCEPTO — BENEFICIO PRIMERO: abrí con lo que el cliente GANA (tiempo, plata, tranquilidad), no con el nombre del producto; una idea por párrafo.",
  },
  ahorro: {
    label: "Ahorro",
    hint: "Plata que se cuida: precio, cuotas, descuentos.",
    rule: "CONCEPTO — AHORRO: mostrá el valor concreto de la plata (precio, cuota, descuento) SOLO si viene en los datos; si no viene, invitá a consultar la mejor condición sin inventar cifras.",
  },
  proteccion: {
    label: "Protección",
    hint: "Tranquilidad: qué cubre y ante qué responde.",
    rule: "CONCEPTO — PROTECCIÓN: explicá con palabras simples qué queda cubierto y ante qué responde; no prometas coberturas que no estén en los datos.",
  },
  urgencia: {
    label: "Urgencia",
    hint: "Vencimiento o cupo: mejor hoy que mañana.",
    rule: "CONCEPTO — URGENCIA: si hay vencimiento, cupo o fecha límite en los datos, usalo; si no hay, una motivación honesta para resolverlo ahora (sin falsas escaseces).",
  },
  familia: {
    label: "Familia",
    hint: "Proteger a los suyos, dejar todo en orden.",
    rule: "CONCEPTO — FAMILIA: hablá de proteger a los que dependen de él/ella y de dejar todo en orden; tono humano, sin dramatizar.",
  },
  confianza: {
    label: "Confianza",
    hint: "Trayectoria, compañía y respaldo.",
    rule: "CONCEPTO — CONFIANZA: apoyate en datos de respaldo disponibles (compañía, años de la agencia, cantidad de asegurados); si no están en los datos, no los inventes.",
  },
};

export function isToneId(value: unknown): value is ProposalToneId {
  return TONE_IDS.includes(value as ProposalToneId);
}

export function isAngleId(value: unknown): value is ProposalAngleId {
  return ANGLE_IDS.includes(value as ProposalAngleId);
}
