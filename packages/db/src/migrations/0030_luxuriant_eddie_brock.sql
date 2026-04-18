ALTER TABLE "post" ADD COLUMN "cover_media_id" text;--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_cover_media_id_media_id_fk" FOREIGN KEY ("cover_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_cover_media_id_idx" ON "post" USING btree ("cover_media_id");