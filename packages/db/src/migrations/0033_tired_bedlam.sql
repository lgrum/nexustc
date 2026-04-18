CREATE TABLE "engagement_question_incompatible_tag_relation" (
	"engagement_question_id" text NOT NULL,
	"term_id" text NOT NULL,
	CONSTRAINT "engagement_question_incompatible_tag_relation_engagement_question_id_term_id_pk" PRIMARY KEY("engagement_question_id","term_id")
);
--> statement-breakpoint
ALTER TABLE "engagement_question_incompatible_tag_relation" ADD CONSTRAINT "engagement_question_incompatible_tag_relation_engagement_question_id_engagement_question_id_fk" FOREIGN KEY ("engagement_question_id") REFERENCES "public"."engagement_question"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_question_incompatible_tag_relation" ADD CONSTRAINT "engagement_question_incompatible_tag_relation_term_id_term_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."term"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "engagement_question_incompatible_tag_relation_term_id_idx" ON "engagement_question_incompatible_tag_relation" USING btree ("term_id");