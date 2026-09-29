CREATE TABLE "event" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"visitor_id" text NOT NULL,
	"user_id" text,
	"props" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_time" ON "event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "event_visitor" ON "event" USING btree ("visitor_id");