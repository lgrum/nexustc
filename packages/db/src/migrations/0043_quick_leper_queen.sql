ALTER TABLE "creator" DROP CONSTRAINT "creator_media_id_media_id_fk";
--> statement-breakpoint
ALTER TABLE "creator" ALTER COLUMN "media_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "creator" ADD CONSTRAINT "creator_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;