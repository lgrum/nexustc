CREATE TABLE "user_comic_progress" (
	"comic_id" text NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"last_page_read" integer DEFAULT 0 NOT NULL,
	"last_read_timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"total_pages_at_last_read" integer DEFAULT 0 NOT NULL,
	"user_id" text NOT NULL,
	"verified_through_page" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_comic_progress_user_id_comic_id_pk" PRIMARY KEY("user_id","comic_id")
);
--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "comic_last_update_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "comic_page_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "post"
SET
	"comic_last_update_at" = COALESCE("updated_at", "created_at"),
	"comic_page_count" = CASE
		WHEN "image_object_keys" IS NULL THEN 0
		ELSE jsonb_array_length("image_object_keys")
	END
WHERE "type" = 'comic';--> statement-breakpoint
ALTER TABLE "user_comic_progress" ADD CONSTRAINT "user_comic_progress_comic_id_post_id_fk" FOREIGN KEY ("comic_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_comic_progress" ADD CONSTRAINT "user_comic_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_comic_progress_comic_id_idx" ON "user_comic_progress" USING btree ("comic_id");--> statement-breakpoint
CREATE INDEX "user_comic_progress_user_completed_idx" ON "user_comic_progress" USING btree ("user_id","completed");--> statement-breakpoint
CREATE INDEX "user_comic_progress_user_last_read_idx" ON "user_comic_progress" USING btree ("user_id","last_read_timestamp");
