/*
 * 039 — Piezas puras de la IA del dashboard: sanitizado de contexto,
 * prompts y validación de la respuesta. Sin base de datos ni red acá:
 * eso vive en `ai.ts` (así los unit tests corren livianos).
 *
 * Los prompts son los mismos que usaba el cockpit (probados en producción);
 * la única diferencia es de dónde sale el proveedor: ahora es la conexión
 * de IA del CRM (Ajustes → IA) o la legacy por env (OPENROUTER_*).
 */

import { z } from "zod";

import type {
  ClientInsight,
  ClientInsightContext,
  ModuleAiId,
  ModuleInsight,
} from "@/lib/dashboard-management/types";

/* --------------------------------------------------------------------- *
 * Sanitizado (los datos llegan del navegador: contexto cerrado y acotado)
 * --------------------------------------------------------------------- */

/** Contexto del Cliente 360°: SOLO los campos conocidos y con topes. */
export function sanitizeClientContext(
  raw: unknown
): ClientInsightContext | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const data = raw as Record<string, unknown>;

  const name = String(data.name || "")
    .trim()
    .slice(0, 120);

  if (!name) {
    return null;
  }

  const num = (value: unknown) => {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  };

  const steps = Array.isArray(data.recommendationSteps)
    ? data.recommendationSteps
        .map((step) => String(step).trim().slice(0, 400))
        .filter(Boolean)
        .slice(0, 8)
    : [];

  return {
    name,
    activePolicies: num(data.activePolicies),
    historicalOperations: num(data.historicalOperations),
    historicalAltas: num(data.historicalAltas),
    historicalAnulaciones: num(data.historicalAnulaciones),
    historicalSiniestros: num(data.historicalSiniestros),
    activePremium: num(data.activePremium),
    score: num(data.score),
    recommendation: String(data.recommendation || "")
      .trim()
      .slice(0, 120),
    recommendationWhy: String(data.recommendationWhy || "")
      .trim()
      .slice(0, 800),
    recommendationSteps: steps,
  };
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const text = value.trim().slice(0, 300);

    return text || undefined;
  }

  if (Array.isArray(value)) {
    if (depth >= 2) {
      return undefined;
    }

    const items = value
      .slice(0, 12)
      .map((item) => sanitizeValue(item, depth + 1))
      .filter(
        (item) =>
          item !== undefined &&
          item !== "" &&
          !(Array.isArray(item) && item.length === 0)
      );

    return items.length > 0 ? items : undefined;
  }

  if (typeof value === "object") {
    if (depth >= 2) {
      return undefined;
    }

    const out: Record<string, unknown> = {};

    let count = 0;

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (count >= 40) {
        break;
      }

      const clean = sanitizeValue(item, depth + 1);

      if (
        clean !== undefined &&
        clean !== "" &&
        !(Array.isArray(clean) && clean.length === 0)
      ) {
        out[String(key).slice(0, 80)] = clean;
        count += 1;
      }
    }

    return Object.keys(out).length > 0 ? out : undefined;
  }

  return undefined;
}

/** Contexto de un módulo: números/strings/arrays acotados (tope 40 claves). */
export function sanitizeModuleContext(
  raw: unknown
): Record<string, unknown> | null {
  const clean = sanitizeValue(raw, 0);

  if (!clean || typeof clean !== "object" || Array.isArray(clean)) {
    return null;
  }

  return clean as Record<string, unknown>;
}

/* --------------------------------------------------------------------- *
 * Prompts
 * --------------------------------------------------------------------- */

