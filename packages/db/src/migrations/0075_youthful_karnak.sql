ALTER TABLE "profile_media_asset" DROP CONSTRAINT "pma_owner_fk";
--> statement-breakpoint
ALTER TABLE "profile_media_asset" ALTER COLUMN "owner_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_media_asset" ADD CONSTRAINT "pma_owner_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;