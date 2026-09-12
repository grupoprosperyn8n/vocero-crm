CREATE TABLE "staff_office_day" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"office_id" text NOT NULL,
	"day" text NOT NULL,
	"selected_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_office_day" ADD CONSTRAINT "staff_office_day_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_office_day" ADD CONSTRAINT "staff_office_day_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_office_day" ADD CONSTRAINT "staff_office_day_office_id_office_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."office"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_office_day_uq" ON "staff_office_day" USING btree ("organization_id","user_id","day");--> statement-breakpoint
CREATE INDEX "staff_office_day_org_day_idx" ON "staff_office_day" USING btree ("organization_id","day");