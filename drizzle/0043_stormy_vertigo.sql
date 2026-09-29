CREATE TABLE "coupon_token" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"proposal_id" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'emitido' NOT NULL,
	"issued_to_name" text,
	"contact_id" text,
	"redeemed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "proposal_response" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"proposal_id" text NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb,
	"client_name" text,
	"client_phone" text,
	"client_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposal" ADD COLUMN "widget" jsonb;--> statement-breakpoint
ALTER TABLE "coupon_token" ADD CONSTRAINT "coupon_token_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_token" ADD CONSTRAINT "coupon_token_proposal_id_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_token" ADD CONSTRAINT "coupon_token_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_response" ADD CONSTRAINT "proposal_response_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_response" ADD CONSTRAINT "proposal_response_proposal_id_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupon_token_proposal_idx" ON "coupon_token" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE INDEX "coupon_token_org_idx" ON "coupon_token" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "coupon_token_status_idx" ON "coupon_token" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "proposal_response_proposal_idx" ON "proposal_response" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE INDEX "proposal_response_org_idx" ON "proposal_response" USING btree ("organization_id","created_at");