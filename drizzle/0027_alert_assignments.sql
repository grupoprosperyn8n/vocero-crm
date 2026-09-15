-- 028 — reglas y derivación de alertas (pedido Diego 2026-09-15: «desde el CRM
-- se puedan gestionar alertas y derivar a empleados las alertas para que las
-- gestionen... propietario, administrador y gerente puedan asignarle desde un
-- selector el tipo de alertas... a un grupo o una persona definida para ese
-- tipo de alerta... también que se pueda asignar individualmente una alerta
-- específica a un empleado en específico o un grupo de alertas del mismo tipo»).
--
-- 1) alert_assignment_rule: configuración persistente por tipo de alerta →
--    empleado o grupo del chat interno (la define owner/admin/manager).
-- 2) alert_assignment: trazabilidad por alerta y destinatario (quién derivó,
--    a quién, cuándo, cómo, estado y nota). La visibilidad por rol y la vista
--    «para mí» se calculan sobre esta tabla.
CREATE TABLE IF NOT EXISTS "alert_assignment_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL REFERENCES "public"."organization"("id") ON DELETE cascade,
	"alert_type" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"target_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_assignment_rule_org_type_idx" ON "alert_assignment_rule" USING btree ("organization_id","alert_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_assignment_rule_target_idx" ON "alert_assignment_rule" USING btree ("organization_id","target_kind","target_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alert_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL REFERENCES "public"."organization"("id") ON DELETE cascade,
	"alert_store_id" text NOT NULL,
	"airtable_record_id" text,
	"alert_ref" text NOT NULL,
	"alert_type" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"target_name" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"rule_id" text REFERENCES "public"."alert_assignment_rule"("id") ON DELETE set null,
	"assigned_by" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"note" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "alert_assignment_target_uq" ON "alert_assignment" USING btree ("organization_id","alert_ref","target_kind","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_assignment_org_alert_idx" ON "alert_assignment" USING btree ("organization_id","alert_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alert_assignment_target_idx" ON "alert_assignment" USING btree ("organization_id","target_kind","target_id");
