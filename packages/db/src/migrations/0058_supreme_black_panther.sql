CREATE TYPE "public"."eteris_transaction_kind" AS ENUM('level_reward', 'vip_stipend', 'admin_adjustment', 'reversal', 'account_closure', 'purchase', 'trade', 'auction', 'gacha', 'refund');--> statement-breakpoint
CREATE TYPE "public"."eteris_wallet_kind" AS ENUM('user', 'mint', 'sink', 'fee', 'write_off');--> statement-breakpoint
CREATE TYPE "public"."eteris_wallet_status" AS ENUM('active', 'frozen', 'closed');--> statement-breakpoint
CREATE TABLE "eteris_posting" (
	"amount" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"transaction_id" text NOT NULL,
	"wallet_id" text NOT NULL,
	CONSTRAINT "eteris_posting_transaction_id_wallet_id_pk" PRIMARY KEY("transaction_id","wallet_id"),
	CONSTRAINT "eteris_posting_amount_check" CHECK ("eteris_posting"."amount" <> 0)
);
--> statement-breakpoint
CREATE FUNCTION "prevent_eteris_posting_mutation"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'eteris postings are immutable';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "eteris_posting_immutable"
	BEFORE UPDATE OR DELETE ON "eteris_posting"
	FOR EACH ROW EXECUTE FUNCTION "prevent_eteris_posting_mutation"();--> statement-breakpoint
CREATE TABLE "eteris_transaction" (
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" "eteris_transaction_kind" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reason" text,
	"reverses_transaction_id" text,
	"source_module" text NOT NULL,
	"source_ref" text NOT NULL,
	CONSTRAINT "eteris_transaction_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "eteris_transaction_reverses_transaction_id_unique" UNIQUE("reverses_transaction_id"),
	CONSTRAINT "eteris_transaction_reason_check" CHECK ("eteris_transaction"."kind" NOT IN ('admin_adjustment', 'reversal') OR length(trim("eteris_transaction"."reason")) > 0)
);
--> statement-breakpoint
CREATE FUNCTION "prevent_eteris_transaction_mutation"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'UPDATE'
		AND OLD."actor_user_id" IS NOT NULL
		AND NEW."actor_user_id" IS NULL
		AND OLD."created_at" IS NOT DISTINCT FROM NEW."created_at"
		AND OLD."id" IS NOT DISTINCT FROM NEW."id"
		AND OLD."idempotency_key" IS NOT DISTINCT FROM NEW."idempotency_key"
		AND OLD."kind" IS NOT DISTINCT FROM NEW."kind"
		AND OLD."metadata" IS NOT DISTINCT FROM NEW."metadata"
		AND OLD."reason" IS NOT DISTINCT FROM NEW."reason"
		AND OLD."reverses_transaction_id" IS NOT DISTINCT FROM NEW."reverses_transaction_id"
		AND OLD."source_module" IS NOT DISTINCT FROM NEW."source_module"
		AND OLD."source_ref" IS NOT DISTINCT FROM NEW."source_ref"
	THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'eteris transactions are immutable';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "eteris_transaction_immutable"
	BEFORE UPDATE OR DELETE ON "eteris_transaction"
	FOR EACH ROW EXECUTE FUNCTION "prevent_eteris_transaction_mutation"();--> statement-breakpoint
CREATE TABLE "eteris_wallet" (
	"anonymized_at" timestamp with time zone,
	"code" text,
	"id" text PRIMARY KEY NOT NULL,
	"kind" "eteris_wallet_kind" NOT NULL,
	"public_balance" boolean DEFAULT false NOT NULL,
	"status" "eteris_wallet_status" DEFAULT 'active' NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "eteris_wallet_code_unique" UNIQUE("code"),
	CONSTRAINT "eteris_wallet_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "eteris_wallet_identity_check" CHECK (("eteris_wallet"."kind" = 'user' AND ("eteris_wallet"."user_id" IS NOT NULL OR "eteris_wallet"."status" = 'closed') AND "eteris_wallet"."code" IS NULL) OR ("eteris_wallet"."kind" <> 'user' AND "eteris_wallet"."user_id" IS NULL AND "eteris_wallet"."code" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "eteris_wallet_balance" (
	"balance" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"wallet_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eteris_posting" ADD CONSTRAINT "eteris_posting_transaction_id_eteris_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."eteris_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eteris_posting" ADD CONSTRAINT "eteris_posting_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eteris_transaction" ADD CONSTRAINT "eteris_transaction_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eteris_transaction" ADD CONSTRAINT "eteris_transaction_reversal_fk" FOREIGN KEY ("reverses_transaction_id") REFERENCES "public"."eteris_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eteris_wallet" ADD CONSTRAINT "eteris_wallet_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eteris_wallet_balance" ADD CONSTRAINT "eteris_wallet_balance_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eteris_posting_wallet_transaction_idx" ON "eteris_posting" USING btree ("wallet_id","transaction_id");--> statement-breakpoint
CREATE INDEX "eteris_transaction_created_idx" ON "eteris_transaction" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "eteris_transaction_kind_created_idx" ON "eteris_transaction" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "eteris_transaction_source_ref_idx" ON "eteris_transaction" USING btree ("source_ref");
