CREATE TYPE "public"."forbidden_content_kind" AS ENUM('term', 'word', 'url');--> statement-breakpoint
CREATE TABLE "comment_like" (
	"comment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "comment_like_user_id_comment_id_pk" PRIMARY KEY("user_id","comment_id")
);
--> statement-breakpoint
CREATE TABLE "forbidden_content_rule" (
	"created_by" text,
	"id" text PRIMARY KEY NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"kind" "forbidden_content_kind" DEFAULT 'term' NOT NULL,
	"normalized_value" text NOT NULL,
	"updated_by" text,
	"value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_rating_like" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"post_id" text NOT NULL,
	"rating_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "post_rating_like_user_id_rating_user_id_post_id_pk" PRIMARY KEY("user_id","rating_user_id","post_id")
);
--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "comment_like" ADD CONSTRAINT "comment_like_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_like" ADD CONSTRAINT "comment_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forbidden_content_rule" ADD CONSTRAINT "forbidden_content_rule_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forbidden_content_rule" ADD CONSTRAINT "forbidden_content_rule_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_rating_like" ADD CONSTRAINT "post_rating_like_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_like_comment_id_idx" ON "comment_like" USING btree ("comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "forbidden_content_rule_kind_normalized_unique" ON "forbidden_content_rule" USING btree ("kind","normalized_value");--> statement-breakpoint
CREATE INDEX "forbidden_content_rule_active_kind_idx" ON "forbidden_content_rule" USING btree ("is_active","kind");--> statement-breakpoint
CREATE INDEX "post_rating_like_rating_idx" ON "post_rating_like" USING btree ("post_id","rating_user_id");--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_id_comment_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_parent_id_idx" ON "comment" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "comment_post_id_parent_id_idx" ON "comment" USING btree ("post_id","parent_id");
