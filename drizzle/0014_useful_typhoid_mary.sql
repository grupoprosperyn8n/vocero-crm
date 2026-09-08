CREATE TABLE "ai_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text DEFAULT 'openrouter' NOT NULL,
	"api_key_cipher" text,
	"api_key_iv" text,
	"api_key_tag" text,
	"base_url" text,
	"model" text NOT NULL,
	"judge_model" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_settings_org_uq" ON "ai_settings" USING btree ("organization_id");