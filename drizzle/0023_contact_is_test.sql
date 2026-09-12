-- 0023_contact_is_test — Marca de datos NO reales (pedido Diego 2026-09-12):
-- "creale una marca a los datos que tenemos que no son reales para posteriormente limpiarlos".
-- Criterio: todo lo existente ANTES del 2026-09-13 es de prueba/demo/POC, EXCEPTO el
-- contacto de Telegram del dueño (ct_23n65748x0wnx9wfozrs), que se conserva como real.
-- Idempotente a propósito (puede re-correr tras el deploy sin daño: todos los contactos
-- reales futuros quedan fuera del rango de fechas).
ALTER TABLE "contact" ADD COLUMN IF NOT EXISTS "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "contact" SET "is_test" = true WHERE "is_test" = false AND "created_at" < TIMESTAMPTZ '2026-09-13 00:00:00-03' AND "id" <> 'ct_23n65748x0wnx9wfozrs';--> statement-breakpoint
UPDATE "conversation" SET "is_test" = true WHERE "is_test" = false AND "created_at" < TIMESTAMPTZ '2026-09-13 00:00:00-03' AND "contact_id" <> 'ct_23n65748x0wnx9wfozrs';
