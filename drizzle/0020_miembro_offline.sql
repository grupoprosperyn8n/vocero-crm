-- 020 — "Dejar offline" manual por miembro (pestaña Equipo: propietario y
-- administrador). Independiente de la membresía: la fila queda (ficha e
-- historial) pero el acceso se corta (requireSession + login). El sync del
-- sistema no pisa este estado; solo la baja de LOGIN quita la membresía.
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "offline_at" timestamp;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN IF NOT EXISTS "offline_by" text;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_offline_by_user_id_fk" FOREIGN KEY ("offline_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
