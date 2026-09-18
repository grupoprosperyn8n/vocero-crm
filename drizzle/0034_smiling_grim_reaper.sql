CREATE TABLE "dashboard_action" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"source" text DEFAULT 'ficha' NOT NULL,
	"play_id" text,
	"module" text,
	"contact_id" text,
	"conversation_id" text,
	"client_ref" text,
	"client_name" text,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboard_action" ADD CONSTRAINT "dashboard_action_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_action" ADD CONSTRAINT "dashboard_action_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_action" ADD CONSTRAINT "dashboard_action_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_action" ADD CONSTRAINT "dashboard_action_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboard_action_org_created_idx" ON "dashboard_action" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "dashboard_action_play_idx" ON "dashboard_action" USING btree ("play_id","created_at");
