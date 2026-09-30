CREATE TABLE "piece_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"segment" text,
	"data" jsonb NOT NULL,
	"source_code" text,
	"auto_rule" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "segment" text;--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "explanation" text;--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "header" text;--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "footer" text;--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "buttons" jsonb;--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "auto_rule" text;--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "seed_code" text;--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "pub" jsonb;--> statement-breakpoint
ALTER TABLE "piece_template" ADD CONSTRAINT "piece_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_template" ADD CONSTRAINT "piece_template_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "piece_template_org_kind_idx" ON "piece_template" USING btree ("organization_id","kind");--> statement-breakpoint
CREATE INDEX "piece_template_org_source_idx" ON "piece_template" USING btree ("organization_id","source_code");--> statement-breakpoint
CREATE INDEX "template_org_seed_idx" ON "template" USING btree ("organization_id","seed_code");