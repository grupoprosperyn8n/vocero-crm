ALTER TABLE "conversation" ADD COLUMN "closed_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "closed_by" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "closure_status" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "closure_summary" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "closure_error" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "closure_webhook_at" timestamp;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_closed_by_user_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_closed_idx" ON "conversation" USING btree ("closed_at");
