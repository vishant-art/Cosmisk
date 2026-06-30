ALTER TABLE "studio_generations" ADD COLUMN "ai_job_id" text;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "stage" text;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "progress_json" text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "brand_kit_json" text;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "winners_json" text;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "cost_cents" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "studio_generations" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "studio_outputs" ADD COLUMN "asset_url" text;