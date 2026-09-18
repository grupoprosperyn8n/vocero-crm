ALTER TABLE "proposal" ADD COLUMN "tone" text;--> statement-breakpoint
ALTER TABLE "proposal" ADD COLUMN "angle" text;--> statement-breakpoint
ALTER TABLE "proposal" ADD COLUMN "online" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "proposal" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "proposal" ADD COLUMN "deleted_at" timestamp;