-- 026 — bandeja POR USUARIO (pedido Diego 2026-09-13: «los chat individual
-- también se tiene que poder archivar de la bandeja de entrada... cada empleado
-- pueda guardar persistentemente su bandeja... cada usuario tiene que ver solo
-- sus comunicaciones... y los gerentes pueden ver todas las conversaciones y
-- filtrar por las suyas o de cualquier empleado, y administrador lo mismo y
-- propietario igual»).
--
-- 1) Chat interno: archivo personal de una sala (chat_room_member.archived_at).
-- 2) Bandeja CRM: archivo personal de una conversación (conversation_archive).
ALTER TABLE "chat_room_member" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_archive" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL REFERENCES "public"."organization"("id") ON DELETE cascade,
	"conversation_id" text NOT NULL REFERENCES "public"."conversation"("id") ON DELETE cascade,
	"user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
	"archived_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_archive_uq" ON "conversation_archive" USING btree ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversation_archive_user_idx" ON "conversation_archive" USING btree ("organization_id","user_id");
