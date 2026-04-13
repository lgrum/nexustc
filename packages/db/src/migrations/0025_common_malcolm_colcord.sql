CREATE TABLE "creator" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "creator_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "creator_id" text;--> statement-breakpoint
ALTER TABLE "creator" ADD CONSTRAINT "creator_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_media_id_idx" ON "creator" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "creator_name_idx" ON "creator" USING btree ("name");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_creator_id_creator_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_creator_id_idx" ON "post" USING btree ("creator_id");