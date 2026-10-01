# 046 — Conexiones del dueño + IA multi-conexión + consumos de tokens

## Problema
1. El rol dueño (administrador) no puede entrar a las conexiones (WhatsApp, Telegram, IA): páginas y APIs son solo del propietario. Pedido Diego (30Sep): «activemos el rol dueño para que pueda entrar solamente a whatsapp, telegram y también para conectar una IA».
2. La IA de la organización es UNA sola config (`ai_settings`): hoy la instancia usa la key de Diego (DeepSeek). Pedido: «que se puedan desconectar las IA y también poder cambiarla por otra cargada».
3. No hay visibilidad de gasto: pedido «un gestor de consumos general de tokens segmentado, el costo por token que se lleva gastado y el costo unitario que vale cada IA».

## Qué se construye
- **Acceso**: guarda nueva `integrations` (propietario + dueño) en WhatsApp/Telegram/IA — páginas, APIs y pestañas del nav. Manager y member siguen rebotando a /inbox.
- **Conexiones IA (`ai_connections`)**: N conexiones por organización (una por proveedor), una activa; crear / editar / probar / activar / desactivar / eliminar. La fila existente de `ai_settings` se migra como conexión activa.
- **IA del sistema**: el fallback por env se puede desconectar por organización (`organization.system_ai_enabled`).
- **Consumos (`ai_usage`)**: cada llamada exitosa registra tokens in/out con org, conexión, proveedor, modelo, módulo y vía (propia/sistema). Vista segmentada: totales, por modelo, por módulo y por día; costo estimado = tokens × precio (override por conexión → catálogo de referencia editable `lib/ai/pricing.ts`).
- **Proveedores**: DeepSeek, OpenAI, Gemini, Claude (Anthropic) + OpenRouter y custom (ya existían en el catálogo).

## Criterios
- Owner y admin ven y operan las tres secciones; manager y member quedan afuera (redirect / 403).
- Sin conexión propia y con IA del sistema desconectada → las funciones de IA devuelven `not_configured` (es una decisión del cliente).
- El precio unitario (USD por 1M tokens) es editable por conexión; el catálogo es referencia, no verdad.
- Ninguna llamada de IA falla por el registro de consumo (fire-and-forget).
- Migración auto-aplicada en deploy (Dockerfile → `migrate.mjs`).

## Decisiones
- `ai_settings` queda como legado sin uso; la resolución pasa a `ai_connections` → env si `system_ai_enabled`.
- El costo no se persiste: se estima al leer con el precio vigente.
- Los "últimos 4" de la key no se muestran (está cifrada); la UI muestra "key guardada" y permite reemplazarla.

## Fuera de alcance
- Billing/facturación, límites por cliente, alertas de consumo.
- Importar consumo anterior a este bloque.
