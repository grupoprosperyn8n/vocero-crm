CREATE TABLE "ai_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"api_key_cipher" text NOT NULL,
	"api_key_iv" text NOT NULL,
	"api_key_tag" text NOT NULL,
	"base_url" text,
	"model" text NOT NULL,
	"judge_model" text,
	"cost_in_per_1m" double precision,
	"cost_out_per_1m" double precision,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"source" text NOT NULL,
	"via" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "system_ai_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_connections" ADD CONSTRAINT "ai_connections_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_connection_id_ai_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ai_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_connections_org_provider_uq" ON "ai_connections" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE INDEX "ai_usage_org_created_idx" ON "ai_usage" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_usage_org_source_idx" ON "ai_usage" USING btree ("organization_id","source");--> statement-breakpoint
-- 046 — Migración de datos: la config única de la organización (si existe)
-- pasa a ser una conexión activa de Ajustes → IA. `ai_settings` queda como
-- legado sin uso (no se borra: rollback seguro).
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
	true,
	now(),
	now()
FROM "ai_settings"
WHERE "api_key_cipher" IS NOT NULL;