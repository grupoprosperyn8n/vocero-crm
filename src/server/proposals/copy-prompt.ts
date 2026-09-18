/*
 * 041c — Piezas puras del asistente de redacción de la publicidad.
 *
 * Los catálogos (tonos y conceptos de venta) viven en `@/lib/proposals/copy`
 * para que la UI los use sin tocar código de servidor. Acá está el prompt,
 * el saneado del contexto y la normalización de la respuesta.
 *
 * Sin red ni base de datos (eso vive en `copy.ts`) → unit tests livianos.
 */

import { z } from "zod";

import {
  ANGLES,
  COPY_MARKER,
  isAngleId,
  isToneId,
  TONES,
  type ProposalAngleId,
  type ProposalToneId,
} from "@/lib/proposals/copy";

export { COPY_MARKER, TONE_IDS, TONES, ANGLE_IDS, ANGLES } from "@/lib/proposals/copy";
export { isToneId, isAngleId } from "@/lib/proposals/copy";
export type { ProposalToneId, ProposalAngleId } from "@/lib/proposals/copy";

/* --------------------------------------------------------------------- *
 * Contexto (llega del navegador: se acota campo por campo)
 * --------------------------------------------------------------------- */

export type CopyTarget = "pieza" | "mensaje";

export type CopyContext = {
  target: CopyTarget;
  tone: ProposalToneId;
  angle: ProposalAngleId | null;
  instructions: string;
  clientName: string;
  kind: string;
  /** 042e — guía del negocio para esta acción comercial (la resuelve el
   * servidor: plantilla del tipo o la sugerida de fábrica). */
  kindPrompt: string;
  productName: string;
  companyName: string;
  title: string;
  subtitle: string;
  body: string;
  offer: string;
  benefit: string;
  ctaLabel: string;
  draftMessage: string;
};

function clampText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Contexto cerrado y acotado. Requiere cliente y tipo; el resto es opcional. */
export function sanitizeCopyContext(raw: unknown): CopyContext | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const data = raw as Record<string, unknown>;

  const clientName = clampText(data.clientName, 120);
  const kind = clampText(data.kind, 60);

  if (!clientName || !kind) {
    return null;
  }

  const target: CopyTarget = data.target === "mensaje" ? "mensaje" : "pieza";
  const tone: ProposalToneId = isToneId(data.tone) ? data.tone : "cercana";
  const angle: ProposalAngleId | null = isAngleId(data.angle)
    ? data.angle
    : null;

  return {
    target,
    tone,
    angle,
    instructions: clampText(data.instructions, 400).slice(0, 400),
    clientName,
    kind,
    // 042e — la guía la resuelve el SERVIDOR (nunca se acepta del navegador).
    kindPrompt: "",
    productName: clampText(data.productName, 120),
    companyName: clampText(data.companyName, 120),
    title: clampText(data.title, 160),
    subtitle: clampText(data.subtitle, 200),
    body: String(data.body ?? "")
      .trim()
      .slice(0, 2000),
    offer: clampText(data.offer, 200),
    benefit: clampText(data.benefit, 160),
    ctaLabel: clampText(data.ctaLabel, 40),
    draftMessage: String(data.draftMessage ?? "")
      .trim()
      .slice(0, 900),
  };
}

/* --------------------------------------------------------------------- *
 * Prompt
 * --------------------------------------------------------------------- */

