/**
 * 019 — Si esta instancia tiene el router de asignación de handoffs.
 *
 * Misma decisión que la agenda y los canales opcionales (ADR-001): el código
 * del router viaja siempre en main, y lo que decide si existe es una variable
 * de despliegue. Una instancia normal (sin `ROUTER_ASSIGN`) deriva igual que
 * siempre: la conversación queda pausada en la bandeja y cualquier miembro la
 * toma. Con `ROUTER_ASSIGN=on`, una derivación con empleados online se asigna
 * al miembro conectado de menor carga (ver `server/router/assign.ts`).
 *
 * Se hace así, y no con una rama, porque una rama tiene que mantenerse
 * compatible con main (misma razón documentada en `agenda/flag.ts`).
 *
 * La migración se aplica siempre: dos columnas nullable con un índice son
 * inertes sin el flag, y a cambio todas las instancias comparten estructura.
 */

/** Valores que cuentan como "encendido". Cualquier otra cosa, apagado. */
const ON_VALUES = new Set(["on", "1", "true", "si", "sí", "yes"]);

/**
 * Se lee de `process.env` directo, no por `getEnv()`, igual que
 * `agendaEnabled()`: preguntar si una feature existe no puede depender de que
 * TODO el entorno valide. `ROUTER_ASSIGN` sí está declarada en el esquema de
 * `lib/env.ts`: ahí vive su documentación y su tipo.
 */
export function routerEnabled(): boolean {
  return ON_VALUES.has((process.env.ROUTER_ASSIGN ?? "").trim().toLowerCase());
}
