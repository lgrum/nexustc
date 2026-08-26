CREATE TYPE "public"."official_card_shop_offer_audit_action" AS ENUM('create', 'update', 'schedule', 'enable', 'disable', 'restock', 'reduce_quota');--> statement-breakpoint
CREATE TABLE "official_card_shop_offer" (
	"binding" "collectible_binding" DEFAULT 'transferable' NOT NULL,
	"created_by_user_id" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"ends_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"pack_template_id" text NOT NULL,
	"per_account_limit" integer,
	"price" bigint NOT NULL,
	"remaining_sales" integer,
	"starts_at" timestamp with time zone,
	"total_sold" integer DEFAULT 0 NOT NULL,
	"updated_by_user_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "official_card_shop_offer_price_check" CHECK ("official_card_shop_offer"."price" > 0),
	CONSTRAINT "official_card_shop_offer_remaining_sales_check" CHECK ("official_card_shop_offer"."remaining_sales" IS NULL OR "official_card_shop_offer"."remaining_sales" >= 0),
	CONSTRAINT "official_card_shop_offer_per_account_limit_check" CHECK ("official_card_shop_offer"."per_account_limit" IS NULL OR "official_card_shop_offer"."per_account_limit" > 0),
	CONSTRAINT "official_card_shop_offer_total_sold_check" CHECK ("official_card_shop_offer"."total_sold" >= 0),
	CONSTRAINT "official_card_shop_offer_window_check" CHECK ("official_card_shop_offer"."ends_at" IS NULL OR "official_card_shop_offer"."starts_at" IS NULL OR "official_card_shop_offer"."ends_at" > "official_card_shop_offer"."starts_at"),
	CONSTRAINT "official_card_shop_offer_version_check" CHECK ("official_card_shop_offer"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "official_card_shop_offer_audit_event" (
	"action" "official_card_shop_offer_audit_action" NOT NULL,
	"actor_user_id" text,
	"after" jsonb,
	"before" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"reason" text NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "official_card_shop_offer_audit_reason_check" CHECK (length(trim("official_card_shop_offer_audit_event"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "official_card_shop_offer_usage" (
	"offer_id" text NOT NULL,
	"purchased_quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "official_card_shop_offer_usage_offer_id_user_id_pk" PRIMARY KEY("offer_id","user_id"),
	CONSTRAINT "official_card_shop_offer_usage_quantity_check" CHECK ("official_card_shop_offer_usage"."purchased_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "official_card_shop_purchase" (
	"binding" "collectible_binding" NOT NULL,
	"buyer_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"eteris_transaction_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"offer_id" text NOT NULL,
	"pack_template_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"revision_id" text NOT NULL,
	"total_price" bigint NOT NULL,
	"unit_price" bigint NOT NULL,
	"offer_version" integer NOT NULL,
	CONSTRAINT "official_card_shop_purchase_eteris_transaction_id_unique" UNIQUE("eteris_transaction_id"),
	CONSTRAINT "official_card_shop_purchase_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "official_card_shop_purchase_quantity_check" CHECK ("official_card_shop_purchase"."quantity" BETWEEN 1 AND 10),
	CONSTRAINT "official_card_shop_purchase_price_check" CHECK ("official_card_shop_purchase"."unit_price" > 0 AND "official_card_shop_purchase"."total_price" > 0)
);
--> statement-breakpoint
CREATE TABLE "official_card_shop_purchase_item" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"ordinal" integer NOT NULL,
	"pack_instance_id" text NOT NULL,
	"purchase_id" text NOT NULL,
	"revision_id" text NOT NULL,
	CONSTRAINT "official_card_shop_purchase_item_pack_instance_id_unique" UNIQUE("pack_instance_id"),
	CONSTRAINT "official_card_shop_purchase_item_ordinal_check" CHECK ("official_card_shop_purchase_item"."ordinal" BETWEEN 1 AND 10)
);
--> statement-breakpoint
ALTER TABLE "official_card_shop_offer" ADD CONSTRAINT "official_card_shop_offer_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_offer" ADD CONSTRAINT "official_card_shop_offer_pack_template_id_pack_template_id_fk" FOREIGN KEY ("pack_template_id") REFERENCES "public"."pack_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_offer" ADD CONSTRAINT "official_card_shop_offer_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_offer_audit_event" ADD CONSTRAINT "official_card_shop_offer_audit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_offer_audit_event" ADD CONSTRAINT "official_card_shop_offer_audit_event_offer_id_official_card_shop_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."official_card_shop_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_offer_usage" ADD CONSTRAINT "official_card_shop_offer_usage_offer_id_official_card_shop_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."official_card_shop_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_offer_usage" ADD CONSTRAINT "official_card_shop_offer_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase" ADD CONSTRAINT "official_card_shop_purchase_buyer_user_id_user_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase" ADD CONSTRAINT "official_card_shop_purchase_eteris_transaction_id_eteris_transaction_id_fk" FOREIGN KEY ("eteris_transaction_id") REFERENCES "public"."eteris_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase" ADD CONSTRAINT "official_card_shop_purchase_offer_id_official_card_shop_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."official_card_shop_offer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase" ADD CONSTRAINT "official_card_shop_purchase_pack_template_id_pack_template_id_fk" FOREIGN KEY ("pack_template_id") REFERENCES "public"."pack_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase" ADD CONSTRAINT "official_card_shop_purchase_revision_id_pack_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."pack_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase_item" ADD CONSTRAINT "official_card_shop_purchase_item_pack_instance_id_pack_instance_id_fk" FOREIGN KEY ("pack_instance_id") REFERENCES "public"."pack_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase_item" ADD CONSTRAINT "official_card_shop_purchase_item_purchase_id_official_card_shop_purchase_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."official_card_shop_purchase"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "official_card_shop_purchase_item" ADD CONSTRAINT "official_card_shop_purchase_item_revision_id_pack_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."pack_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "official_card_shop_offer_template_idx" ON "official_card_shop_offer" USING btree ("pack_template_id");--> statement-breakpoint
CREATE INDEX "official_card_shop_offer_availability_idx" ON "official_card_shop_offer" USING btree ("enabled","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "official_card_shop_offer_remaining_sales_idx" ON "official_card_shop_offer" USING btree ("remaining_sales");--> statement-breakpoint
CREATE INDEX "official_card_shop_offer_audit_offer_created_idx" ON "official_card_shop_offer_audit_event" USING btree ("offer_id","created_at","id");--> statement-breakpoint
CREATE INDEX "official_card_shop_offer_audit_actor_created_idx" ON "official_card_shop_offer_audit_event" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "official_card_shop_offer_usage_user_idx" ON "official_card_shop_offer_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "official_card_shop_purchase_buyer_created_idx" ON "official_card_shop_purchase" USING btree ("buyer_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "official_card_shop_purchase_offer_created_idx" ON "official_card_shop_purchase" USING btree ("offer_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "official_card_shop_purchase_item_purchase_ordinal_unique" ON "official_card_shop_purchase_item" USING btree ("purchase_id","ordinal");--> statement-breakpoint
CREATE INDEX "official_card_shop_purchase_item_purchase_idx" ON "official_card_shop_purchase_item" USING btree ("purchase_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_official_card_shop_offer_audit_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'official_card_shop_offer_audit_event is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "official_card_shop_offer_audit_event_append_only"
BEFORE UPDATE OR DELETE ON "official_card_shop_offer_audit_event"
FOR EACH ROW EXECUTE FUNCTION "prevent_official_card_shop_offer_audit_event_mutation"();
