/*
 * 039 — Colores de etiquetas = los del backend de Airtable.
 *
 * Fuente: metadata real de las bases (consultada 18Sep2026):
 *   - ESTADO DE LA POLIZA y FORMA DE PAGOS → base AGÉNTICA (SGSA),
 *     tabla POLIZAS (tblEpvdJAQCA7wUe9).
 * La paleta (fill/text) es la oficial de Airtable — la misma que usa su
 * interfaz nativa — así que las etiquetas del tablero quedan idénticas a
 * las del backoffice.
 *
 * Regla: un valor sin mapeo se muestra como chip neutro (no se inventa
 * color y jamás se rompe la lista).
 */

/** Paleta oficial de Airtable (solo los tokens que usan las bases). */
const PALETTE: Record<string, { bg: string; fg: string }> = {
  blueLight2: { bg: "#CFDFFF", fg: "#000000" },
  blueLight1: { bg: "#9CC7FF", fg: "#000000" },
  blueBright: { bg: "#2D7FF9", fg: "#FFFFFF" },
  blueDark1: { bg: "#2750AE", fg: "#FFFFFF" },
  cyanLight2: { bg: "#D0F0FD", fg: "#000000" },
  cyanLight1: { bg: "#77D1F3", fg: "#000000" },
  cyanBright: { bg: "#18BFFF", fg: "#FFFFFF" },
  cyanDark1: { bg: "#0B76B7", fg: "#FFFFFF" },
  tealLight2: { bg: "#C2F5E9", fg: "#000000" },
  tealLight1: { bg: "#72DDC3", fg: "#000000" },
  tealBright: { bg: "#20D9D2", fg: "#FFFFFF" },
  tealDark1: { bg: "#02AAA4", fg: "#FFFFFF" },
  greenLight2: { bg: "#D1F7C4", fg: "#000000" },
  greenLight1: { bg: "#93E088", fg: "#000000" },
  greenBright: { bg: "#20C933", fg: "#FFFFFF" },
  greenDark1: { bg: "#338A17", fg: "#FFFFFF" },
  yellowLight2: { bg: "#FFEAB6", fg: "#000000" },
  yellowLight1: { bg: "#FFD66E", fg: "#000000" },
  yellowBright: { bg: "#FCB400", fg: "#FFFFFF" },
  yellowDark1: { bg: "#E08D00", fg: "#FFFFFF" },
  orangeLight2: { bg: "#FEE2D5", fg: "#000000" },
  orangeLight1: { bg: "#FFA981", fg: "#000000" },
  orangeBright: { bg: "#FF6F2C", fg: "#FFFFFF" },
  orangeDark1: { bg: "#D74D26", fg: "#FFFFFF" },
  redLight2: { bg: "#FFDCE5", fg: "#000000" },
  redLight1: { bg: "#FF9EB7", fg: "#000000" },
  redBright: { bg: "#F82B60", fg: "#FFFFFF" },
  redDark1: { bg: "#BA1E45", fg: "#FFFFFF" },
  pinkLight2: { bg: "#FFDAF6", fg: "#000000" },
  pinkLight1: { bg: "#F99DE2", fg: "#000000" },
  pinkBright: { bg: "#FF08C2", fg: "#FFFFFF" },
  pinkDark1: { bg: "#B2158B", fg: "#FFFFFF" },
  purpleLight2: { bg: "#EDE2FE", fg: "#000000" },
  purpleLight1: { bg: "#CDB0FF", fg: "#000000" },
  purpleBright: { bg: "#8B46FF", fg: "#FFFFFF" },
  purpleDark1: { bg: "#6B1CB0", fg: "#FFFFFF" },
  grayLight2: { bg: "#EEEEEE", fg: "#000000" },
  grayLight1: { bg: "#CCCCCC", fg: "#000000" },
  grayBright: { bg: "#666666", fg: "#FFFFFF" },
  grayDark1: { bg: "#444444", fg: "#FFFFFF" },
};

/**
 * Normaliza el valor crudo de Airtable para buscarlo en los mapas:
 * MAYÚSCULAS, sin acentos, sin `_`, espacios colapsados y trim.
 * ("Vida en trámite " y "NO_RENOVADA" matchean con sus opciones reales.)
 */
export function normalizeAirtableValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ESTADO DE LA POLIZA — base AGÉNTICA (tabla POLIZAS). */
const ESTADO_DE_LA_POLIZA: Record<string, string> = {
  "POLIZA VIGENTE": "tealBright",
  ANULACION: "redBright",
  "EN TRAMITE": "yellowBright",
  "SIN POLIZA": "purpleLight2",
  "SIN VIGENCIA": "pinkDark1",
  "VENCE EN 30 DIAS": "pinkLight1",
  "VENCE EN 7 DIAS": "pinkBright",
  "FALTA MENOS DE 2 SEMANAS PARA VENCER": "pinkLight2",
  "MENOS DE 30 DIAS PARA VENCER": "blueLight2",
  "FALTA MENOS DE 7 DIAS PARA VENCER": "cyanLight2",
  "VENCE EN 1 DIA": "redBright",
  "VENCE HOY": "pinkBright",
  RENOVADA: "greenBright",
  "NO RENOVADA": "redDark1",
  VIGENTE: "tealBright",
  "COMPLETAR DATOS": "orangeBright",
  ENDOSO: "blueDark1",
  "AUX EN TRAMITE": "pinkBright",
  "VIDA EN TRAMITE": "purpleBright",
};

/** FORMA DE PAGOS — base AGÉNTICA (tabla POLIZAS). */
const FORMA_DE_PAGOS: Record<string, string> = {
  CREDITO: "blueBright",
  DEBITO: "cyanBright",
  EFECTIVO: "greenBright",
  "NO APLICA": "grayDark1",
  "MERCADO P": "yellowBright",
};

/** Estilo inline de un chip con un token de la paleta Airtable. */
export type AirtableTagStyle = {
  backgroundColor: string;
  color: string;
  borderColor: string;
};

function styleForToken(token: string): AirtableTagStyle | null {
  const pal = PALETTE[token];
  if (!pal) return null;
  return {
    backgroundColor: pal.bg,
    color: pal.fg,
    borderColor: pal.fg === "#000000" ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.28)",
  };
}

/**
 * Valor crudo → estilo del chip. `null` si el valor no está mapeado
 * (el llamador decide el chip neutro).
 */
export function airtableTagStyle(value: string): AirtableTagStyle | null {
  const key = normalizeAirtableValue(value);
  if (!key) return null;
  const token = ESTADO_DE_LA_POLIZA[key] ?? FORMA_DE_PAGOS[key];
  return token ? styleForToken(token) : null;
}

/** ¿El valor corresponde a un estado/formapago conocido? (para tests). */
export function isKnownAirtableTag(value: string): boolean {
  return airtableTagStyle(value) !== null;
}
