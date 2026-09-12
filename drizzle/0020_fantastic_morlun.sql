CREATE TABLE "chat_message" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"room_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_room" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_room_member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"room_id" text NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp DEFAULT now() NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_room_id_chat_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room" ADD CONSTRAINT "chat_room_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room" ADD CONSTRAINT "chat_room_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_member" ADD CONSTRAINT "chat_room_member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_member" ADD CONSTRAINT "chat_room_member_room_id_chat_room_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_member" ADD CONSTRAINT "chat_room_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_message_org_idx" ON "chat_message" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "chat_message_room_created_idx" ON "chat_message" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_room_org_idx" ON "chat_room" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_room_member_uq" ON "chat_room_member" USING btree ("room_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_room_member_org_user_idx" ON "chat_room_member" USING btree ("organization_id","user_id");