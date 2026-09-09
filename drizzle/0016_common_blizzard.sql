ALTER TABLE "conversation" ADD COLUMN "assignee_id" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "assigned_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_assignee_idx" ON "conversation" USING btree ("assignee_id");