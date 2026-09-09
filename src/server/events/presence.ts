/**
 * 019 — Presencia de la bandeja, in-process (contrato sse.md).
 *
 * Una conexión SSE viva de `/api/events` ES la definición de "empleado
 * online": la abrió la bandeja y el navegador la mantiene mientras la app
 * está en primer plano. El runtime aborta la conexión cuando el cliente
 * muere o se va, así que no hace falta TTL: el `cleanup` del stream hace el
 * `drop`. Sin timers, sin colas externas (Constitución II).
 *
 * Conteo de referencias: dos pestañas del mismo empleado suman dos
 * conexiones; la presencia cae recién cuando se cierran todas.
 */

type PresenceMap = Map<string, number>; // userId -> conexiones vivas

const globalForPresence = globalThis as unknown as {
  __voceroPresence?: Map<string, PresenceMap>;
};

function getRegistry(): Map<string, PresenceMap> {
  if (!globalForPresence.__voceroPresence) {
    globalForPresence.__voceroPresence = new Map();
  }
  return globalForPresence.__voceroPresence;
}

/** Una conexión SSE más para este empleado en esta organización. */
export function touchPresence(organizationId: string, userId: string): void {
  const org = getRegistry();
  let users = org.get(organizationId);
  if (!users) {
    users = new Map();
    org.set(organizationId, users);
  }
  users.set(userId, (users.get(userId) ?? 0) + 1);
}

/** Una conexión SSE se cerró: resta uno; con cero conexiones, ya no está. */
export function dropPresence(organizationId: string, userId: string): void {
  const users = getRegistry().get(organizationId);
  if (!users) return;
  const remaining = (users.get(userId) ?? 1) - 1;
  if (remaining <= 0) {
    users.delete(userId);
    if (users.size === 0) getRegistry().delete(organizationId);
  } else {
    users.set(userId, remaining);
  }
}

/** Empleados con al menos una conexión SSE viva, en esta organización. */
export function onlineUserIds(organizationId: string): string[] {
  const users = getRegistry().get(organizationId);
  return users ? [...users.keys()] : [];
}
