CREATE TABLE "eteris_daily_snapshot" (
	"anomalous_earners" jsonb NOT NULL,
	"balance_percentiles" jsonb NOT NULL,
	"burned" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"day" date PRIMARY KEY NOT NULL,
	"frozen_wallet_count" integer NOT NULL,
	"issued" bigint NOT NULL,
	"negative_wallet_count" integer NOT NULL,
	"sink_totals" jsonb NOT NULL,
	"source_totals" jsonb NOT NULL,
	"total_user_supply" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eteris_wallet_reconciliation" (
	"actor_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"ledger_balance" bigint NOT NULL,
	"projection_balance" bigint NOT NULL,
	"repaired" boolean NOT NULL,
	"wallet_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eteris_wallet_reconciliation" ADD CONSTRAINT "eteris_wallet_reconciliation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eteris_wallet_reconciliation" ADD CONSTRAINT "eteris_wallet_reconciliation_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eteris_wallet_reconciliation_wallet_created_idx" ON "eteris_wallet_reconciliation" USING btree ("wallet_id","created_at");