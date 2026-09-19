CREATE TABLE "crm_product" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposal" ADD COLUMN "product_ref" text;--> statement-breakpoint
ALTER TABLE "proposal_template" ADD COLUMN "product_ref" text;--> statement-breakpoint
ALTER TABLE "crm_product" ADD CONSTRAINT "crm_product_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_product_org_idx" ON "crm_product" USING btree ("organization_id");