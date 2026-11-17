CREATE TABLE "public_board" (
	"user_id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"board_name" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_board_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "public_board" ADD CONSTRAINT "public_board_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;