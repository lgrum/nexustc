ALTER TABLE "post" ALTER COLUMN "updated_at" DROP NOT NULL;--> statement-breakpoint
UPDATE "post" SET "updated_at" = NULL;
