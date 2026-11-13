CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"email" text,
	"user_id" text,
	"visitor_id" text NOT NULL,
	"device" text,
	"page" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_time" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feedback_visitor" ON "feedback" USING btree ("visitor_id","created_at");