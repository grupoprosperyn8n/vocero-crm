-- 034 — Pin PERSONAL (pedido Diego 16Sep: «se deben de poder pinear y
-- despinear aparte de archivar... los grupos también»): fijar/desfijar arriba
-- de MI lista, en las salas del chat interno y en las conversaciones del CRM.
-- Es independiente del archivo personal (026): algo puede quedar fijado Y
-- archivado a la vez (fijado dentro de mis archivadas).
--
-- chat_room_member.pinned_at: pin de la sala (por integrante).
-- conversation_pin: pin de la conversación (por usuario), espejo de
-- conversation_archive.
ALTER TABLE "chat_room_member" ADD COLUMN IF NOT EXISTS "pinned_at" timestamp;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_pin" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
	"conversation_id" text NOT NULL REFERENCES "conversation"("id") ON DELETE cascade,
	"user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
	"pinned_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_pin_uq" ON "conversation_pin" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_pin_user_idx" ON "conversation_pin" USING btree ("organization_id","user_id");
