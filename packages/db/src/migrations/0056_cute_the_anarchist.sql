ALTER TABLE "post_rating" ADD COLUMN "id" text;--> statement-breakpoint
UPDATE "post_rating"
SET "id" = concat(
	'legacy:',
	length("user_id"),
	':',
	"user_id",
	':',
	"post_id"
);--> statement-breakpoint
ALTER TABLE "post_rating" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "post_rating" ADD CONSTRAINT "post_rating_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "post_rating_like" ADD COLUMN "rating_id" text;--> statement-breakpoint
UPDATE "post_rating_like" AS "likes"
SET "rating_id" = "rating"."id"
FROM "post_rating" AS "rating"
WHERE "likes"."post_id" = "rating"."post_id"
	AND "likes"."rating_user_id" = "rating"."user_id";--> statement-breakpoint
DELETE FROM "post_rating_like" WHERE "rating_id" IS NULL;--> statement-breakpoint
ALTER TABLE "post_rating_like" ALTER COLUMN "rating_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "post_rating_like_rating_idx";--> statement-breakpoint
ALTER TABLE "post_rating_like" DROP CONSTRAINT "post_rating_like_user_id_rating_user_id_post_id_pk";--> statement-breakpoint
ALTER TABLE "post_rating_like" ADD CONSTRAINT "post_rating_like_user_id_rating_id_pk" PRIMARY KEY("user_id","rating_id");--> statement-breakpoint
ALTER TABLE "post_rating_like" ADD CONSTRAINT "post_rating_like_rating_id_post_rating_id_fk" FOREIGN KEY ("rating_id") REFERENCES "public"."post_rating"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_rating_like_rating_id_idx" ON "post_rating_like" USING btree ("rating_id");--> statement-breakpoint
ALTER TABLE "post_rating_like" DROP COLUMN "post_id";--> statement-breakpoint
ALTER TABLE "post_rating_like" DROP COLUMN "rating_user_id";