export function buildClientPrompt(
  context: ClientInsightContext,
  mode: "dual" | "ia"
): { system: string; user: string } {
  const system = [
    "Sos el asistente comercial de Rafael Allende, broker de seguros en Argentina.",
    "Escribís en español rioplatense, claro y directo, tratando de vos.",
    "Te paso el contexto REAL de un cliente tomado del sistema de gestión, con las reglas del negocio ya calculadas.",
    "REGLAS ESTRICTAS: usá SOLO los datos del contexto; no inventes cifras, productos ni situaciones; no prometas coberturas que no estén listadas.",
    'Devolvé SOLO un JSON válido, sin texto extra, con esta forma exacta: {"accion": "...", "por_que": "...", "pasos": ["...", "...", "..."], "mensaje_whatsapp": "..."}',
    '"accion": la mejor acción comercial en 2 a 5 palabras.',
    '"por_que": 2 a 3 frases explicando por qué es la mejor acción para ESTE cliente.',
    '"pasos": 3 o 4 pasos concretos y accionables, en orden.',
    '"mensaje_whatsapp": mensaje breve (máximo 60 palabras), cordial, con la firma de Rafael Allende; usá 1 o 2 emojis pertinentes (ninguno si el motivo es delicado: anulación, reclamo o siniestro) y cerrá con una pregunta concreta que invite a responder (por ejemplo, proponer día y horario para una llamada corta).',
  ].join("\n");

  const base = [
    "CONTEXTO REAL DEL CLIENTE:",
    `Nombre: ${context.name}`,
    `Pólizas activas: ${context.activePolicies}`,
    `Prima activa: $${context.activePremium}`,
    `Gestiones históricas: ${context.historicalOperations} (altas: ${context.historicalAltas}, anulaciones: ${context.historicalAnulaciones}, siniestros: ${context.historicalSiniestros})`,
    `Score de prioridad del sistema (0-100): ${context.score}`,
    `Acción que marcó el sistema por reglas: ${context.recommendation}`,
    `Explicación del sistema: ${context.recommendationWhy}`,
    `Pasos que propone el sistema: ${context.recommendationSteps.join(" | ") || "—"}`,
  ].join("\n");

  const instruction =
    mode === "dual"
      ? "TAREA (modo DUAL): el sistema ya priorizó con reglas. Confirmá ese análisis y enriquecelo con tu criterio comercial usando el mismo contexto: mismos números y misma acción, mejor explicación y mejores pasos."
      : "TAREA (modo SOLO IA): analizá vos el contexto completo y decidí la mejor acción comercial. Podés confirmar la sugerencia del sistema o proponer otra si los datos lo justifican.";

  return {
    system,
    user: `${base}\n\n${instruction}`,
  };
}

export const MODULE_BRIEFS: Record<
  ModuleAiId,
  { title: string; brief: string; expectsMessage: boolean }
> = {
  pulso: {
    title: "Pulso del negocio",
    brief:
      "la foto general del negocio: altas, anulaciones, crecimiento neto, siniestros, cotizaciones y evolución mensual",
    expectsMessage: false,
  },
  cartera: {
    title: "Cartera",
    brief:
      "las pólizas cargadas y activas, la prima que representan y el reparto por producto, compañía y oficina",
    expectsMessage: false,
  },
  retencion: {
    title: "Retención",
    brief:
      "las renovaciones que se vienen (vencimientos en ≤7 y ≤30 días), los clientes a observar por anulaciones históricas y los siniestros",
    expectsMessage: true,
  },
  reactivacion: {
    title: "Reactivación",
    brief:
      "los clientes históricos que hoy no tienen póliza activa cargada y el universo potencial para recontactarlos",
    expectsMessage: true,
  },
  cross: {
    title: "Venta cruzada",
    brief:
      "los clientes con una sola póliza activa y las oportunidades de sumar productos (por ejemplo Auto → Auxilio/Hogar/Vida)",
    expectsMessage: true,
  },
  migracion: {
    title: "Calidad y avance de la migración",
    brief:
      "el avance de la migración de datos: cuánto quedó vinculado entre clientes y gestiones y qué campos faltan completar",
    expectsMessage: false,
  },
  crm: {
    title: "CRM · Venta y gestión",
    brief:
      "el pulso comercial del CRM: contactos, conversaciones, mensajes (incluida la IA del agente), leads, conversión, pipeline y el vínculo con la cartera",
    expectsMessage: false,
  },
};

function contextLines(context: Record<string, unknown>): string[] {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(context)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    const text = Array.isArray(value)
      ? value
          .filter((item) => item !== null && item !== undefined && item !== "")
          .slice(0, 12)
          .map((item) => String(item).slice(0, 220))
          .join(" · ")
      : String(value).slice(0, 400);

    if (!text) {
      continue;
    }

    lines.push(`- ${key}: ${text}`);

    if (lines.length >= 60) {
      break;
    }
  }

  return lines;
}

