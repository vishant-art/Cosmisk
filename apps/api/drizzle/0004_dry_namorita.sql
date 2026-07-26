CREATE TABLE "ai_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"prompt_text" text,
	"response_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_feedback_user_id_kind_ref_id_unique" UNIQUE("user_id","kind","ref_id")
);
--> statement-breakpoint
ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;