CREATE TABLE "audits" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"brand_name" text NOT NULL,
	"date_range_start" text NOT NULL,
	"date_range_end" text NOT NULL,
	"health_score" integer,
	"wasted_spend" real,
	"best_cpa" real,
	"worst_cpa" real,
	"top_findings" text,
	"top_priority" text,
	"confidence_level" text,
	"full_output" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_context" (
	"brand_id" text PRIMARY KEY NOT NULL,
	"price_point" text,
	"target_audience" text,
	"winning_patterns" text DEFAULT '[]',
	"failed_approaches" text DEFAULT '[]',
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"stage" text DEFAULT 'scaling' NOT NULL,
	"meta_ad_account_id" text,
	"pixel_id" text,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_contexts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"context_json" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scheduled_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"brand_name" text NOT NULL,
	"frequency" text NOT NULL,
	"cron_expression" text NOT NULL,
	"date_preset" text DEFAULT 'last_30d' NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "strategic_predictions" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"report_id" text,
	"prediction" text NOT NULL,
	"status" text DEFAULT 'pending',
	"data_json" text NOT NULL,
	"verify_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategic_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"report_id" text,
	"recommendation" text NOT NULL,
	"category" text,
	"priority" text,
	"status" text DEFAULT 'pending',
	"data_json" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategic_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"report_type" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"week_number" integer,
	"year" integer,
	"data_json" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategic_running_context" (
	"client_id" text PRIMARY KEY NOT NULL,
	"context_json" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "creative_analysis" DROP CONSTRAINT "creative_analysis_client_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "creative_analysis" ALTER COLUMN "id" SET DATA TYPE text USING "id"::text;--> statement-breakpoint
ALTER TABLE "creative_analysis" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "creative_analysis" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_analysis" ALTER COLUMN "spend" SET DATA TYPE real USING "spend"::real;--> statement-breakpoint
ALTER TABLE "global_patterns" ALTER COLUMN "id" SET DATA TYPE text USING "id"::text;--> statement-breakpoint
ALTER TABLE "global_patterns" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "global_patterns" ALTER COLUMN "confidence" SET DATA TYPE real USING "confidence"::real;--> statement-breakpoint
ALTER TABLE "global_patterns" ALTER COLUMN "source_clients" SET DATA TYPE text USING "source_clients"::text;--> statement-breakpoint
ALTER TABLE "brand_context" ADD CONSTRAINT "brand_context_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_audits" ADD CONSTRAINT "scheduled_audits_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_analysis_client_idx" ON "creative_analysis" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "global_patterns_category_idx" ON "global_patterns" USING btree ("category");--> statement-breakpoint
CREATE INDEX "global_patterns_confidence_idx" ON "global_patterns" USING btree ("confidence" DESC NULLS LAST);