export function buildModulePrompt(
  module: ModuleAiId,
  context: Record<string, unknown>
): { system: string; user: string } {
  const brief = MODULE_BRIEFS[module];

  const system = [
    "Sos el analista de negocio de Rafael Allende, broker de seguros en Argentina.",
    "Escribís en español rioplatense, claro y directo, tratando de vos; te lee el dueño o gerente del negocio, no un técnico.",
    `Estás analizando el módulo "${brief.title}" del tablero de gestión, que muestra ${brief.brief}.`,
    "REGLAS ESTRICTAS: usá SOLO los datos del contexto; no inventes cifras, clientes ni situaciones; si un dato no está, no lo supongas.",
    'Devolvé SOLO un JSON válido, sin texto extra, con esta forma exacta: {"resumen": "...", "focos": ["...", "..."], "acciones": ["...", "..."], "mensaje": "..."}',
    '"resumen": 2 o 3 frases con lo más importante que dicen los datos (incluí los números clave).',
    '"focos": 3 o 4 puntos cortos de qué mirar y por qué, mirando los números del módulo.',
    '"acciones": 3 a 5 acciones concretas y priorizadas para esta semana.',
    brief.expectsMessage
      ? '"mensaje": un mensaje breve de WhatsApp (máximo 60 palabras, cordial, con la firma de Rafael Allende, con 1 o 2 emojis pertinentes y un cierre con una pregunta concreta que invite a responder) listo para enviar a un cliente tipo de este módulo.'
      : '"mensaje": cadena vacía, este módulo no requiere mensaje al cliente.',
  ].join("\n");

  const user = [
    "DATOS REALES DEL MÓDULO:",
    ...contextLines(context),
    "",
    "TAREA: leé estos números como analista de negocio del dueño y devolvé el JSON pedido.",
  ].join("\n");

  return { system, user };
}

/* --------------------------------------------------------------------- *
 * Esquemas de respuesta (chatJson reintenta solo si no cumplen)
 * --------------------------------------------------------------------- */

const listItem = z.union([z.string(), z.number()]);

export const CLIENT_INSIGHT_SCHEMA = z
  .object({
    accion: z.coerce.string().min(1),
    por_que: z.coerce.string().optional(),
    porQue: z.coerce.string().optional(),
    pasos: z.array(listItem).min(1),
    mensaje_whatsapp: z.coerce.string().optional(),
    mensajeWhatsapp: z.coerce.string().optional(),
  })
  .refine(
    (value) =>
      Boolean(String(value.por_que ?? value.porQue ?? "").trim()),
    { message: "falta por_que" }
  )
  .refine(
    (value) =>
      Boolean(
        String(value.mensaje_whatsapp ?? value.mensajeWhatsapp ?? "").trim()
      ),
    { message: "falta mensaje_whatsapp" }
  );

export type ClientInsightRaw = z.infer<typeof CLIENT_INSIGHT_SCHEMA>;

export const MODULE_INSIGHT_SCHEMA = z.object({
  resumen: z.coerce.string().min(1),
  focos: z.array(listItem).optional(),
  acciones: z.array(listItem).min(1),
  mensaje: z.coerce.string().optional(),
});

export type ModuleInsightRaw = z.infer<typeof MODULE_INSIGHT_SCHEMA>;

/* --------------------------------------------------------------------- *
 * Respuesta validada → insight del contrato del tablero
 * --------------------------------------------------------------------- */

export function toClientInsight(
  raw: ClientInsightRaw,
  model: string
): ClientInsight {
  const accion = raw.accion.trim().slice(0, 90);

  const porQue = String(raw.por_que ?? raw.porQue ?? "")
    .trim()
    .slice(0, 800);

  const mensaje = String(raw.mensaje_whatsapp ?? raw.mensajeWhatsapp ?? "")
    .trim()
    .slice(0, 900);

  const pasos = raw.pasos
    .map((step) => String(step).trim().slice(0, 400))
    .filter(Boolean)
    .slice(0, 6);

  return {
    accion,
    porQue,
    pasos,
    mensajeWhatsapp: mensaje,
    model,
    generatedAt: new Date().toISOString(),
    cached: false,
  };
}

export function toModuleInsight(
  raw: ModuleInsightRaw,
  model: string
): ModuleInsight {
  const toList = (value: (string | number)[], max: number) =>
    value
      .map((item) => String(item).trim().slice(0, 400))
      .filter(Boolean)
      .slice(0, max);

  return {
    resumen: raw.resumen.trim().slice(0, 900),
    focos: toList(raw.focos ?? [], 6),
    acciones: toList(raw.acciones, 6),
    mensaje: (raw.mensaje ?? "").trim().slice(0, 900),
    model,
    generatedAt: new Date().toISOString(),
    cached: false,
  };
}
