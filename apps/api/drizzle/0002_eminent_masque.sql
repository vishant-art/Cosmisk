CREATE TABLE "waitlist_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"company" text,
	"role" text,
	"ad_spend" text,
	"team_size" text,
	"pain_points" text,
	"interested_features" text,
	"source" text DEFAULT 'waitlist',
	"referrer" text,
	"signed_up_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "waitlist_leads_email_unique" UNIQUE("email")
);
