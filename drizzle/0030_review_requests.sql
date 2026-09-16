-- 033 — Revisión de envío SGSA ↔ chat interno (pedido Diego 15Sep: «en dual
-- que se pueda aprobar por telegram como está y por el chat interno mostrando
-- el demo del mensaje que va a enviar con la resolución, con el audio incluido
-- y el documento exactamente igual que en telegram» + «también devuelve si el
-- flujo se completó o si se trabó… en qué condición quedó el envío»).
--
-- review_request: la tarjeta de revisión viva que se publica en el chat interno
-- (una por registro en estado pendiente; los ciclos ya decididos quedan como
-- historial) con la decisión tomada desde el chat — quién, cuándo y por dónde —
-- y el snapshot del contenido que viajó (trazabilidad; el audio y el análisis
-- IA se sirven siempre frescos desde Airtable, no se copian acá).
CREATE TABLE IF NOT EXISTS "review_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL REFERENCES "public"."organization"("id") ON DELETE cascade,
	"record_id" text NOT NULL,
	"cliente" text,
	"room_id" text NOT NULL REFERENCES "public"."chat_room"("id") ON DELETE cascade,
	"message_id" text NOT NULL REFERENCES "public"."chat_message"("id") ON DELETE cascade,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"decided_by" text REFERENCES "public"."user"("id") ON DELETE set null,
	"decided_at" timestamp,
	"decided_via" text,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "review_request_pending_uq" ON "review_request" USING btree ("organization_id","record_id") WHERE "status" = 'pendiente';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_org_record_idx" ON "review_request" USING btree ("organization_id","record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_request_message_idx" ON "review_request" USING btree ("message_id");
