ALTER TABLE "emoji" ADD COLUMN "media_id" text;--> statement-breakpoint
ALTER TABLE "sticker" ADD COLUMN "media_id" text;--> statement-breakpoint

INSERT INTO "media" ("id", "object_key")
SELECT
  md5("legacy_assets"."asset_key"),
  "legacy_assets"."asset_key"
FROM (
  SELECT "asset_key" FROM "emoji" WHERE "asset_key" IS NOT NULL
  UNION
  SELECT "asset_key" FROM "sticker" WHERE "asset_key" IS NOT NULL
) AS "legacy_assets"
WHERE NOT EXISTS (
  SELECT 1
  FROM "media"
  WHERE "media"."object_key" = "legacy_assets"."asset_key"
);--> statement-breakpoint

UPDATE "emoji"
SET "media_id" = "media"."id"
FROM "media"
WHERE "media"."object_key" = "emoji"."asset_key";--> statement-breakpoint

UPDATE "sticker"
SET "media_id" = "media"."id"
FROM "media"
WHERE "media"."object_key" = "sticker"."asset_key";--> statement-breakpoint

ALTER TABLE "emoji" ADD CONSTRAINT "emoji_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sticker" ADD CONSTRAINT "sticker_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emoji_media_id_idx" ON "emoji" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "sticker_media_id_idx" ON "sticker" USING btree ("media_id");
