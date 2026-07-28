CREATE TABLE "profile_media_deletion" (
	"object_key" text PRIMARY KEY NOT NULL,
	"retry_after" timestamp with time zone DEFAULT now() NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "profile_media_deletion_retry_idx" ON "profile_media_deletion" USING btree ("retry_after","created_at");