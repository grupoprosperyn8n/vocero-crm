/**
 * Enlaces canónicos a la interface de Airtable del sistema de gestión (SGSA).
 *
 * Formatos oficiales (verificados con los links reales que usa el sistema):
 * - CLIENTE: `…/pagloDiKehe3EMnT4?DSjXA={recordId}` — posiciona al cliente en la interface.
 * - REGISTRO: `…/pagloDiKehe3EMnT4?detail={base64url}` — abre el registro de la sección.
 * - IDEAL (pedido Diego): registro CON el cliente por debajo → merge de ambos
 *   (`?detail=…&DSjXA={clienteRec}`), «registro y cliente en uno mismo».
 */

export const SGSA_BASE_ID = "appuhslj3GFf60Tea";
export const SGSA_INTERFACE_ID = "pagloDiKehe3EMnT4";

/** Parámetro de URL que la interface usa para posicionar un CLIENTE. */
export const SGSA_CLIENT_PARAM = "DSjXA";

/** Abre el registro de un CLIENTE en la interface del sistema de gestión. */
export function sgsaClientInterfaceUrl(clientRecordId: string): string {
  return `https://airtable.com/${SGSA_BASE_ID}/${SGSA_INTERFACE_ID}?${SGSA_CLIENT_PARAM}=${encodeURIComponent(clientRecordId)}`;
}

/**
 * 028c — Agrega el cliente (`DSjXA`) a un link de registro de la interface:
 * «que se abra el registro con el cliente por debajo — registro y cliente en
 * uno mismo» (Diego, 15Sep). Si no hay cliente, o el link no es válido,
 * devuelve el original sin tocar.
 */
export function withClientParam(
  url: string,
  clientRecordId: string | null | undefined
): string {
  if (!clientRecordId) return url;
  try {
    const u = new URL(url);
    u.searchParams.set(SGSA_CLIENT_PARAM, clientRecordId);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * URL final de «Abrir registro»: el registro del sistema matcheado con su
 * cliente (registro + cliente en uno). Si la alerta no tiene link de registro
 * pero sí cliente, abre la ficha del cliente; si no hay ninguno, null.
 */
export function alertRecordInterfaceUrl(
  linkRegistro: string | null | undefined,
  clientRecordId: string | null | undefined
): string | null {
  const base = (linkRegistro ?? "").trim();
  if (base) return withClientParam(base, clientRecordId);
  if (clientRecordId) return sgsaClientInterfaceUrl(clientRecordId);
  return null;
}
