-- 047 — Recuperar la conexión de IA heredada (`ai_settings`) como conexión de
-- Ajustes → IA, esta vez INACTIVA (offline): la organización la prueba y la
-- activa a mano cuando quiera. Idempotente: si ya hay una conexión de ese
-- proveedor, no toca nada.
--
-- Contexto: la 0046 ya migraba esta config (quedaba ACTIVA); en la verificación
-- E2E de la 046 en producción el upsert por proveedor la reemplazó por una de
-- prueba y el cleanup la borró — esta migración la repone sin pisar nada.
INSERT INTO "ai_connections" (
	"id", "organization_id", "provider", "api_key_cipher", "api_key_iv",
	"api_key_tag", "base_url", "model", "judge_model", "is_active",
	"created_at", "updated_at"
)
SELECT
	'aic_' || "organization_id",
	"organization_id",
	"provider",
	"api_key_cipher",
	"api_key_iv",
	"api_key_tag",
	"base_url",
	"model",
	"judge_model",
	false,
	now(),
	now()
FROM "ai_settings"
WHERE "api_key_cipher" IS NOT NULL
ON CONFLICT DO NOTHING;
