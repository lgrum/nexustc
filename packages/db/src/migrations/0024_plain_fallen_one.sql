CREATE TYPE "public"."engagement_prompt_source" AS ENUM('manual', 'tag');--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "engagement_prompt_id" text;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "engagement_prompt_source" "engagement_prompt_source";--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "engagement_prompt_text" text;