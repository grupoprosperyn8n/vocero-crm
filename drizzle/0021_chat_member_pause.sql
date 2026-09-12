ALTER TABLE "chat_room_member" ADD COLUMN "paused_at" timestamp;--> statement-breakpoint
ALTER TABLE "chat_room_member" ADD COLUMN "paused_by" text;--> statement-breakpoint
ALTER TABLE "chat_room_member" ADD CONSTRAINT "chat_room_member_paused_by_user_id_fk" FOREIGN KEY ("paused_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;