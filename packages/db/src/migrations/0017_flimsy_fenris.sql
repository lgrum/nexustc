CREATE TABLE "media" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"object_key" text NOT NULL,
	CONSTRAINT "media_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "post_media" (
	"media_id" text NOT NULL,
	"post_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "post_media_post_id_media_id_pk" PRIMARY KEY("post_id","media_id")
);
--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "post_media_post_id_sort_order_idx" ON "post_media" USING btree ("post_id","sort_order");--> statement-breakpoint
CREATE INDEX "post_media_media_id_idx" ON "post_media" USING btree ("media_id");--> statement-breakpoint
WITH "expanded_media" AS (
	SELECT
		"image"."object_key",
		MIN("p"."created_at") AS "created_at"
	FROM "post" "p"
	CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE("p"."image_object_keys", '[]'::jsonb))
		WITH ORDINALITY AS "image"("object_key", "sort_order")
	GROUP BY "image"."object_key"
)
INSERT INTO "media" ("id", "object_key", "created_at")
SELECT
	md5("expanded_media"."object_key"),
	"expanded_media"."object_key",
	"expanded_media"."created_at"
FROM "expanded_media"
ON CONFLICT ("object_key") DO NOTHING;--> statement-breakpoint
WITH "expanded_post_media" AS (
	SELECT
		md5("image"."object_key") AS "media_id",
		"p"."id" AS "post_id",
		("image"."sort_order" - 1)::integer AS "sort_order"
	FROM "post" "p"
	CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE("p"."image_object_keys", '[]'::jsonb))
		WITH ORDINALITY AS "image"("object_key", "sort_order")
)
INSERT INTO "post_media" ("media_id", "post_id", "sort_order")
SELECT
	"expanded_post_media"."media_id",
	"expanded_post_media"."post_id",
	"expanded_post_media"."sort_order"
FROM "expanded_post_media"
ON CONFLICT ("post_id", "media_id") DO NOTHING;
