ALTER TABLE "user" ADD COLUMN "normalized_email" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "newsletter_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_normalized_email_unique" UNIQUE("normalized_email");