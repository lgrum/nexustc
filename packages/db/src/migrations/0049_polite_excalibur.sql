CREATE TABLE "comic_upload_session" (
	"comic_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"issued_object_count" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comic_upload_session" ADD CONSTRAINT "comic_upload_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comic_upload_session_expires_at_idx" ON "comic_upload_session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "comic_upload_session_user_id_idx" ON "comic_upload_session" USING btree ("user_id");
