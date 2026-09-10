-- Sync LOGIN v2 (Bloque A) — ficha del empleado + oficinas.
-- Nota: el diff original de drizzle también re-agregaba piezas de 1F/1G
-- (cierre de conversación y outbound_webhook) que viven FUERA del journal y
-- ya existen en todos los entornos — acá quedan solo las tablas nuevas.
CREATE TABLE IF NOT EXISTS "office" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"clean_name" text,
	"locality" text,
	"sort_order" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"employee_code" text,
	"operational_role" text,
	"locality" text,
	"source_status" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "office" ADD CONSTRAINT "office_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profile" ADD CONSTRAINT "staff_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profile" ADD CONSTRAINT "staff_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "office_org_external_uq" ON "office" USING btree ("organization_id","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "office_org_active_idx" ON "office" USING btree ("organization_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_profile_org_user_uq" ON "staff_profile" USING btree ("organization_id","user_id");
