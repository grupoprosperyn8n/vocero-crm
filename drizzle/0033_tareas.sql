-- 037a — TAREAS como tercer tablero del pipeline (pedido Diego 2026-09-16).
-- Las tareas viven en el mismo `lead` (board='tareas' + source_kind='task'):
-- título (label), nota (notes), vencimiento con hora (due_at) y cierre
-- (completed_at). Vínculo: contacto del CRM (contact_id) o meta.origin
-- ({kind:'alert'|'review'|'client', ref, label}) para alertas/siniestros.
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "due_at" timestamp;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "notes" text;--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN IF NOT EXISTS "completed_at" timestamp;--> statement-breakpoint
-- Un contacto puede tener VARIAS tareas (su checklist) y convivir con su
-- tarjeta de ventas: la unicidad por dueño+contacto deja afuera a las tareas.
DROP INDEX IF EXISTS "lead_owner_contact_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lead_owner_contact_uq" ON "lead" USING btree ("owner_user_id","contact_id") WHERE "board" <> 'tareas';--> statement-breakpoint
-- Etapas iniciales del tablero de TAREAS para cada organización.
INSERT INTO "pipeline_stage" ("id","organization_id","name","position","kind","board")
SELECT 'stg_' || substr(md5(o."id" || '_t1'), 1, 20), o."id", 'Pendientes', 0, 'open', 'tareas'
FROM "organization" o
WHERE NOT EXISTS (SELECT 1 FROM "pipeline_stage" s WHERE s."organization_id" = o."id" AND s."board" = 'tareas');--> statement-breakpoint
INSERT INTO "pipeline_stage" ("id","organization_id","name","position","kind","board")
SELECT 'stg_' || substr(md5(o."id" || '_t2'), 1, 20), o."id", 'En curso', 1, 'open', 'tareas'
FROM "organization" o
WHERE NOT EXISTS (SELECT 1 FROM "pipeline_stage" s WHERE s."organization_id" = o."id" AND s."board" = 'tareas' AND s."name" = 'En curso');--> statement-breakpoint
INSERT INTO "pipeline_stage" ("id","organization_id","name","position","kind","board")
SELECT 'stg_' || substr(md5(o."id" || '_t3'), 1, 20), o."id", 'Terminadas', 2, 'won', 'tareas'
FROM "organization" o
WHERE NOT EXISTS (SELECT 1 FROM "pipeline_stage" s WHERE s."organization_id" = o."id" AND s."board" = 'tareas' AND s."name" = 'Terminadas');
