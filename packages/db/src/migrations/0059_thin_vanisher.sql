ALTER TABLE "user_comic_progress" ADD COLUMN "xp_processed_page_ranges" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "user_comic_progress" ADD COLUMN "xp_tracking_updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "user_comic_progress"
SET
	"xp_processed_page_ranges" = CASE
		WHEN GREATEST(
			"verified_through_page",
			CASE WHEN "completed" THEN "total_pages_at_last_read" ELSE 0 END
		) > 0 THEN jsonb_build_array(
			jsonb_build_array(1, GREATEST(
				"verified_through_page",
				CASE WHEN "completed" THEN "total_pages_at_last_read" ELSE 0 END
			))
		)
		ELSE '[]'::jsonb
	END,
	"xp_tracking_updated_at" = "last_read_timestamp";
