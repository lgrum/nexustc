CREATE TABLE "translator" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "translator_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "translator_id" text;--> statement-breakpoint
CREATE INDEX "translator_name_idx" ON "translator" USING btree ("name");--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_translator_id_translator_id_fk" FOREIGN KEY ("translator_id") REFERENCES "public"."translator"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_translator_id_idx" ON "post" USING btree ("translator_id");