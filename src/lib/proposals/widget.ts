/**
 * 044b-B11 — piezas del Constructor: validación y normalización del widget
 * (formulario, encuesta o cupón/voucher) y generación de códigos de voucher.
 *
 * Puro (sin base de datos): lo usa el servicio de propuestas y lo cubren los
 * tests unitarios.
 */
import { randomBytes } from "node:crypto";
import { newId } from "@/lib/db/ids";
import type { ProposalWidget, ProposalWidgetField } from "@/lib/types";

const WIDGET_FIELD_TIPOS = new Set([
  "texto",
  "parrafo",
  "email",
  "telefono",
  "numero",
  "seleccion",
  "si_no",
  "escala",
]);

export const WIDGET_MAX_FIELDS = 20;

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

function sanitizeWidgetField(raw: unknown): ProposalWidgetField | null {
  const f = (raw ?? {}) as Record<string, unknown>;
  const label = cleanText(f.label, 200);
  if (!label) return null;
  const tipo =
    typeof f.tipo === "string" && WIDGET_FIELD_TIPOS.has(f.tipo) ? f.tipo : "texto";
  const opciones = (Array.isArray(f.opciones) ? f.opciones : [])
    .map((o) => cleanText(o, 80))
    .filter((o): o is string => Boolean(o))
    .slice(0, 12);
  const idRaw = typeof f.id === "string" ? f.id.trim() : "";
  return {
    id: /^[A-Za-z0-9_-]{4,40}$/.test(idRaw) ? idRaw : newId("widgetField"),
    label,
    tipo: tipo === "seleccion" && opciones.length === 0 ? "texto" : tipo,
    requerido: f.requerido === true,
    opciones,
  };
}

/** 044b-B11 — valida y normaliza el widget de una pieza (o null si inválido). */
export function sanitizeWidget(raw: unknown): ProposalWidget | null {
  if (!raw || typeof raw !== "object") return null;
  const w = raw as Record<string, unknown>;
  if (w.type === "form" || w.type === "survey") {
    const source = w.type === "form" ? w.fields : w.questions;
    const rows = Array.isArray(source) ? source : [];
    const fields = rows
      .map(sanitizeWidgetField)
      .filter((f): f is ProposalWidgetField => f !== null)
      .slice(0, WIDGET_MAX_FIELDS);
    if (fields.length === 0) return null;
    return w.type === "form"
      ? { type: "form", fields }
      : { type: "survey", questions: fields };
  }
  if (w.type === "coupon") {
    const beneficio = cleanText(w.beneficio, 200);
    if (!beneficio) return null;
    const prefijo =
      (cleanText(w.prefijo, 10) ?? "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 8) || "VCH";
    const isoOrNull = (v: unknown): string | null => {
      const s = typeof v === "string" ? v.trim() : "";
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    };
    return {
      type: "coupon",
      beneficio,
      condiciones: cleanText(w.condiciones, 400) ?? "",
      desde: isoOrNull(w.desde),
      hasta: isoOrNull(w.hasta),
      prefijo,
    };
  }
  return null;
}

/** Alfabeto sin caracteres que se confunden (O/0, I/1) para leerlos en voz alta. */
const COUPON_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Un grupo de 4 caracteres del código (ej. «K7QF»). */
export function couponGroup(): string {
  const bytes = randomBytes(4);
  let out = "";
  for (let i = 0; i < 4; i++) {
    const b = bytes[i] ?? 0;
    out += COUPON_ALPHABET.charAt(b % COUPON_ALPHABET.length);
  }
  return out;
}

/** Código completo de un voucher: <PREFIJO>-XXXX-XXXX. */
export function couponCode(prefijo: string): string {
  const p = (prefijo || "VCH").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "VCH";
  return `${p}-${couponGroup()}-${couponGroup()}`;
}
