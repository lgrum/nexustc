ALTER TABLE "comment" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post_rating" ADD COLUMN "pinned_at" timestamp with time zone;