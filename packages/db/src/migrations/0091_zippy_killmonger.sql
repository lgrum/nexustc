CREATE TYPE "public"."black_market_listing_audit_action" AS ENUM('published', 'cancelled', 'expired', 'administratively-cancelled', 'sold', 'fee-reversed', 'correction');--> statement-breakpoint
CREATE TYPE "public"."black_market_listing_state" AS ENUM('active', 'sold', 'cancelled', 'expired', 'administratively-cancelled');--> statement-breakpoint
CREATE TYPE "public"."black_market_risk_signal_kind" AS ENUM('reciprocal-activity', 'related-accounts', 'extreme-price', 'repeated-transfers', 'rapid-relisting', 'repeated-cancellation');--> statement-breakpoint
ALTER TYPE "public"."collectible_ownership_event_kind" ADD VALUE 'sale';--> statement-breakpoint
ALTER TYPE "public"."eteris_transaction_kind" ADD VALUE 'market_listing_fee';--> statement-breakpoint
ALTER TYPE "public"."eteris_transaction_kind" ADD VALUE 'market_sale';--> statement-breakpoint
ALTER TYPE "public"."eteris_transaction_kind" ADD VALUE 'market_fee_reversal';--> statement-breakpoint
CREATE TABLE "black_market_listing" (
	"asking_price" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fee_reversal_transaction_id" text,
	"fee_transaction_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"listing_fee" bigint NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seller_user_id" text NOT NULL,
	"state" "black_market_listing_state" DEFAULT 'active' NOT NULL,
	"terms_hash" text NOT NULL,
	"terminal_at" timestamp with time zone,
	"terminal_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "black_market_listing_fee_reversal_transaction_id_unique" UNIQUE("fee_reversal_transaction_id"),
	CONSTRAINT "black_market_listing_fee_transaction_id_unique" UNIQUE("fee_transaction_id"),
	CONSTRAINT "black_market_listing_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "black_market_listing_price_check" CHECK ("black_market_listing"."asking_price" > 0),
	CONSTRAINT "black_market_listing_fee_check" CHECK ("black_market_listing"."listing_fee" > 0 AND "black_market_listing"."listing_fee" <= "black_market_listing"."asking_price"),
	CONSTRAINT "black_market_listing_expiry_check" CHECK ("black_market_listing"."expires_at" = "black_market_listing"."published_at" + interval '30 days'),
	CONSTRAINT "black_market_listing_terminal_metadata_check" CHECK ("black_market_listing"."state" = 'active' OR ("black_market_listing"."terminal_at" IS NOT NULL AND length(trim(coalesce("black_market_listing"."terminal_reason", ''))) > 0)),
	CONSTRAINT "black_market_listing_version_check" CHECK ("black_market_listing"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "black_market_listing_audit" (
	"action" "black_market_listing_audit_action" NOT NULL,
	"actor_user_id" text,
	"after" jsonb,
	"before" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fingerprint" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"listing_id" text NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "black_market_listing_audit_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "black_market_listing_audit_reason_check" CHECK (length(trim("black_market_listing_audit"."reason")) > 0),
	CONSTRAINT "black_market_listing_audit_version_check" CHECK ("black_market_listing_audit"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "black_market_risk_signal" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"listing_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sale_id" text,
	"signal" "black_market_risk_signal_kind" NOT NULL,
	"severity" text DEFAULT 'low' NOT NULL,
	"subject_user_id" text,
	CONSTRAINT "black_market_risk_signal_target_check" CHECK (num_nonnulls("black_market_risk_signal"."listing_id", "black_market_risk_signal"."sale_id", "black_market_risk_signal"."subject_user_id") >= 1)
);
--> statement-breakpoint
CREATE TABLE "black_market_sale" (
	"asking_price" bigint NOT NULL,
	"buyer_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"eteris_transaction_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"listing_id" text NOT NULL,
	"seller_user_id" text NOT NULL,
	CONSTRAINT "black_market_sale_eteris_transaction_id_unique" UNIQUE("eteris_transaction_id"),
	CONSTRAINT "black_market_sale_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "black_market_sale_listing_id_unique" UNIQUE("listing_id"),
	CONSTRAINT "black_market_sale_price_check" CHECK ("black_market_sale"."asking_price" > 0)
);
--> statement-breakpoint
ALTER TABLE "collectible_custody" DROP CONSTRAINT "collectible_custody_one_parent_check";--> statement-breakpoint
ALTER TABLE "collectible_custody" ADD COLUMN "black_market_listing_id" text;--> statement-breakpoint
ALTER TABLE "black_market_listing" ADD CONSTRAINT "black_market_listing_fee_reversal_transaction_id_eteris_transaction_id_fk" FOREIGN KEY ("fee_reversal_transaction_id") REFERENCES "public"."eteris_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_listing" ADD CONSTRAINT "black_market_listing_fee_transaction_id_eteris_transaction_id_fk" FOREIGN KEY ("fee_transaction_id") REFERENCES "public"."eteris_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_listing" ADD CONSTRAINT "black_market_listing_seller_user_id_user_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_listing_audit" ADD CONSTRAINT "black_market_listing_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_listing_audit" ADD CONSTRAINT "black_market_listing_audit_listing_id_black_market_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."black_market_listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_risk_signal" ADD CONSTRAINT "black_market_risk_signal_listing_id_black_market_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."black_market_listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_risk_signal" ADD CONSTRAINT "black_market_risk_signal_sale_id_black_market_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."black_market_sale"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_risk_signal" ADD CONSTRAINT "black_market_risk_signal_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_sale" ADD CONSTRAINT "black_market_sale_buyer_user_id_user_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_sale" ADD CONSTRAINT "black_market_sale_eteris_transaction_id_eteris_transaction_id_fk" FOREIGN KEY ("eteris_transaction_id") REFERENCES "public"."eteris_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_sale" ADD CONSTRAINT "black_market_sale_listing_id_black_market_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."black_market_listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "black_market_sale" ADD CONSTRAINT "black_market_sale_seller_user_id_user_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "black_market_listing_active_expiry_idx" ON "black_market_listing" USING btree ("state","expires_at","id");--> statement-breakpoint
CREATE INDEX "black_market_listing_active_price_idx" ON "black_market_listing" USING btree ("state","asking_price","id");--> statement-breakpoint
CREATE INDEX "black_market_listing_seller_state_idx" ON "black_market_listing" USING btree ("seller_user_id","state","published_at","id");--> statement-breakpoint
CREATE INDEX "black_market_listing_audit_listing_created_idx" ON "black_market_listing_audit" USING btree ("listing_id","created_at","id");--> statement-breakpoint
CREATE INDEX "black_market_listing_audit_actor_created_idx" ON "black_market_listing_audit" USING btree ("actor_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "black_market_risk_signal_listing_created_idx" ON "black_market_risk_signal" USING btree ("listing_id","created_at","id");--> statement-breakpoint
CREATE INDEX "black_market_risk_signal_subject_created_idx" ON "black_market_risk_signal" USING btree ("subject_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "black_market_sale_buyer_created_idx" ON "black_market_sale" USING btree ("buyer_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "black_market_sale_seller_created_idx" ON "black_market_sale" USING btree ("seller_user_id","created_at","id");--> statement-breakpoint
ALTER TABLE "collectible_custody" ADD CONSTRAINT "collectible_custody_black_market_listing_id_black_market_listing_id_fk" FOREIGN KEY ("black_market_listing_id") REFERENCES "public"."black_market_listing"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collectible_custody_black_market_listing_idx" ON "collectible_custody" USING btree ("black_market_listing_id","created_at","id");--> statement-breakpoint
ALTER TABLE "collectible_custody" ADD CONSTRAINT "collectible_custody_one_parent_check" CHECK (num_nonnulls("collectible_custody"."trade_offer_id", "collectible_custody"."gift_offer_id", "collectible_custody"."black_market_listing_id") = 1);