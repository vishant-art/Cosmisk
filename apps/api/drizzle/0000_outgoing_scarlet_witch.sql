CREATE TABLE "activity_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"details" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_core_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_type" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_core_memory_unq" UNIQUE("user_id","agent_type","key")
);
--> statement-breakpoint
CREATE TABLE "agent_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text,
	"type" text NOT NULL,
	"target_id" text,
	"target_name" text,
	"reasoning" text NOT NULL,
	"confidence" text DEFAULT 'moderate' NOT NULL,
	"urgency" text DEFAULT 'medium' NOT NULL,
	"suggested_action" text NOT NULL,
	"estimated_impact" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"outcome_checked_at" timestamp with time zone,
	"outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_entities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_name" text NOT NULL,
	"attributes" text,
	"mention_count" integer DEFAULT 1 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_entities_unq" UNIQUE("user_id","entity_type","entity_name")
);
--> statement-breakpoint
CREATE TABLE "agent_episodes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_type" text NOT NULL,
	"event" text NOT NULL,
	"context" text,
	"outcome" text,
	"entities" text,
	"relevance_score" real DEFAULT 1 NOT NULL,
	"reinforcement_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"agent_type" text NOT NULL,
	"recommendation_type" text NOT NULL,
	"recommendation_data" text NOT NULL,
	"delivered_via" text,
	"delivered_at" timestamp with time zone,
	"outcome_status" text DEFAULT 'pending',
	"outcome_data" text,
	"outcome_recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_type" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"summary" text,
	"raw_context" text
);
--> statement-breakpoint
CREATE TABLE "automations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text,
	"name" text NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_value" text,
	"action_type" text NOT NULL,
	"action_value" text,
	"is_active" integer DEFAULT 1 NOT NULL,
	"last_triggered" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autopilot_alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"read" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text,
	"name" text NOT NULL,
	"objective" text,
	"budget" text,
	"schedule_start" timestamp with time zone,
	"schedule_end" timestamp with time zone,
	"audience" text,
	"placements" text,
	"creative_ids" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classified_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"text" text NOT NULL,
	"category" text NOT NULL,
	"emotional_triggers" text DEFAULT '[]',
	"key_phrases" text DEFAULT '[]',
	"intensity" text DEFAULT 'low',
	"creative_relevance" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"report_type" text NOT NULL,
	"report_data" text NOT NULL,
	"html_path" text,
	"delivered_via" text,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_mining_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"report" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_intel_store" (
	"client_id" text PRIMARY KEY NOT NULL,
	"references_shown" text DEFAULT '[]',
	"outcomes" text DEFAULT '{}',
	"client_creative_style" text,
	"search_queries_used" text DEFAULT '[]',
	"last_scrape_at" timestamp with time zone,
	"last_report_at" timestamp with time zone,
	"total_references_given" integer DEFAULT 0,
	"successful_adoptions" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "competitor_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"competitor_name" text NOT NULL,
	"competitor_id" text,
	"movement_type" text NOT NULL,
	"description" text NOT NULL,
	"significance" text NOT NULL,
	"evidence" text DEFAULT '[]',
	"implications" text DEFAULT '[]',
	"suggested_response" text,
	"response_urgency" text DEFAULT 'monitor',
	"first_mover_window" text,
	"acknowledged" integer DEFAULT 0,
	"response_action" text
);
--> statement-breakpoint
CREATE TABLE "competitor_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"competitor_name" text NOT NULL,
	"competitor_id" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active_ads" integer DEFAULT 0,
	"estimated_spend" real,
	"top_formats" text DEFAULT '[]',
	"top_angles" text DEFAULT '[]',
	"offers" text DEFAULT '[]',
	"new_creatives" integer DEFAULT 0,
	"killed_creatives" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "content_bank" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"content_type" text DEFAULT 'post' NOT NULL,
	"title" text,
	"body" text NOT NULL,
	"hashtags" text,
	"media_notes" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"source" text DEFAULT 'ai',
	"generation_context" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cost_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sprint_id" text,
	"job_id" text,
	"api_provider" text NOT NULL,
	"operation" text NOT NULL,
	"cost_cents" integer NOT NULL,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creative_agent_store" (
	"client_id" text PRIMARY KEY NOT NULL,
	"winning_hooks" text DEFAULT '[]',
	"fatigued_creatives" text DEFAULT '[]',
	"format_performance" text DEFAULT '{}',
	"hook_performance" text DEFAULT '{}',
	"last_analysis_at" timestamp with time zone,
	"creative_count_analyzed" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "creative_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"ad_id" text,
	"ad_name" text,
	"creative_type" text,
	"hook_text" text,
	"hook_pattern" text,
	"ctr" real,
	"spend" numeric(12, 2),
	"impressions" integer,
	"image_url" text,
	"video_id" text,
	"analyzed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creative_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text,
	"sprint_id" text,
	"user_id" text NOT NULL,
	"account_id" text,
	"format" text NOT NULL,
	"name" text NOT NULL,
	"asset_url" text NOT NULL,
	"thumbnail_url" text,
	"meta_ad_id" text,
	"meta_campaign_id" text,
	"dna_tags" text,
	"predicted_score" real,
	"actual_metrics" text,
	"metrics_fetched_at" timestamp with time zone,
	"status" text DEFAULT 'draft',
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creative_briefs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"product_name" text NOT NULL,
	"product_id" text,
	"format" text NOT NULL,
	"length" text,
	"hook_suggestion" text NOT NULL,
	"cta_suggestion" text,
	"reasoning" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_category_knowledge" (
	"category" text PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"aesthetic_patterns" text DEFAULT '[]',
	"typography_patterns" text DEFAULT '[]',
	"hook_patterns" text DEFAULT '[]',
	"emotional_triggers" text DEFAULT '[]',
	"pricing_psychology" text DEFAULT '{}',
	"trust_structures" text DEFAULT '[]',
	"visual_hierarchy" text DEFAULT '[]',
	"benchmark_brands" text DEFAULT '[]',
	"anti_patterns" text DEFAULT '[]'
);
--> statement-breakpoint
CREATE TABLE "creative_evolution" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dimension" text NOT NULL,
	"previous_state" text,
	"new_state" text,
	"trigger_signals" text DEFAULT '[]',
	"confidence" real DEFAULT 0,
	"applied" integer DEFAULT 0,
	"outcome" text
);
--> statement-breakpoint
CREATE TABLE "creative_intelligence_context" (
	"client_id" text PRIMARY KEY NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	"fatigue_signals" text DEFAULT '{}',
	"ltv_signals" text DEFAULT '{}',
	"cohort_signals" text DEFAULT '{}',
	"competitor_signals" text DEFAULT '{}',
	"audience_signals" text DEFAULT '{}',
	"retention_signals" text DEFAULT '{}',
	"emotional_signals" text DEFAULT '{}',
	"pricing_signals" text DEFAULT '{}',
	"product_signals" text DEFAULT '{}',
	"performance_signals" text DEFAULT '{}',
	"synthesis_output" text DEFAULT '{}',
	"next_creative_recommendation" text
);
--> statement-breakpoint
CREATE TABLE "creative_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"sprint_id" text NOT NULL,
	"user_id" text NOT NULL,
	"format" text NOT NULL,
	"status" text DEFAULT 'pending',
	"priority" integer DEFAULT 0,
	"script" text,
	"api_provider" text,
	"api_job_id" text,
	"output_url" text,
	"output_thumbnail" text,
	"predicted_score" real,
	"dna_tags" text,
	"cost_cents" integer DEFAULT 0,
	"error_message" text,
	"retry_count" integer DEFAULT 0,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "creative_quality_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"creative_id" text NOT NULL,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sophistication_score" real DEFAULT 0,
	"typography_score" real DEFAULT 0,
	"emotional_impact_score" real DEFAULT 0,
	"brand_consistency_score" real DEFAULT 0,
	"ai_artifact_score" real DEFAULT 0,
	"layout_intelligence_score" real DEFAULT 0,
	"competitor_benchmark_score" real DEFAULT 0,
	"overall_quality_score" real DEFAULT 0,
	"auto_rejected" integer DEFAULT 0,
	"rejection_reasons" text DEFAULT '[]',
	"benchmark_creative_ids" text DEFAULT '[]',
	"human_override" integer DEFAULT 0,
	"human_score" real
);
--> statement-breakpoint
CREATE TABLE "creative_returns" (
	"client_id" text NOT NULL,
	"creative_id" text NOT NULL,
	"creative_name" text,
	"return_rate" real,
	"refund_amount" real,
	"order_count" integer,
	CONSTRAINT "creative_returns_unq" UNIQUE("client_id","creative_id")
);
--> statement-breakpoint
CREATE TABLE "creative_sprints" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text,
	"name" text NOT NULL,
	"status" text DEFAULT 'analyzing' NOT NULL,
	"plan" text,
	"learn_snapshot" text,
	"total_creatives" integer DEFAULT 0,
	"completed_creatives" integer DEFAULT 0,
	"failed_creatives" integer DEFAULT 0,
	"estimated_cost_cents" integer DEFAULT 0,
	"actual_cost_cents" integer DEFAULT 0,
	"currency" text DEFAULT 'USD',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_metrics" (
	"client_id" text NOT NULL,
	"metric_name" text NOT NULL,
	"value" real NOT NULL,
	"date" timestamp NOT NULL,
	CONSTRAINT "daily_metrics_unq" UNIQUE("client_id","metric_name","date")
);
--> statement-breakpoint
CREATE TABLE "decision_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"decision_id" text,
	"steps" jsonb,
	"evidence" jsonb,
	"alternatives" jsonb,
	"final_action" text,
	"final_target" text,
	"final_confidence" real,
	"final_reasoning" text,
	"total_duration" integer,
	"data_sources" jsonb,
	"synthesis_depth" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "discount_agent_store" (
	"client_id" text PRIMARY KEY NOT NULL,
	"active_codes" text DEFAULT '[]',
	"leaked_codes" text DEFAULT '[]',
	"coupon_sites_checked" text DEFAULT '[]',
	"margin_impact_total" real DEFAULT 0,
	"last_scan_at" timestamp with time zone,
	"alerts_sent" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "dna_cache" (
	"ad_id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"ad_name" text,
	"hook" text DEFAULT '[]' NOT NULL,
	"visual" text DEFAULT '[]' NOT NULL,
	"audio" text DEFAULT '[]' NOT NULL,
	"reasoning" text,
	"analyzed_at" timestamp with time zone DEFAULT now(),
	"visual_analysis" text DEFAULT '{}'
);
--> statement-breakpoint
CREATE TABLE "entity_state_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"state_json" text NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_metrics" (
	"date" timestamp NOT NULL,
	"client_id" text NOT NULL,
	"decisions_generated" integer,
	"decisions_passed" integer,
	"decisions_filtered" integer,
	"avg_confidence" real,
	"contradictions_detected" integer,
	"human_reviews_created" integer,
	"human_reviews_resolved" integer,
	"human_reviews_pending" integer,
	"predictions_generated" integer,
	"predictions_verified" integer,
	"predictions_correct" integer,
	"prediction_accuracy_rate" real,
	"filter_rate" real,
	"evidence_quality_avg" real,
	"synthesis_depth_avg" real,
	"avg_decision_time" real,
	CONSTRAINT "evaluation_metrics_date_client_id_pk" PRIMARY KEY("date","client_id")
);
--> statement-breakpoint
CREATE TABLE "global_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern" text NOT NULL,
	"category" text NOT NULL,
	"confidence" numeric NOT NULL,
	"source_client_count" integer DEFAULT 1 NOT NULL,
	"source_clients" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "global_patterns_pattern_category_unq" UNIQUE("pattern","category")
);
--> statement-breakpoint
CREATE TABLE "google_tokens" (
	"user_id" text PRIMARY KEY NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"customer_ids" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"type" text,
	"title" text,
	"description" text,
	"severity" text,
	"related_entity_id" text,
	"related_entity_type" text,
	"status" text DEFAULT 'pending',
	"resolution" text,
	"reviewed_by" text DEFAULT 'system',
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intelligence_metrics" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"period" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recommendation_usefulness" real DEFAULT 0,
	"strategic_accuracy" real DEFAULT 0,
	"operator_trust" real DEFAULT 0,
	"wow_factor_score" real DEFAULT 0,
	"insight_uniqueness" real DEFAULT 0,
	"prediction_usefulness" real DEFAULT 0,
	"execution_leverage" real DEFAULT 0,
	"decision_quality_improvement" real DEFAULT 0,
	"insight_adoption_rate" real DEFAULT 0,
	"recommendation_follow_through" real DEFAULT 0,
	"decision_speed_improvement" real DEFAULT 0,
	"creative_hit_rate_improvement" real DEFAULT 0,
	"overall_score" real DEFAULT 0,
	"trend" text DEFAULT 'stable',
	"risk_flags" text DEFAULT '[]'
);
--> statement-breakpoint
CREATE TABLE "intelligence_predictions" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prediction" text NOT NULL,
	"predicted_outcome" text NOT NULL,
	"predicted_value" real,
	"confidence" real NOT NULL,
	"timeframe" text NOT NULL,
	"evidence_used" text DEFAULT '[]',
	"insight_type" text NOT NULL,
	"verification_date" timestamp with time zone,
	"actual_outcome" text,
	"actual_value" real,
	"was_accurate" integer,
	"accuracy_score" real,
	"action_taken" text
);
--> statement-breakpoint
CREATE TABLE "intelligence_recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text NOT NULL,
	"headline" text NOT NULL,
	"recommendation" text NOT NULL,
	"confidence" real NOT NULL,
	"urgency" text NOT NULL,
	"was_viewed" integer DEFAULT 0,
	"viewed_at" timestamp with time zone,
	"was_acted_upon" integer DEFAULT 0,
	"acted_upon_at" timestamp with time zone,
	"action_taken" text,
	"outcome_tracked" integer DEFAULT 0,
	"outcome_positive" integer,
	"outcome_notes" text,
	"operator_rating" integer,
	"operator_feedback" text,
	"marked_as_obvious" integer DEFAULT 0,
	"marked_as_useless" integer DEFAULT 0,
	"marked_as_non_obvious" integer DEFAULT 0,
	"validated_at" timestamp with time zone,
	"validation_score" real
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"source" text DEFAULT 'hero' NOT NULL,
	"ip" text,
	"user_agent" text,
	"referrer" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ltv_by_creative" (
	"client_id" text NOT NULL,
	"creative_id" text NOT NULL,
	"creative_name" text,
	"hook_type" text,
	"avg_ltv" real,
	"repeat_rate" real,
	"customer_count" integer,
	CONSTRAINT "ltv_by_creative_unq" UNIQUE("client_id","creative_id")
);
--> statement-breakpoint
CREATE TABLE "meta_tokens" (
	"user_id" text PRIMARY KEY NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"meta_user_id" text,
	"meta_user_name" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oos_agent_store" (
	"client_id" text PRIMARY KEY NOT NULL,
	"product_catalog_hash" text,
	"last_check_at" timestamp with time zone,
	"known_oos_products" text DEFAULT '[]',
	"cumulative_waste" real DEFAULT 0,
	"alerts_sent" integer DEFAULT 0,
	"last_alert_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operator_behavior" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"operator_id" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"context" text NOT NULL,
	"item_id" text,
	"item_type" text,
	"action" text,
	"duration" integer,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "operator_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"recommendation_id" text NOT NULL,
	"client_id" text NOT NULL,
	"operator_id" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rating" integer NOT NULL,
	"rating_dimensions" text,
	"feedback_type" text NOT NULL,
	"freeform_feedback" text,
	"operator_correction" text,
	"operator_alternative" text,
	"disagreed_with" text,
	"disagreement_reason" text,
	"should_have_known" integer DEFAULT 0,
	"already_did_this" integer DEFAULT 0,
	"will_try_this" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "operator_profiles" (
	"operator_id" text NOT NULL,
	"client_id" text NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	"preferred_times" text DEFAULT '[]',
	"avg_session_duration" real DEFAULT 0,
	"sessions_per_week" real DEFAULT 0,
	"preferred_insight_types" text DEFAULT '[]',
	"ignored_insight_types" text DEFAULT '[]',
	"preferred_detail_level" text DEFAULT 'summary',
	"urgency_threshold" text DEFAULT 'all',
	"avg_decision_time" real DEFAULT 0,
	"action_rate" real DEFAULT 0,
	"feedback_rate" real DEFAULT 0,
	"learning_velocity" text DEFAULT 'moderate',
	"trust_level" text DEFAULT 'growing',
	"should_simplify" integer DEFAULT 0,
	"wants_more_detail" integer DEFAULT 0,
	"prefers_visual" integer DEFAULT 0,
	"needs_urgency" integer DEFAULT 0,
	CONSTRAINT "operator_profiles_operator_id_client_id_pk" PRIMARY KEY("operator_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pattern_store" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"type" text,
	"content" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prediction_accuracy" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"recommendation_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"predicted_value" real NOT NULL,
	"actual_value" real NOT NULL,
	"accuracy_score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"type" text,
	"prediction_text" text,
	"confidence" real,
	"timeframe" text,
	"expected_metric" text,
	"expected_direction" text,
	"expected_min_change" real,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'pending',
	"verified_at" timestamp with time zone,
	"actual_value" real,
	"actual_change" real,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_name" text NOT NULL,
	"action" text NOT NULL,
	"reasoning" text NOT NULL,
	"evidence" text DEFAULT '[]',
	"confidence" integer DEFAULT 50 NOT NULL,
	"predicted_outcome" text NOT NULL,
	"predicted_metric" text NOT NULL,
	"predicted_value" real NOT NULL,
	"predicted_direction" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"executed_at" timestamp with time zone,
	"validated_at" timestamp with time zone,
	"actual_outcome" text,
	"actual_value" real,
	"prediction_accurate" integer,
	"accuracy_score" integer
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'performance' NOT NULL,
	"account_id" text,
	"date_preset" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"data" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "score_predictions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"studio_output_id" text,
	"format" text NOT NULL,
	"dna_tags" text,
	"predicted_score" real NOT NULL,
	"predicted_roas_mid" real,
	"score_breakdown" text NOT NULL,
	"confidence" text NOT NULL,
	"actual_roas" real,
	"actual_ctr" real,
	"accuracy_error" real,
	"created_at" timestamp with time zone DEFAULT now(),
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_name" text NOT NULL,
	"category" text,
	"revenue_level" text,
	"price_point_min" integer,
	"price_point_max" integer,
	"meta_ad_account_id" text,
	"shopify_store" text,
	"slack_channel" text,
	"whatsapp_number" text,
	"alert_threshold" integer DEFAULT 1000,
	"service_tier" text DEFAULT 'done_for_you',
	"contract_start" timestamp with time zone,
	"contract_end" timestamp with time zone,
	"monthly_fee" integer,
	"status" text DEFAULT 'active',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopify_tokens" (
	"user_id" text PRIMARY KEY NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"shop_domain" text NOT NULL,
	"shop_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"brief_json" text NOT NULL,
	"formats" text NOT NULL,
	"meta_account_id" text,
	"status" text DEFAULT 'generating' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_outputs" (
	"id" text PRIMARY KEY NOT NULL,
	"generation_id" text NOT NULL,
	"format" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"output_json" text,
	"cost_cents" integer DEFAULT 0,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"score_json" text
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"gateway" text DEFAULT 'stripe',
	"razorpay_subscription_id" text,
	"razorpay_customer_id" text,
	"trial_ends_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "swipe_file" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"brand" text DEFAULT '' NOT NULL,
	"thumbnail" text,
	"hook_dna" text DEFAULT '[]' NOT NULL,
	"visual_dna" text DEFAULT '[]' NOT NULL,
	"audio_dna" text DEFAULT '[]' NOT NULL,
	"notes" text,
	"source_url" text,
	"source_ad_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"team_member_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"member_user_id" text,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tiktok_tokens" (
	"user_id" text PRIMARY KEY NOT NULL,
	"encrypted_access_token" text NOT NULL,
	"advertiser_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ugc_concepts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ugc_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"brand_name" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"brief" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ugc_scripts" (
	"id" text PRIMARY KEY NOT NULL,
	"concept_id" text NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "url_analysis_cache" (
	"url" text PRIMARY KEY NOT NULL,
	"result_json" text NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"period" text NOT NULL,
	"chat_count" integer DEFAULT 0 NOT NULL,
	"image_count" integer DEFAULT 0 NOT NULL,
	"video_count" integer DEFAULT 0 NOT NULL,
	"creative_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "user_usage_user_period_unq" UNIQUE("user_id","period")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"onboarding_complete" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"brand_name" text,
	"website_url" text,
	"goals" text,
	"competitors" text,
	"active_brand" text,
	"phone" text,
	"notification_preferences" text DEFAULT '{}',
	"timezone" text DEFAULT 'IST',
	"language" text DEFAULT 'en',
	"currency" text DEFAULT 'INR',
	"date_format" text DEFAULT 'DD/MM/YYYY',
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "agent_core_memory" ADD CONSTRAINT "agent_core_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_decisions" ADD CONSTRAINT "agent_decisions_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_decisions" ADD CONSTRAINT "agent_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_entities" ADD CONSTRAINT "agent_entities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_episodes" ADD CONSTRAINT "agent_episodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD CONSTRAINT "agent_recommendations_client_id_service_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."service_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopilot_alerts" ADD CONSTRAINT "autopilot_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_reports" ADD CONSTRAINT "client_reports_client_id_service_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."service_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_intel_store" ADD CONSTRAINT "competitor_intel_store_client_id_service_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."service_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_bank" ADD CONSTRAINT "content_bank_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_agent_store" ADD CONSTRAINT "creative_agent_store_client_id_service_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."service_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_analysis" ADD CONSTRAINT "creative_analysis_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_job_id_creative_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."creative_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_briefs" ADD CONSTRAINT "creative_briefs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_jobs" ADD CONSTRAINT "creative_jobs_sprint_id_creative_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."creative_sprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_returns" ADD CONSTRAINT "creative_returns_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_sprints" ADD CONSTRAINT "creative_sprints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_metrics" ADD CONSTRAINT "daily_metrics_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_traces" ADD CONSTRAINT "decision_traces_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_agent_store" ADD CONSTRAINT "discount_agent_store_client_id_service_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."service_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_metrics" ADD CONSTRAINT "evaluation_metrics_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_tokens" ADD CONSTRAINT "google_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_reviews" ADD CONSTRAINT "human_reviews_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ltv_by_creative" ADD CONSTRAINT "ltv_by_creative_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_tokens" ADD CONSTRAINT "meta_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oos_agent_store" ADD CONSTRAINT "oos_agent_store_client_id_service_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."service_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pattern_store" ADD CONSTRAINT "pattern_store_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_client_id_users_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_tokens" ADD CONSTRAINT "shopify_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_outputs" ADD CONSTRAINT "studio_outputs_generation_id_studio_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."studio_generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swipe_file" ADD CONSTRAINT "swipe_file_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tiktok_tokens" ADD CONSTRAINT "tiktok_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_concepts" ADD CONSTRAINT "ugc_concepts_project_id_ugc_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."ugc_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_projects" ADD CONSTRAINT "ugc_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_scripts" ADD CONSTRAINT "ugc_scripts_concept_id_ugc_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."ugc_concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_scripts" ADD CONSTRAINT "ugc_scripts_project_id_ugc_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."ugc_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_usage" ADD CONSTRAINT "user_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_user_idx" ON "activity_log" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "agent_decisions_run_idx" ON "agent_decisions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_decisions_user_idx" ON "agent_decisions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "agent_entities_user_idx" ON "agent_entities" USING btree ("user_id","entity_type");--> statement-breakpoint
CREATE INDEX "agent_episodes_user_idx" ON "agent_episodes" USING btree ("user_id","agent_type");--> statement-breakpoint
CREATE INDEX "agent_recommendations_client_idx" ON "agent_recommendations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "agent_recommendations_agent_idx" ON "agent_recommendations" USING btree ("agent_type");--> statement-breakpoint
CREATE INDEX "agent_recommendations_pending_idx" ON "agent_recommendations" USING btree ("outcome_status") WHERE outcome_status = 'pending';--> statement-breakpoint
CREATE INDEX "agent_runs_user_idx" ON "agent_runs" USING btree ("user_id","agent_type");--> statement-breakpoint
CREATE INDEX "classified_comments_client_idx" ON "classified_comments" USING btree ("client_id","category");--> statement-breakpoint
CREATE INDEX "client_reports_client_idx" ON "client_reports" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "comment_mining_reports_client_idx" ON "comment_mining_reports" USING btree ("client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "competitor_movements_client_idx" ON "competitor_movements" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "competitor_movements_unack_idx" ON "competitor_movements" USING btree ("acknowledged") WHERE acknowledged = 0;--> statement-breakpoint
CREATE INDEX "competitor_snapshots_client_idx" ON "competitor_snapshots" USING btree ("client_id","competitor_name");--> statement-breakpoint
CREATE INDEX "content_bank_user_idx" ON "content_bank" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "content_bank_platform_idx" ON "content_bank" USING btree ("user_id","platform");--> statement-breakpoint
CREATE INDEX "creative_briefs_user_idx" ON "creative_briefs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "creative_briefs_account_idx" ON "creative_briefs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "creative_evolution_client_idx" ON "creative_evolution" USING btree ("client_id","dimension");--> statement-breakpoint
CREATE INDEX "creative_jobs_sprint_idx" ON "creative_jobs" USING btree ("sprint_id");--> statement-breakpoint
CREATE INDEX "creative_jobs_status_idx" ON "creative_jobs" USING btree ("status","priority" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "creative_quality_scores_client_idx" ON "creative_quality_scores" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "creative_quality_scores_creative_idx" ON "creative_quality_scores" USING btree ("creative_id");--> statement-breakpoint
CREATE INDEX "dna_cache_account_idx" ON "dna_cache" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "entity_state_snapshots_idx" ON "entity_state_snapshots" USING btree ("client_id","entity_id");--> statement-breakpoint
CREATE INDEX "intelligence_metrics_client_idx" ON "intelligence_metrics" USING btree ("client_id","period");--> statement-breakpoint
CREATE INDEX "intelligence_predictions_client_idx" ON "intelligence_predictions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "intelligence_predictions_unverified_idx" ON "intelligence_predictions" USING btree ("verification_date") WHERE verification_date IS NULL;--> statement-breakpoint
CREATE INDEX "intelligence_recommendations_client_idx" ON "intelligence_recommendations" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "intelligence_recommendations_unviewed_idx" ON "intelligence_recommendations" USING btree ("was_viewed") WHERE was_viewed = 0;--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "operator_behavior_operator_idx" ON "operator_behavior" USING btree ("client_id","operator_id");--> statement-breakpoint
CREATE INDEX "operator_behavior_type_idx" ON "operator_behavior" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "operator_feedback_client_idx" ON "operator_feedback" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "operator_feedback_recommendation_idx" ON "operator_feedback" USING btree ("recommendation_id");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_hash_idx" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "prediction_accuracy_agent_idx" ON "prediction_accuracy" USING btree ("client_id","agent_id");--> statement-breakpoint
CREATE INDEX "prediction_accuracy_type_idx" ON "prediction_accuracy" USING btree ("recommendation_type");--> statement-breakpoint
CREATE INDEX "recommendations_client_idx" ON "recommendations" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "recommendations_entity_idx" ON "recommendations" USING btree ("entity_id","status");--> statement-breakpoint
CREATE INDEX "recommendations_pending_idx" ON "recommendations" USING btree ("status") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "recommendations_validation_idx" ON "recommendations" USING btree ("status","executed_at") WHERE status = 'executed';--> statement-breakpoint
CREATE INDEX "score_predictions_user_idx" ON "score_predictions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "score_predictions_unresolved_idx" ON "score_predictions" USING btree ("resolved_at") WHERE resolved_at IS NULL;--> statement-breakpoint
CREATE INDEX "service_clients_status_idx" ON "service_clients" USING btree ("status");--> statement-breakpoint
CREATE INDEX "studio_outputs_gen_idx" ON "studio_outputs" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "swipe_file_user_idx" ON "swipe_file" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_invitations_token_idx" ON "team_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_owner_email_idx" ON "team_members" USING btree ("owner_user_id","email");--> statement-breakpoint
CREATE INDEX "team_members_member_idx" ON "team_members" USING btree ("member_user_id");