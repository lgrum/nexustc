CREATE TABLE "engagement_question" (
	"id" text PRIMARY KEY NOT NULL,
	"tag_term_id" text,
	"is_global" boolean DEFAULT false NOT NULL,
	"text" text NOT NULL,
	"locale" text DEFAULT 'es' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_engagement_override" (
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"text" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "engagement_question" ADD CONSTRAINT "engagement_question_tag_term_id_term_id_fk" FOREIGN KEY ("tag_term_id") REFERENCES "public"."term"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_engagement_override" ADD CONSTRAINT "post_engagement_override_post_id_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "engagement_question_tag_term_id_idx" ON "engagement_question" USING btree ("tag_term_id");--> statement-breakpoint
CREATE INDEX "engagement_question_tag_term_id_is_active_idx" ON "engagement_question" USING btree ("tag_term_id","is_active");--> statement-breakpoint
CREATE INDEX "engagement_question_is_global_is_active_idx" ON "engagement_question" USING btree ("is_global","is_active");--> statement-breakpoint
CREATE INDEX "post_engagement_override_post_id_idx" ON "post_engagement_override" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_engagement_override_post_id_sort_order_is_active_idx" ON "post_engagement_override" USING btree ("post_id","sort_order","is_active");