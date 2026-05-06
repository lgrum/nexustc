ALTER TABLE "comment" ADD COLUMN "edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
UPDATE "post" SET "released_at" = "created_at" WHERE "status" = 'publish' AND "released_at" IS NULL;--> statement-breakpoint
CREATE INDEX "post_released_at_idx" ON "post" USING btree ("released_at");
