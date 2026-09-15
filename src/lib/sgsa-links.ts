/**
 * Enlaces canónicos a la interface de Airtable del sistema de gestión (SGSA).
 *
 * El patrón `https://airtable.com/{base}/{interface}/{recordId}` es el que usa
 * el propio botón «IR A CLIENTE» de la base (campo de CLIENTES) y la tarjeta
 * de cliente del CRM («Abrir en la interface del sistema»). Vive acá para no
 * duplicar las constantes en cada componente.
 */

export const SGSA_BASE_ID = "appuhslj3GFf60Tea";
export const SGSA_INTERFACE_ID = "pagloDiKehe3EMnT4";

/** Abre el registro de un CLIENTE en la interface del sistema de gestión. */
export function sgsaClientInterfaceUrl(clientRecordId: string): string {
  return `https://airtable.com/${SGSA_BASE_ID}/${SGSA_INTERFACE_ID}/${encodeURIComponent(clientRecordId)}`;
}
