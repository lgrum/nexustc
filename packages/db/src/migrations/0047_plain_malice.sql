ALTER TABLE "engagement_question" DROP CONSTRAINT "engagement_question_tag_term_id_term_id_fk";
--> statement-breakpoint
ALTER TABLE "engagement_question" ADD CONSTRAINT "engagement_question_tag_term_id_term_id_fk" FOREIGN KEY ("tag_term_id") REFERENCES "public"."term"("id") ON DELETE set null ON UPDATE no action;