ALTER TABLE "profile_settings" ALTER COLUMN "visibility_config" SET DEFAULT '{"favorites": true, "publicCollection": false, "reviews": true, "reserved": {}, "streak": false}'::jsonb;--> statement-breakpoint
CREATE INDEX "card_instance_owner_issued_idx" ON "card_instance" USING btree ("owner_user_id","issued_at","id");--> statement-breakpoint
CREATE INDEX "card_instance_owner_binding_idx" ON "card_instance" USING btree ("owner_user_id","binding","id");--> statement-breakpoint
CREATE INDEX "pack_instance_owner_template_issued_idx" ON "pack_instance" USING btree ("owner_user_id","template_id","issued_at","id");--> statement-breakpoint
CREATE INDEX "pack_instance_owner_binding_idx" ON "pack_instance" USING btree ("owner_user_id","binding","id");