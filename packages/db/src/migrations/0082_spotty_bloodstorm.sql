CREATE TABLE "pack_opening" (
	"cards" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fingerprint" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"owner_user_id" text NOT NULL,
	"pack_instance_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"source" text NOT NULL,
	"template_id" text NOT NULL,
	CONSTRAINT "pack_opening_pack_instance_id_unique" UNIQUE("pack_instance_id")
);
--> statement-breakpoint
ALTER TABLE "pack_opening" ADD CONSTRAINT "pack_opening_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_opening" ADD CONSTRAINT "pack_opening_pack_instance_id_pack_instance_id_fk" FOREIGN KEY ("pack_instance_id") REFERENCES "public"."pack_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_opening" ADD CONSTRAINT "pack_opening_revision_id_pack_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."pack_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_opening" ADD CONSTRAINT "pack_opening_template_id_pack_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."pack_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pack_opening_idempotency_key_unique" ON "pack_opening" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "pack_opening_owner_opened_idx" ON "pack_opening" USING btree ("owner_user_id","opened_at","id");--> statement-breakpoint
CREATE INDEX "pack_opening_revision_idx" ON "pack_opening" USING btree ("revision_id");