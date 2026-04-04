CREATE TYPE "public"."content_update_type" AS ENUM('game_version', 'comic_pages');--> statement-breakpoint
CREATE TYPE "public"."news_article_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."notification_audience" AS ENUM('broadcast', 'content_followers', 'user');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('global_announcement', 'content_update', 'content_news', 'system');--> statement-breakpoint
CREATE TABLE "content_follower" (
	"content_id" text NOT NULL,
	"content_type" "post_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_notified_at" timestamp with time zone,
	"user_id" text NOT NULL,
	CONSTRAINT "content_follower_user_id_content_id_pk" PRIMARY KEY("user_id","content_id")
);
--> statement-breakpoint
CREATE TABLE "content_update" (
	"content_id" text NOT NULL,
	"current_page_count" integer,
	"current_version" text,
	"dedupe_key" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notification_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pages_added" integer,
	"previous_page_count" integer,
	"previous_version" text,
	"update_type" "content_update_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_article" (
	"author_user_id" text,
	"banner_image_object_key" text,
	"body" text NOT NULL,
	"content_id" text NOT NULL,
	"expiration_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notification_id" text,
	"published_at" timestamp with time zone,
	"status" "news_article_status" DEFAULT 'draft' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"archived_at" timestamp with time zone,
	"collapse_key" text,
	"dedupe_key" text,
	"description" text DEFAULT '' NOT NULL,
	"expiration_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"image_object_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_user_id" text,
	"target_content_id" text,
	"title" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_read" (
	"notification_id" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "notification_read_user_id_notification_id_pk" PRIMARY KEY("user_id","notification_id")
);
--> statement-breakpoint
CREATE TABLE "notification_target" (
	"audience_type" "notification_audience" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"target_content_id" text,
	"target_user_id" text
);
--> statement-breakpoint
ALTER TABLE "content_follower" ADD CONSTRAINT "content_follower_content_id_post_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_follower" ADD CONSTRAINT "content_follower_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_update" ADD CONSTRAINT "content_update_content_id_post_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_update" ADD CONSTRAINT "content_update_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_article" ADD CONSTRAINT "news_article_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_article" ADD CONSTRAINT "news_article_content_id_post_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "news_article" ADD CONSTRAINT "news_article_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_source_user_id_user_id_fk" FOREIGN KEY ("source_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_target_content_id_post_id_fk" FOREIGN KEY ("target_content_id") REFERENCES "public"."post"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_read" ADD CONSTRAINT "notification_read_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_read" ADD CONSTRAINT "notification_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_target" ADD CONSTRAINT "notification_target_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_target" ADD CONSTRAINT "notification_target_target_content_id_post_id_fk" FOREIGN KEY ("target_content_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_target" ADD CONSTRAINT "notification_target_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_follower_content_id_idx" ON "content_follower" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "content_follower_user_created_at_idx" ON "content_follower" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "content_update_content_occurred_idx" ON "content_update" USING btree ("content_id","occurred_at");--> statement-breakpoint
CREATE INDEX "content_update_type_content_idx" ON "content_update" USING btree ("update_type","content_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_update_dedupe_key_idx" ON "content_update" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "content_update_notification_id_idx" ON "content_update" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "news_article_content_published_idx" ON "news_article" USING btree ("content_id","published_at");--> statement-breakpoint
CREATE INDEX "news_article_status_idx" ON "news_article" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "news_article_notification_id_idx" ON "news_article" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_published_at_idx" ON "notification" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "notification_type_idx" ON "notification" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notification_target_content_id_idx" ON "notification" USING btree ("target_content_id");--> statement-breakpoint
CREATE INDEX "notification_collapse_key_idx" ON "notification" USING btree ("collapse_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_dedupe_key_idx" ON "notification" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notification_read_notification_id_idx" ON "notification_read" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_target_notification_id_idx" ON "notification_target" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_target_audience_content_idx" ON "notification_target" USING btree ("audience_type","target_content_id");--> statement-breakpoint
CREATE INDEX "notification_target_audience_user_idx" ON "notification_target" USING btree ("audience_type","target_user_id");