ALTER TABLE "media" ADD COLUMN "is_animated" boolean;
--> statement-breakpoint
ALTER TABLE "profile_catalog_skin_revision" DROP CONSTRAINT "pcsr_background_asset_fk";
--> statement-breakpoint
ALTER TABLE "profile_catalog_skin_revision" ADD CONSTRAINT "pcsr_background_asset_fk" FOREIGN KEY ("background_asset_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;
