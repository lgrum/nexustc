ALTER TABLE "profile_catalog_decoration_revision" DROP CONSTRAINT "pcdr_media_asset_fk";
--> statement-breakpoint
INSERT INTO "media" ("id", "object_key", "is_animated", "created_at")
SELECT
	'profile-decoration-' || "profile_media_asset"."id",
	"profile_media_asset"."object_key",
	"profile_media_asset"."is_animated",
	"profile_media_asset"."created_at"
FROM "profile_media_asset"
INNER JOIN "profile_catalog_decoration_revision"
	ON "profile_catalog_decoration_revision"."media_asset_id" = "profile_media_asset"."id"
ON CONFLICT ("object_key") DO NOTHING;
--> statement-breakpoint
UPDATE "profile_catalog_decoration_revision"
SET "media_asset_id" = "media"."id"
FROM "profile_media_asset"
INNER JOIN "media"
	ON "media"."object_key" = "profile_media_asset"."object_key"
WHERE "profile_catalog_decoration_revision"."media_asset_id" = "profile_media_asset"."id";
--> statement-breakpoint
ALTER TABLE "profile_catalog_decoration_revision" ADD CONSTRAINT "pcdr_media_asset_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;
