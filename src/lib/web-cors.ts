/**
 * CORS de las superficies públicas del canal web (1A).
 *
 * El widget corre embebido en el sitio del negocio (otro origen): sin estas
 * cabeceras el navegador bloquea el polling de mensajes. La autorización de
 * estas rutas es la sesión opaca en sí misma (no hay cookies ni credenciales
 * ambientales), así que el origen abierto no expone nada: sin un sessionId
 * válido no hay conversación que leer ni escribir.
 */
export const WEB_CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

/** Respuesta preflight (OPTIONS) del canal web. */
export function webCorsPreflight(): Response {
  return new Response(null, { status: 204, headers: WEB_CORS_HEADERS });
}

/**
 * Agrega las cabeceras CORS a una respuesta ya construida y la devuelve.
 * Las respuestas de estas rutas siempre nacen acá adentro (Response.json /
 * apiError), así que sus headers son mutables.
 */
export function withWebCors<T extends Response>(res: T): T {
  for (const [key, value] of Object.entries(WEB_CORS_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}
