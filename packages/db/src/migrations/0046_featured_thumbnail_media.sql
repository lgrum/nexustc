ALTER TABLE "featured_post" ADD COLUMN "thumbnail_media_id" text;--> statement-breakpoint
ALTER TABLE "featured_post" ADD CONSTRAINT "featured_post_thumbnail_media_id_media_id_fk" FOREIGN KEY ("thumbnail_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "featured_post_thumbnail_media_id_idx" ON "featured_post" USING btree ("thumbnail_media_id");
