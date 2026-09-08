# AGENTS.md — Guía para CUALQUIER agente de IA (Codex, Hermes, OpenCode, Claude…)

> **Enmienda 1 (constitución 1.5.0) — Agent-First**: este proyecto se opera y se
> mejora con agentes de IA de cualquier proveedor, con la misma calidad.
> `CLAUDE.md` tiene el detalle histórico y de arquitectura; este archivo es la
> puerta neutral. Leelo y seguilo — ningún agente queda afuera por formato.

## Qué es esto

Vocero es un CRM de WhatsApp open source (MIT), self-hosted, con agente de IA y
Laboratorio de auto-evaluación. Una instancia = un negocio. Stack: Next.js 15
(App Router) + React 19 + TypeScript estricto + PostgreSQL (Drizzle ORM) +
Better Auth + pnpm. Deploy: Coolify (build pack dockerfile, puerto 3000; las
migraciones corren solas al boot con `node migrate.mjs`).

## Comandos (gates — obligatorios antes de declarar algo "hecho")

```bash
pnpm install --frozen-lockfile
pnpm typecheck        # tsc --noEmit — 0 errores
pnpm lint             # eslint — 0 errores
pnpm test             # vitest — 422 tests unit (sin DB)
pnpm db:generate      # migración drizzle desde src/lib/db/schema.ts
```

Regla: nada está "Hecho" sin typecheck + lint + test en verde (Principio VI) y,
para comportamiento observable, self-test E2E en vivo con camino infeliz
(Principio X). Ver `CLAUDE.md` → "Definición de Hecho REFORZADA".

## Cómo mejorar el sistema (loop SDD — cualquier agente lo ejecuta)

Flujo: `specs antes de código` (Principio VII). Cada feature vive en
`specs/NNN-nombre/` con `spec.md` (comportamiento observable, sin "cómo"),
`plan.md` y `tasks.md` (tu estado durable — si se corta el contexto, reanudás
desde ahí). El detalle está en `docs/sdd-workflow.md` y los formatos en
`.specify/templates/`.

Carriles (elegí y declará ANTES de codear):
- **Ciclo completo** (`spec.md` → `plan.md` → `tasks.md` → implementar):
  obligatorio si tocás el modelo de datos (migración) o un contrato publicado
  (`/api/bot/*`, webhook, SSE, DTOs externos).
- **Carril ligero** (solo `spec.md`): comportamiento observable nuevo sin
  migración ni contrato. Si a mitad descubrís que necesitás migración o
  contrato, SUBÍS de carril antes de seguir.
- **Exento**: typos, formato, refactors internos sin cambio de contrato.

Loop de automejora (objetivo → resultado verificado, sin micro-prompts):
`Discover → Plan → Execute → Verify → Iterate`. Verificás VOS (no el dueño),
diagnosticás, corregís y re-verificás hasta verde. Volvés al dueño solo con el
objetivo verificado en vivo o ante un bloqueo real (decisión de producto
ambigua, falta de credenciales, acción irreversible hacia afuera como merge a
main o gastar dinero).

## Mapa del código (fronteras de modificación)

| Querés cambiar… | Tocá… |
|---|---|
| Proveedor/modelo de IA por org (UI) | `src/lib/ai/providers.ts` (catálogo + dialecto) · `src/server/ai/config.ts` (persistencia cifrada) · `src/app/api/settings/ai/*` · `src/components/settings/ia-client.tsx` |
| Proveedor/modelo por entorno (legacy) | env vars `OPENROUTER_API_TOKEN` / `OPENROUTER_BASE_URL` / `OPENROUTER_MODEL` / `OPENROUTER_JUDGE_MODEL` |
| El adaptador LLM (única frontera con el proveedor) | `src/lib/ai/index.ts` (`chatJson`, dialectos openai/anthropic) |
| El comportamiento/prompt del agente | `src/server/ai/prompts.ts` |
| Acciones del agente | `src/server/ai/actions.ts` + `src/server/ai/pipeline.ts` |
| Personas/juez del Laboratorio | `src/server/lab/personas.ts` · `src/server/lab/judge.ts` |
| Tablas | `src/lib/db/schema.ts` → `pnpm db:generate` → migración en `drizzle/` |
| Canal WhatsApp (Graph API) | `src/lib/meta/` + `src/server/whatsapp/` |
| Canales opcionales (IG/Messenger, agenda, anuncios) | banderas `CHANNELS`/`AGENDA`/`ATRIBUCION` (patrón ADR-001: apagados por defecto, superficie 404 sin bandera) |
| Conectar TU bot en vez del agente interno | `src/app/api/bot/*` (`BOT_API_KEY`) — cerebro externo |

## Constitución (reglas NO negociables — `.specify/memory/constitution.md`)

1. **Agent-First (I, Enmienda 1)**: paridad de superficie — toda config con UI
   tiene equivalente por agente; instrucciones neutrales; automejora con
   cualquier agente; PROHIBIDO lo que solo un agente pueda operar.
2. **Seguridad (II)**: secretos cifrados en reposo (AES-256-GCM,
   `src/lib/crypto`); jamás al cliente ni a logs; keys de IA cifradas en
   `ai_settings`.
3. **Soberanía (III)**: núcleo solo con WhatsApp Cloud API + LLM
   OpenRouter-compatible opcional. Terceros solo como conectores opcionales
   tras bandera, con degradación definida.
4. **Multi-tenancy (IV)**: `organization_id` NOT NULL en toda tabla de dominio;
   toda query pasa por `scoped()` (`src/lib/db/tenant.ts`).
5. **Idempotencia (V)**: webhooks dedup por `wa_message_id` UNIQUE.
6. **Calidad (VI)** y **Verificación en vivo (X)**: gates en automático +
   self-test E2E con camino infeliz, lo hace el implementador.
7. **Specs antes de código (VII)** — ver carriles arriba.

## Convenciones de IA (019)

- `getOrgAiConfig(orgId)` resuelve la config de IA de la org (Ajustes → IA);
  sin fila en `ai_settings`, el adaptador cae a env vars — la UI es una puerta
  más, no la única.
- Agregar un proveedor LLM = UNA entrada en `AI_PROVIDERS`
  (`src/lib/ai/providers.ts`). Dialecto "openai" → baseUrl con `/v1` incluido;
  "anthropic" → raíz de la API (el adaptador agrega `/v1/messages`).
- El self-test local usa mocks (`WA_MOCK_ENABLED=true` + `OPENROUTER_BASE_URL`
  al ai-mock). Nunca actives mocks en producción.

## Credenciales y secretos

Nunca comprometas secretos al repo (gitignored: `.env`, `.credenciales/`). Los
valores de entorno de producción viven en la plataforma de deploy (Coolify), no
en archivos. Para probar integraciones reales usá tus propias credenciales y
respetá los guardarraíles del Principio X.
