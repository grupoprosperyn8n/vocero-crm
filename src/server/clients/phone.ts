/**
 * Llaves de teléfono para el matching backend ↔ CRM.
 *
 * El mismo número vive escrito distinto en cada sistema ("+54 9 341 561
 * 7096", "5493415617096", "341-561-7096"): la llave normaliza a dígitos,
 * quita los prefijos 54/9 (formato móvil argentino) y se queda con los
 * últimos 10 dígitos, que son estables entre formatos.
 *
 * La contraparte SQL de `phoneKey()` vive en `src/server/clients/link.ts`
 * (misma transformación, para poder comparar dentro de Postgres).
 */

export function phoneDigits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D+/g, "");
}

export function phoneKey(s: string | null | undefined): string {
  let d = phoneDigits(s);
  if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("9")) d = d.slice(1);
  return d.slice(-10);
}
