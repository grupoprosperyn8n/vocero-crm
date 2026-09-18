CREATE TABLE "proposal" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"token" text NOT NULL,
	"kind" text NOT NULL,
	"client_ref" text NOT NULL,
	"client_name" text NOT NULL,
	"client_dni" text,
	"client_phone" text,
	"title" text DEFAULT '' NOT NULL,
	"subtitle" text,
	"body" text DEFAULT '' NOT NULL,
	"product_name" text,
	"offer" text,
	"benefit" text,
	"company_ref" text,
	"company_name" text,
	"company_asset_id" text,
	"logo_asset_id" text,
	"cta_label" text,
	"cta_url" text,
	"cta_kind" text DEFAULT 'link' NOT NULL,
	"asset_id" text,
	"assignee_user_id" text,
	"priority" text DEFAULT 'media' NOT NULL,
	"derived_at" timestamp,
	"derived_by" text,
	"contact_id" text,
	"conversation_id" text,
	"status" text DEFAULT 'borrador' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"first_view_at" timestamp,
	"last_view_at" timestamp,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "proposal_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "proposal_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"mime" text NOT NULL,
	"filename" text,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"data" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"subtitle" text,
	"body" text DEFAULT '' NOT NULL,
	"product_name" text,
	"offer" text,
	"benefit" text,
	"logo_asset_id" text,
	"cta_label" text,
	"cta_url" text,
	"cta_kind" text DEFAULT 'link' NOT NULL,
	"accent" text,
	"asset_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_company_asset_id_proposal_asset_id_fk" FOREIGN KEY ("company_asset_id") REFERENCES "public"."proposal_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_logo_asset_id_proposal_asset_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."proposal_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_asset_id_proposal_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."proposal_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_assignee_user_id_user_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_derived_by_user_id_fk" FOREIGN KEY ("derived_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_asset" ADD CONSTRAINT "proposal_asset_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_template" ADD CONSTRAINT "proposal_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_template" ADD CONSTRAINT "proposal_template_logo_asset_id_proposal_asset_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."proposal_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_template" ADD CONSTRAINT "proposal_template_asset_id_proposal_asset_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."proposal_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proposal_org_created_idx" ON "proposal" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "proposal_assignee_idx" ON "proposal" USING btree ("assignee_user_id","created_at");--> statement-breakpoint
CREATE INDEX "proposal_client_idx" ON "proposal" USING btree ("client_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_template_org_kind_uq" ON "proposal_template" USING btree ("organization_id","kind");