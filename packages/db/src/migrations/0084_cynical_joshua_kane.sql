CREATE TYPE "public"."gachapon_machine_audit_action" AS ENUM('create', 'update', 'activate', 'pause', 'resume', 'exhaust', 'retire');--> statement-breakpoint
CREATE TYPE "public"."gachapon_machine_state" AS ENUM('draft', 'active', 'paused', 'exhausted', 'retired');--> statement-breakpoint
CREATE TABLE "gachapon_activation" (
	"charged_cost" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"eteris_transaction_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"idempotency_key" text NOT NULL,
	"machine_id" text NOT NULL,
	"machine_version" integer NOT NULL,
	"pack_instance_id" text NOT NULL,
	"pack_template_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "gachapon_activation_eteris_transaction_id_unique" UNIQUE("eteris_transaction_id"),
	CONSTRAINT "gachapon_activation_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "gachapon_activation_pack_instance_id_unique" UNIQUE("pack_instance_id"),
	CONSTRAINT "gachapon_activation_cost_check" CHECK ("gachapon_activation"."charged_cost" > 0),
	CONSTRAINT "gachapon_activation_machine_version_check" CHECK ("gachapon_activation"."machine_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "gachapon_machine" (
	"binding" "collectible_binding" DEFAULT 'transferable' NOT NULL,
	"cost" bigint NOT NULL,
	"created_by_user_id" text,
	"description" text DEFAULT '' NOT NULL,
	"ends_at" timestamp with time zone,
	"global_quota" integer,
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"per_account_limit" integer,
	"starts_at" timestamp with time zone,
	"state" "gachapon_machine_state" DEFAULT 'draft' NOT NULL,
	"total_activations" integer DEFAULT 0 NOT NULL,
	"updated_by_user_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "gachapon_machine_cost_check" CHECK ("gachapon_machine"."cost" > 0),
	CONSTRAINT "gachapon_machine_global_quota_check" CHECK ("gachapon_machine"."global_quota" IS NULL OR "gachapon_machine"."global_quota" > 0),
	CONSTRAINT "gachapon_machine_per_account_limit_check" CHECK ("gachapon_machine"."per_account_limit" IS NULL OR "gachapon_machine"."per_account_limit" > 0),
	CONSTRAINT "gachapon_machine_total_activations_check" CHECK ("gachapon_machine"."total_activations" >= 0 AND ("gachapon_machine"."global_quota" IS NULL OR "gachapon_machine"."total_activations" <= "gachapon_machine"."global_quota")),
	CONSTRAINT "gachapon_machine_window_check" CHECK ("gachapon_machine"."ends_at" IS NULL OR "gachapon_machine"."starts_at" IS NULL OR "gachapon_machine"."ends_at" > "gachapon_machine"."starts_at"),
	CONSTRAINT "gachapon_machine_version_check" CHECK ("gachapon_machine"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "gachapon_machine_audit_event" (
	"action" "gachapon_machine_audit_action" NOT NULL,
	"actor_user_id" text,
	"after" jsonb,
	"before" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" text NOT NULL,
	"reason" text NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "gachapon_machine_audit_reason_check" CHECK (length(trim("gachapon_machine_audit_event"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "gachapon_machine_pack_entry" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"machine_id" text NOT NULL,
	"pack_template_id" text NOT NULL,
	"weight" integer NOT NULL,
	CONSTRAINT "gachapon_machine_pack_entry_weight_check" CHECK ("gachapon_machine_pack_entry"."weight" > 0 AND "gachapon_machine_pack_entry"."weight" <= 1000000)
);
--> statement-breakpoint
CREATE TABLE "gachapon_machine_usage" (
	"activation_count" integer DEFAULT 0 NOT NULL,
	"machine_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "gachapon_machine_usage_machine_id_user_id_pk" PRIMARY KEY("machine_id","user_id"),
	CONSTRAINT "gachapon_machine_usage_activation_count_check" CHECK ("gachapon_machine_usage"."activation_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "gachapon_activation" ADD CONSTRAINT "gachapon_activation_eteris_transaction_id_eteris_transaction_id_fk" FOREIGN KEY ("eteris_transaction_id") REFERENCES "public"."eteris_transaction"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_activation" ADD CONSTRAINT "gachapon_activation_machine_id_gachapon_machine_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."gachapon_machine"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_activation" ADD CONSTRAINT "gachapon_activation_pack_instance_id_pack_instance_id_fk" FOREIGN KEY ("pack_instance_id") REFERENCES "public"."pack_instance"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_activation" ADD CONSTRAINT "gachapon_activation_pack_template_id_pack_template_id_fk" FOREIGN KEY ("pack_template_id") REFERENCES "public"."pack_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_activation" ADD CONSTRAINT "gachapon_activation_revision_id_pack_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."pack_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_activation" ADD CONSTRAINT "gachapon_activation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_machine" ADD CONSTRAINT "gachapon_machine_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_machine" ADD CONSTRAINT "gachapon_machine_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_machine_audit_event" ADD CONSTRAINT "gachapon_machine_audit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_machine_audit_event" ADD CONSTRAINT "gachapon_machine_audit_event_machine_id_gachapon_machine_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."gachapon_machine"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_machine_pack_entry" ADD CONSTRAINT "gachapon_machine_pack_entry_machine_id_gachapon_machine_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."gachapon_machine"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_machine_pack_entry" ADD CONSTRAINT "gachapon_machine_pack_entry_pack_template_id_pack_template_id_fk" FOREIGN KEY ("pack_template_id") REFERENCES "public"."pack_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_machine_usage" ADD CONSTRAINT "gachapon_machine_usage_machine_id_gachapon_machine_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."gachapon_machine"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gachapon_machine_usage" ADD CONSTRAINT "gachapon_machine_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gachapon_activation_machine_created_idx" ON "gachapon_activation" USING btree ("machine_id","created_at","id");--> statement-breakpoint
CREATE INDEX "gachapon_activation_user_created_idx" ON "gachapon_activation" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "gachapon_activation_template_idx" ON "gachapon_activation" USING btree ("pack_template_id");--> statement-breakpoint
CREATE INDEX "gachapon_machine_state_idx" ON "gachapon_machine" USING btree ("state");--> statement-breakpoint
CREATE INDEX "gachapon_machine_availability_idx" ON "gachapon_machine" USING btree ("state","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "gachapon_machine_quota_idx" ON "gachapon_machine" USING btree ("global_quota","total_activations");--> statement-breakpoint
CREATE INDEX "gachapon_machine_audit_machine_created_idx" ON "gachapon_machine_audit_event" USING btree ("machine_id","created_at","id");--> statement-breakpoint
CREATE INDEX "gachapon_machine_audit_actor_created_idx" ON "gachapon_machine_audit_event" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gachapon_machine_pack_entry_machine_template_unique" ON "gachapon_machine_pack_entry" USING btree ("machine_id","pack_template_id");--> statement-breakpoint
CREATE INDEX "gachapon_machine_pack_entry_machine_idx" ON "gachapon_machine_pack_entry" USING btree ("machine_id");--> statement-breakpoint
CREATE INDEX "gachapon_machine_pack_entry_template_idx" ON "gachapon_machine_pack_entry" USING btree ("pack_template_id");--> statement-breakpoint
CREATE INDEX "gachapon_machine_usage_user_idx" ON "gachapon_machine_usage" USING btree ("user_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_gachapon_machine_pack_entry_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  machine_state "gachapon_machine_state";
  machine_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    machine_id := OLD.machine_id;
  ELSE
    machine_id := NEW.machine_id;
  END IF;
  SELECT state INTO machine_state
  FROM "gachapon_machine"
  WHERE id = machine_id;
  IF machine_state IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Gachapon Machine Pack Template weights are immutable after activation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "gachapon_machine_pack_entry_immutable_after_activation"
BEFORE INSERT OR UPDATE OR DELETE ON "gachapon_machine_pack_entry"
FOR EACH ROW EXECUTE FUNCTION "prevent_gachapon_machine_pack_entry_mutation"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_gachapon_activation_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Gachapon activations are immutable';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "gachapon_activation_append_only"
BEFORE UPDATE OR DELETE ON "gachapon_activation"
FOR EACH ROW EXECUTE FUNCTION "prevent_gachapon_activation_mutation"();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_gachapon_machine_audit_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Gachapon Machine audit history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "gachapon_machine_audit_event_append_only"
BEFORE UPDATE OR DELETE ON "gachapon_machine_audit_event"
FOR EACH ROW EXECUTE FUNCTION "prevent_gachapon_machine_audit_event_mutation"();
