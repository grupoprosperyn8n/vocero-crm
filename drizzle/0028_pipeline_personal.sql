-- 029 — pipeline PERSONAL de dos tableros (pedido Diego 2026-09-15: «usar la
-- sección de Pipeline de dos maneras: una para la venta con los contactos del
-- CRM o contactos del sistema, y la otra para las tarjetas de alertas... el
-- pipeline es único para cada usuario... no quiero que se autocarguen [los
-- clientes]... desde el chat con el cliente se pueda agregar al pipeline... y
-- que desde la alerta la tarjeta se pueda mandar al pipeline»).
--
-- 1) pipeline_stage.board: las etapas pasan a pertenecer a un tablero
--    (ventas | gestiones). Las existentes quedan en ventas (default).
-- 2) lead: la tarjeta del pipeline ahora es de UN usuario (owner_user_id) y
--    puede representar un contacto del CRM, un cliente del sistema o una
--    alerta (source_kind + sgsa_ref + label + meta). El contacto deja de ser
--    obligatorio: una alerta no siempre tiene ficha en el CRM.
-- 3) Unicidad POR DUEÑO (no por contacto): dos usuarios pueden seguir al mismo
--    cliente sin pisarse. Los NULL no chocan (Postgres los considera distintos).
-- 4) Etapas iniciales del tablero de GESTIONES para cada organización.
ALTER TABLE "pipeline_stage" ADD COLUMN IF NOT EXISTS "board" text DEFAULT 'ventas' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "owner_user_id" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "board" text DEFAULT 'ventas' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "source_kind" text DEFAULT 'contact' NOT NULL;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "sgsa_ref" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "label" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "meta" jsonb;--> statement-breakpoint
ALTER TABLE "lead" ALTER COLUMN "contact_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_stage_event" ALTER COLUMN "contact_id" DROP NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "lead" ADD CONSTRAINT "lead_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "lead_contact_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_owner_contact_uq" ON "lead" USING btree ("owner_user_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_owner_ref_uq" ON "lead" USING btree ("organization_id","owner_user_id","board","sgsa_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_board_owner_idx" ON "lead" USING btree ("organization_id","board","owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stage_org_board_pos_idx" ON "pipeline_stage" USING btree ("organization_id","board","position");--> statement-breakpoint
INSERT INTO "pipeline_stage" ("id","organization_id","name","position","kind","board")
SELECT 'stg_' || substr(md5(o."id" || '_gn1'), 1, 20), o."id", 'Nueva', 0, 'open', 'gestiones'
FROM "organization" o
WHERE NOT EXISTS (SELECT 1 FROM "pipeline_stage" s WHERE s."organization_id" = o."id" AND s."board" = 'gestiones');--> statement-breakpoint
INSERT INTO "pipeline_stage" ("id","organization_id","name","position","kind","board")
SELECT 'stg_' || substr(md5(o."id" || '_gn2'), 1, 20), o."id", 'En curso', 1, 'open', 'gestiones'
FROM "organization" o
WHERE NOT EXISTS (SELECT 1 FROM "pipeline_stage" s WHERE s."organization_id" = o."id" AND s."board" = 'gestiones' AND s."name" = 'En curso');--> statement-breakpoint
INSERT INTO "pipeline_stage" ("id","organization_id","name","position","kind","board")
SELECT 'stg_' || substr(md5(o."id" || '_gn3'), 1, 20), o."id", 'Resuelta', 2, 'won', 'gestiones'
FROM "organization" o
WHERE NOT EXISTS (SELECT 1 FROM "pipeline_stage" s WHERE s."organization_id" = o."id" AND s."board" = 'gestiones' AND s."name" = 'Resuelta');
