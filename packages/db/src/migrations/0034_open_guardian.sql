CREATE TABLE "content_series" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" "post_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "series_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "content_series_type_title_unique" ON "content_series" USING btree ("type","title");--> statement-breakpoint
CREATE INDEX "content_series_type_title_idx" ON "content_series" USING btree ("type","title");--> statement-breakpoint
CREATE INDEX "content_series_title_gin_idx" ON "content_series" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_series_id_content_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."content_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_series_id_order_idx" ON "post" USING btree ("series_id","series_order");