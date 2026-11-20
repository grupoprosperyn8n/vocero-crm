CREATE TABLE "whatsapp_onboarding_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"event" text NOT NULL,
	"result" text NOT NULL,
	"error_code" integer,
	"waba_masked" text,
	"phone_masked" text,
	"registered" boolean,
	"sync_type" text,
	"request_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "mode" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "operational_at" timestamp;--> statement-breakpoint
ALTER TABLE "whatsapp_onboarding_log" ADD CONSTRAINT "whatsapp_onboarding_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wa_onboarding_log_org_idx" ON "whatsapp_onboarding_log" USING btree ("organization_id","created_at");--> statement-breakpoint
DO $$
DECLARE dup int;
BEGIN
  SELECT count(*) INTO dup FROM (
    SELECT waba_id FROM meta_credentials GROUP BY waba_id HAVING count(*) > 1
  ) d;
  IF dup > 0 THEN
    RAISE EXCEPTION 'meta_credentials tiene % WABA(s) duplicada(s): resolvelo a mano antes de aplicar 050 (el indice unico existe para que eventos de plantillas no se enruten a la organizacion equivocada)', dup;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "meta_credentials_waba_uq" ON "meta_credentials" USING btree ("waba_id");