export function buildCopyPrompt(context: CopyContext): {
  system: string;
  user: string;
} {
  const tone = TONES[context.tone];
  const angle = context.angle ? ANGLES[context.angle] : null;

  const system = [
    COPY_MARKER,
    "Sos el redactor publicitario de una agencia de seguros argentina que trabaja con clientes reales.",
    "Escribís en español rioplatense, claro y natural, siempre con datos reales: JAMÁS inventes coberturas, precios, plazos ni estadísticas.",
    "Cómo se vende sin prometer de más: empezá por el beneficio; una idea por párrafo; frases breves; sin mayúsculas sostenidas ni exceso de signos; cerrá con UNA llamada a la acción simple (responder, tocar el botón, pedir info).",
    tone.rule,
    angle ? angle.rule : "Sin concepto forzado: elegí el ángulo más honesto según los datos.",
    ...(context.kindPrompt
      ? [
          "GUÍA DE ESTA ACCIÓN COMERCIAL (la definió el negocio: tomá ese rol de experto en marketing digital y asesor de seguros, y seguí la jugada al pie de la letra):",
          context.kindPrompt,
        ]
      : []),
    'Devolvé SOLO un JSON válido, sin texto extra, con esta forma: {"title": "...", "subtitle": "...", "body": "...", "offer": "...", "benefit": "...", "ctaLabel": "...", "message": "...", "notes": "..."}',
    context.target === "pieza"
      ? 'TAREA: es una PUBLICACIÓN (pieza) que el cliente verá en una página web con su foto. Completá "title" (máx. 60 caracteres), "subtitle" (máx. 90), "body" (2 o 3 párrafos cortos separados por un salto de línea doble, máx. 700 caracteres), "offer" (la condición concreta si está en los datos; si no, una invitación a consultar sin inventar cifras; máx. 120), "benefit" (el beneficio principal en una frase de hasta 70 caracteres), "ctaLabel" (2 a 4 palabras para el botón). "message": cadena vacía.'
      : 'TAREA: es un MENSAJE de WhatsApp para enviarle al cliente. Completá SOLO "message": máximo 60 palabras, saludalo por su nombre, sin firma, con un cierre que invite a responder (por ejemplo proponer una llamada corta); el resto de los campos van vacíos.',
    '"notes": 1 frase interna para el vendedor explicando el enfoque elegido.',
  ].join("\n");

  const payload = {
    target: context.target,
    tone: context.tone,
    angle: context.angle,
    instructions: context.instructions || null,
    clientName: context.clientName,
    kind: context.kind,
    productName: context.productName || null,
    companyName: context.companyName || null,
    title: context.title || null,
    subtitle: context.subtitle || null,
    body: context.body || null,
    offer: context.offer || null,
    benefit: context.benefit || null,
    ctaLabel: context.ctaLabel || null,
    draftMessage: context.draftMessage || null,
  };

  const user = [
    "DATOS:",
    JSON.stringify(payload),
    "",
    context.target === "pieza"
      ? "TAREA: reescribí la publicación con el tono y el concepto indicados, respetando los datos. Si ya hay un texto, mejoralo sin cambiar el sentido ni los datos."
      : "TAREA: reescribí el mensaje de WhatsApp con el tono y el concepto indicados; si ya hay un borrador, mejoralo sin cambiar el sentido.",
  ].join("\n");

  return { system, user };
}

/* --------------------------------------------------------------------- *
 * Respuesta (chatJson reintenta solo si no cumple) y normalización
 * --------------------------------------------------------------------- */

export const COPY_SCHEMA = z.object({
  title: z.coerce.string().optional(),
  subtitle: z.coerce.string().optional(),
  body: z.coerce.string().optional(),
  offer: z.coerce.string().optional(),
  benefit: z.coerce.string().optional(),
  ctaLabel: z.coerce.string().optional(),
  message: z.coerce.string().optional(),
  notes: z.coerce.string().optional(),
});

export type ProposalCopy = {
  title?: string;
  subtitle?: string;
  body?: string;
  offer?: string;
  benefit?: string;
  ctaLabel?: string;
  message?: string;
  notes?: string;
};

/**
 * Recorta y limpia la respuesta del modelo. Devuelve null si falta el campo
 * principal del objetivo (título + cuerpo en pieza; mensaje en mensaje).
 */
export function normalizeCopy(
  data: unknown,
  target: CopyTarget
): ProposalCopy | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const raw = data as Record<string, unknown>;

  const text = (key: string, max: number) => {
    const value = String(raw[key] ?? "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, max);

    return value || undefined;
  };

  const copy: ProposalCopy = {
    title: text("title", 90),
    subtitle: text("subtitle", 140),
    body: text("body", 1200),
    offer: text("offer", 200),
    benefit: text("benefit", 120),
    ctaLabel: text("ctaLabel", 40),
    message: text("message", 900),
    notes: text("notes", 240),
  };

  if (target === "mensaje") {
    if (!copy.message) {
      return null;
    }

    delete copy.title;
    delete copy.subtitle;
    delete copy.body;
    delete copy.offer;
    delete copy.benefit;
    delete copy.ctaLabel;

    return copy;
  }

  if (!copy.title || !copy.body) {
    return null;
  }

  delete copy.message;

  return copy;
}
