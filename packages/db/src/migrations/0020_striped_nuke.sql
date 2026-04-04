ALTER TABLE "post" ADD COLUMN "early_access_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "early_access_public_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "early_access_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "early_access_vip12_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "vip12_early_access_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "post" ADD COLUMN "vip8_early_access_hours" integer DEFAULT 48 NOT NULL;--> statement-breakpoint
CREATE INDEX "post_status_type_early_access_idx" ON "post" USING btree ("status","type","early_access_public_at");--> statement-breakpoint
CREATE INDEX "post_early_access_enabled_idx" ON "post" USING btree ("early_access_enabled");--> statement-breakpoint
CREATE INDEX "post_early_access_public_at_idx" ON "post" USING btree ("early_access_public_at");