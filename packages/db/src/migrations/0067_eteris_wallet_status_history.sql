CREATE TABLE "eteris_wallet_status_event" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"status" "eteris_wallet_status" NOT NULL,
	"wallet_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eteris_wallet_status_event" ADD CONSTRAINT "eteris_wallet_status_event_wallet_id_eteris_wallet_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eteris_wallet_status_event_wallet_created_idx" ON "eteris_wallet_status_event" USING btree ("wallet_id","created_at","sequence");--> statement-breakpoint
INSERT INTO "eteris_wallet_status_event" ("status", "wallet_id", "created_at")
SELECT "status", "id", "created_at" FROM "eteris_wallet";--> statement-breakpoint
CREATE OR REPLACE FUNCTION "record_eteris_wallet_status"() RETURNS trigger AS $$
BEGIN
	INSERT INTO "eteris_wallet_status_event" ("status", "wallet_id", "created_at")
	VALUES (NEW."status", NEW."id", clock_timestamp());
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER "eteris_wallet_status_history_insert"
AFTER INSERT ON "eteris_wallet"
FOR EACH ROW
EXECUTE FUNCTION "record_eteris_wallet_status"();--> statement-breakpoint
CREATE TRIGGER "eteris_wallet_status_history"
AFTER UPDATE OF "status" ON "eteris_wallet"
FOR EACH ROW
WHEN (OLD."status" IS DISTINCT FROM NEW."status")
EXECUTE FUNCTION "record_eteris_wallet_status"();
