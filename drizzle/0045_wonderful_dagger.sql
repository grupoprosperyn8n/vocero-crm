CREATE TABLE "ai_insight" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"scope" text NOT NULL,
	"ref_id" text NOT NULL,
	"title" text NOT NULL,
	"mode" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"payload" jsonb NOT NULL,
	"input" jsonb NOT NULL,
	"generated_at" timestamp NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_insight" ADD CONSTRAINT "ai_insight_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_insight" ADD CONSTRAINT "ai_insight_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_insight_org_scope_idx" ON "ai_insight" USING btree ("organization_id","scope");--> statement-breakpoint
CREATE INDEX "ai_insight_scope_ref_idx" ON "ai_insight" USING btree ("organization_id","scope","ref_id");--> statement-breakpoint
CREATE INDEX "ai_insight_generated_idx" ON "ai_insight" USING btree ("organization_id","generated_at");