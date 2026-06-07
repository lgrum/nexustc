CREATE TABLE "comic_creator" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "comic_creator_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "comic_creator_id" text;--> statement-breakpoint
INSERT INTO "comic_creator" ("id", "name", "url", "created_at", "updated_at")
SELECT DISTINCT ON ("creator"."url")
	"creator"."id",
	"creator"."name",
	"creator"."url",
	"creator"."created_at",
	"creator"."updated_at"
FROM "post"
INNER JOIN "creator" ON "creator"."id" = "post"."creator_id"
WHERE "post"."type" = 'comic'
	AND "post"."creator_id" IS NOT NULL
ORDER BY "creator"."url", "creator"."created_at";--> statement-breakpoint
UPDATE "post"
SET "comic_creator_id" = "comic_creator"."id"
FROM "creator"
INNER JOIN "comic_creator" ON "comic_creator"."url" = "creator"."url"
WHERE "post"."type" = 'comic'
	AND "post"."creator_id" = "creator"."id";--> statement-breakpoint
UPDATE "post"
SET "creator_id" = NULL
WHERE "type" = 'comic';--> statement-breakpoint
CREATE INDEX "comic_creator_name_idx" ON "comic_creator" USING btree ("name");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_comic_creator_id_comic_creator_id_fk" FOREIGN KEY ("comic_creator_id") REFERENCES "public"."comic_creator"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_comic_creator_id_idx" ON "post" USING btree ("comic_creator_id");
