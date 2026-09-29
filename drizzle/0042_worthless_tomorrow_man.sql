ALTER TABLE "proposal" ADD COLUMN "accepted_by" text;--> statement-breakpoint
ALTER TABLE "proposal" ADD COLUMN "accepted_at" timestamp;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;