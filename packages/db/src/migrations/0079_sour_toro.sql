CREATE TYPE "public"."collectible_grant_campaign_state" AS ENUM('draft', 'active', 'paused', 'retired');--> statement-breakpoint
CREATE TYPE "public"."collectible_grant_target_kind" AS ENUM('card', 'pack');--> statement-breakpoint
CREATE TYPE "public"."collectible_ownership_event_kind" AS ENUM('issuance', 'grant', 'opening', 'transfer', 'correction');--> statement-breakpoint
CREATE TYPE "public"."pack_instance_state" AS ENUM('unopened', 'opened');--> statement-breakpoint
CREATE TABLE "collectible_grant_campaign" (
	"audit_reason" text NOT NULL,
	"binding" "collectible_binding" NOT NULL,
	"card_template_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text,
	"eligibility_explanation" text NOT NULL,
	"ends_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"per_account_quantity" integer NOT NULL,
	"pack_template_id" text,
	"quantity_ceiling" integer NOT NULL,
	"quantity_issued" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"state" "collectible_grant_campaign_state" DEFAULT 'draft' NOT NULL,
	"target_kind" "collectible_grant_target_kind" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "collectible_grant_campaign_one_target_check" CHECK (("collectible_grant_campaign"."card_template_id" IS NOT NULL) <> ("collectible_grant_campaign"."pack_template_id" IS NOT NULL)),
	CONSTRAINT "collectible_grant_campaign_target_kind_check" CHECK (("collectible_grant_campaign"."target_kind" = 'card' AND "collectible_grant_campaign"."card_template_id" IS NOT NULL AND "collectible_grant_campaign"."pack_template_id" IS NULL) OR ("collectible_grant_campaign"."target_kind" = 'pack' AND "collectible_grant_campaign"."pack_template_id" IS NOT NULL AND "collectible_grant_campaign"."card_template_id" IS NULL)),
	CONSTRAINT "collectible_grant_campaign_quantity_check" CHECK ("collectible_grant_campaign"."quantity_ceiling" > 0 AND "collectible_grant_campaign"."per_account_quantity" > 0 AND "collectible_grant_campaign"."quantity_issued" >= 0 AND "collectible_grant_campaign"."quantity_issued" <= "collectible_grant_campaign"."quantity_ceiling"),
	CONSTRAINT "collectible_grant_campaign_reason_check" CHECK (length(trim("collectible_grant_campaign"."audit_reason")) > 0 AND length(trim("collectible_grant_campaign"."eligibility_explanation")) > 0),
	CONSTRAINT "collectible_grant_campaign_window_check" CHECK ("collectible_grant_campaign"."ends_at" IS NULL OR "collectible_grant_campaign"."starts_at" IS NULL OR "collectible_grant_campaign"."ends_at" > "collectible_grant_campaign"."starts_at"),
	CONSTRAINT "collectible_grant_campaign_version_check" CHECK ("collectible_grant_campaign"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "collectible_grant_execution" (
	"actor_user_id" text,
	"campaign_id" text NOT NULL,
	"card_instance_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fingerprint" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"pack_instance_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"recipient_user_id" text NOT NULL,
	"result_asset_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collectible_grant_execution_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "collectible_grant_execution_one_result_check" CHECK (("collectible_grant_execution"."card_instance_id" IS NOT NULL) <> ("collectible_grant_execution"."pack_instance_id" IS NOT NULL)),
	CONSTRAINT "collectible_grant_execution_quantity_check" CHECK ("collectible_grant_execution"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "collectible_ownership_event" (
	"actor_user_id" text,
	"card_instance_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_user_id" text,
	"id" text PRIMARY KEY NOT NULL,
	"kind" "collectible_ownership_event_kind" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pack_instance_id" text,
	"source_reference" text NOT NULL,
	"source_type" text NOT NULL,
	"to_user_id" text,
	CONSTRAINT "collectible_ownership_event_one_asset_check" CHECK (("collectible_ownership_event"."card_instance_id" IS NOT NULL) <> ("collectible_ownership_event"."pack_instance_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "pack_instance" (
	"availability" "card_instance_availability" DEFAULT 'active' NOT NULL,
	"binding" "collectible_binding" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"issue_reference" text NOT NULL,
	"issue_source" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_at" timestamp with time zone,
	"outcome_digest" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"state" "pack_instance_state" DEFAULT 'unopened' NOT NULL,
	"template_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pack_instance_opened_metadata_check" CHECK (("pack_instance"."state" = 'unopened' AND "pack_instance"."opened_at" IS NULL) OR ("pack_instance"."state" = 'opened' AND "pack_instance"."opened_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "card_instance" ADD COLUMN "issue_reference" text;--> statement-breakpoint
UPDATE "card_instance" SET "issue_reference" = 'legacy:' || "id" WHERE "issue_reference" IS NULL;--> statement-breakpoint
ALTER TABLE "card_instance" ALTER COLUMN "issue_reference" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "card_instance" ADD COLUMN "issued_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "card_instance" ADD COLUMN "reveal_order" integer;--> statement-breakpoint
ALTER TABLE "collectible_grant_campaign" ADD CONSTRAINT "collectible_grant_campaign_card_template_id_card_template_id_fk" FOREIGN KEY ("card_template_id") REFERENCES "public"."card_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_grant_campaign" ADD CONSTRAINT "collectible_grant_campaign_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_grant_campaign" ADD CONSTRAINT "collectible_grant_campaign_pack_template_id_pack_template_id_fk" FOREIGN KEY ("pack_template_id") REFERENCES "public"."pack_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_grant_execution" ADD CONSTRAINT "collectible_grant_execution_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_grant_execution" ADD CONSTRAINT "collectible_grant_execution_campaign_id_collectible_grant_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."collectible_grant_campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_grant_execution" ADD CONSTRAINT "collectible_grant_execution_card_instance_id_card_instance_id_fk" FOREIGN KEY ("card_instance_id") REFERENCES "public"."card_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_grant_execution" ADD CONSTRAINT "collectible_grant_execution_pack_instance_id_pack_instance_id_fk" FOREIGN KEY ("pack_instance_id") REFERENCES "public"."pack_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_grant_execution" ADD CONSTRAINT "collectible_grant_execution_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_ownership_event" ADD CONSTRAINT "collectible_ownership_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_ownership_event" ADD CONSTRAINT "collectible_ownership_event_card_instance_id_card_instance_id_fk" FOREIGN KEY ("card_instance_id") REFERENCES "public"."card_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_ownership_event" ADD CONSTRAINT "collectible_ownership_event_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_ownership_event" ADD CONSTRAINT "collectible_ownership_event_pack_instance_id_pack_instance_id_fk" FOREIGN KEY ("pack_instance_id") REFERENCES "public"."pack_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectible_ownership_event" ADD CONSTRAINT "collectible_ownership_event_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_instance" ADD CONSTRAINT "pack_instance_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_instance" ADD CONSTRAINT "pack_instance_revision_id_pack_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."pack_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_instance" ADD CONSTRAINT "pack_instance_template_id_pack_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."pack_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collectible_grant_campaign_state_window_idx" ON "collectible_grant_campaign" USING btree ("state","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "collectible_grant_campaign_card_target_idx" ON "collectible_grant_campaign" USING btree ("card_template_id");--> statement-breakpoint
CREATE INDEX "collectible_grant_campaign_pack_target_idx" ON "collectible_grant_campaign" USING btree ("pack_template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collectible_grant_execution_campaign_recipient_idx" ON "collectible_grant_execution" USING btree ("campaign_id","recipient_user_id","id");--> statement-breakpoint
CREATE INDEX "collectible_grant_execution_campaign_created_idx" ON "collectible_grant_execution" USING btree ("campaign_id","created_at","id");--> statement-breakpoint
CREATE INDEX "collectible_grant_execution_recipient_created_idx" ON "collectible_grant_execution" USING btree ("recipient_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "collectible_ownership_event_card_occurred_idx" ON "collectible_ownership_event" USING btree ("card_instance_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "collectible_ownership_event_pack_occurred_idx" ON "collectible_ownership_event" USING btree ("pack_instance_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "collectible_ownership_event_to_user_occurred_idx" ON "collectible_ownership_event" USING btree ("to_user_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "pack_instance_owner_state_issued_idx" ON "pack_instance" USING btree ("owner_user_id","state","issued_at","id");--> statement-breakpoint
CREATE INDEX "pack_instance_revision_idx" ON "pack_instance" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "pack_instance_template_idx" ON "pack_instance" USING btree ("template_id");--> statement-breakpoint
ALTER TABLE "card_instance" ADD CONSTRAINT "card_instance_pack_instance_id_pack_instance_id_fk" FOREIGN KEY ("pack_instance_id") REFERENCES "public"."pack_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_instance" ADD CONSTRAINT "card_instance_reveal_order_location_check" CHECK (("card_instance"."pack_instance_id" IS NULL AND "card_instance"."reveal_order" IS NULL) OR ("card_instance"."pack_instance_id" IS NOT NULL AND "card_instance"."reveal_order" > 0));
--> statement-breakpoint
CREATE FUNCTION "prevent_collectible_ownership_event_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Collectible ownership history is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "collectible_ownership_event_append_only"
BEFORE UPDATE OR DELETE ON "collectible_ownership_event"
FOR EACH ROW EXECUTE FUNCTION "prevent_collectible_ownership_event_mutation"();--> statement-breakpoint
CREATE FUNCTION "prevent_collectible_grant_execution_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Collectible grant executions are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "collectible_grant_execution_append_only"
BEFORE UPDATE OR DELETE ON "collectible_grant_execution"
FOR EACH ROW EXECUTE FUNCTION "prevent_collectible_grant_execution_mutation"();--> statement-breakpoint
CREATE FUNCTION "prevent_card_instance_issuance_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."template_id" IS DISTINCT FROM OLD."template_id"
    OR NEW."binding" IS DISTINCT FROM OLD."binding"
    OR NEW."mint_number" IS DISTINCT FROM OLD."mint_number"
    OR NEW."issue_reference" IS DISTINCT FROM OLD."issue_reference"
    OR NEW."issuance_source" IS DISTINCT FROM OLD."issuance_source"
    OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at"
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Card Instance issuance facts are immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "card_instance_issuance_immutable"
BEFORE UPDATE ON "card_instance"
FOR EACH ROW EXECUTE FUNCTION "prevent_card_instance_issuance_mutation"();--> statement-breakpoint
CREATE FUNCTION "prevent_pack_instance_provenance_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."template_id" IS DISTINCT FROM OLD."template_id"
    OR NEW."revision_id" IS DISTINCT FROM OLD."revision_id"
    OR NEW."binding" IS DISTINCT FROM OLD."binding"
    OR NEW."issue_reference" IS DISTINCT FROM OLD."issue_reference"
    OR NEW."issue_source" IS DISTINCT FROM OLD."issue_source"
    OR NEW."issued_at" IS DISTINCT FROM OLD."issued_at"
    OR (
      OLD."outcome_digest" <> 'pending'
      AND NEW."outcome_digest" IS DISTINCT FROM OLD."outcome_digest"
    )
    OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'Pack Instance provenance is immutable';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "pack_instance_provenance_immutable"
BEFORE UPDATE ON "pack_instance"
FOR EACH ROW EXECUTE FUNCTION "prevent_pack_instance_provenance_mutation"();
