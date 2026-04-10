CREATE TABLE "media_folder" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"parent_id" text
);
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "folder_id" text;--> statement-breakpoint
ALTER TABLE "media_folder" ADD CONSTRAINT "media_folder_parent_id_media_folder_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_folder_name_idx" ON "media_folder" USING btree ("name");--> statement-breakpoint
CREATE INDEX "media_folder_parent_id_idx" ON "media_folder" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_folder_id_media_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_folder_id_idx" ON "media" USING btree ("folder_id");