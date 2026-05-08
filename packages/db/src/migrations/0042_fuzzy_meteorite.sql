ALTER TABLE "post" ADD COLUMN "slug" text;--> statement-breakpoint
WITH "slugged_posts" AS (
  SELECT
    "id",
    "type",
    COALESCE(
      NULLIF(
        regexp_replace(
          regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g'),
          '(^-+|-+$)',
          '',
          'g'
        ),
        ''
      ),
      'contenido'
    ) AS "base_slug"
  FROM "post"
),
"ranked_posts" AS (
  SELECT
    "id",
    CASE
      WHEN row_number() OVER (PARTITION BY "type", "base_slug" ORDER BY "id") = 1
        THEN "base_slug"
      ELSE "base_slug" || '--' || row_number() OVER (PARTITION BY "type", "base_slug" ORDER BY "id")
    END AS "slug"
  FROM "slugged_posts"
)
UPDATE "post"
SET "slug" = "ranked_posts"."slug"
FROM "ranked_posts"
WHERE "post"."id" = "ranked_posts"."id";--> statement-breakpoint
ALTER TABLE "post" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "post_type_slug_unique" ON "post" USING btree ("type","slug");--> statement-breakpoint
CREATE INDEX "post_type_slug_idx" ON "post" USING btree ("type","slug");
