CREATE TYPE "public"."card_instance_availability" AS ENUM('active', 'frozen');--> statement-breakpoint
CREATE TYPE "public"."card_lifecycle" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."card_rarity" AS ENUM('common', 'uncommon', 'rare', 'epic', 'legendary');--> statement-breakpoint
CREATE TYPE "public"."card_render_variant" AS ENUM('standard', 'thumbnail', 'static', 'reduced-motion');--> statement-breakpoint
CREATE TYPE "public"."card_template_audit_action" AS ENUM('create', 'publish', 'correction', 'retire', 'disable', 'restore');--> statement-breakpoint
CREATE TYPE "public"."card_template_availability" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."collectible_binding" AS ENUM('transferable', 'account-bound');--> statement-breakpoint
CREATE TABLE "card_character" (
	"character_name" text NOT NULL,
	"created_by_user_id" text,
	"game_name" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"lifecycle" "card_lifecycle" DEFAULT 'draft' NOT NULL,
	"normalized_character_name" text NOT NULL,
	"normalized_game_name" text NOT NULL,
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_instance" (
	"availability" "card_instance_availability" DEFAULT 'active' NOT NULL,
	"binding" "collectible_binding" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"issuance_source" text NOT NULL,
	"mint_number" integer NOT NULL,
	"owner_user_id" text,
	"pack_instance_id" text,
	"template_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_instance_exclusive_location_check" CHECK (("card_instance"."owner_user_id" IS NOT NULL) <> ("card_instance"."pack_instance_id" IS NOT NULL)),
	CONSTRAINT "card_instance_mint_number_check" CHECK ("card_instance"."mint_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "card_series" (
	"created_by_user_id" text,
	"description" text DEFAULT '' NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"lifecycle" "card_lifecycle" DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_template" (
	"availability" "card_template_availability" DEFAULT 'active' NOT NULL,
	"character_id" text NOT NULL,
	"created_by_user_id" text,
	"description" text DEFAULT '' NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_by_user_id" text,
	"edition" text,
	"effect_config" jsonb DEFAULT '{"effect":"none","intensity":"low"}'::jsonb NOT NULL,
	"first_minted_at" timestamp with time zone,
	"id" text PRIMARY KEY NOT NULL,
	"lifecycle" "card_lifecycle" DEFAULT 'draft' NOT NULL,
	"lifetime_supply_ceiling" integer,
	"minted_supply" integer DEFAULT 0 NOT NULL,
	"portrait_media_id" text NOT NULL,
	"presentation_metadata" jsonb DEFAULT '{"accentColor":"#7c3aed","frameKey":"default","watermarkText":"NeXusTC"}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_user_id" text,
	"render_identity" text,
	"rendered_variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rarity" "card_rarity" NOT NULL,
	"series_id" text NOT NULL,
	"updated_by_user_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "card_template_minted_supply_check" CHECK ("card_template"."minted_supply" >= 0 AND ("card_template"."lifetime_supply_ceiling" IS NULL OR "card_template"."minted_supply" <= "card_template"."lifetime_supply_ceiling")),
	CONSTRAINT "card_template_lifetime_supply_ceiling_check" CHECK ("card_template"."lifetime_supply_ceiling" IS NULL OR "card_template"."lifetime_supply_ceiling" > 0),
	CONSTRAINT "card_template_version_check" CHECK ("card_template"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "card_template_audit_event" (
	"action" "card_template_audit_action" NOT NULL,
	"actor_user_id" text,
	"after" jsonb,
	"before" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"template_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_template_rendered_variant" (
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"height" integer NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"object_key" text NOT NULL,
	"template_id" text NOT NULL,
	"variant" "card_render_variant" NOT NULL,
	"width" integer NOT NULL,
	CONSTRAINT "card_template_rendered_variant_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE FUNCTION "prevent_card_template_audit_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'card_template_audit_event is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "card_template_audit_event_append_only"
BEFORE UPDATE OR DELETE ON "card_template_audit_event"
FOR EACH ROW EXECUTE FUNCTION "prevent_card_template_audit_event_mutation"();--> statement-breakpoint
ALTER TABLE "card_character" ADD CONSTRAINT "card_character_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_character" ADD CONSTRAINT "card_character_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_instance" ADD CONSTRAINT "card_instance_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_instance" ADD CONSTRAINT "card_instance_template_id_card_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."card_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_series" ADD CONSTRAINT "card_series_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_series" ADD CONSTRAINT "card_series_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_template" ADD CONSTRAINT "card_template_character_id_card_character_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."card_character"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_template" ADD CONSTRAINT "card_template_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_template" ADD CONSTRAINT "card_template_disabled_by_user_id_user_id_fk" FOREIGN KEY ("disabled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_template" ADD CONSTRAINT "card_template_portrait_media_id_media_id_fk" FOREIGN KEY ("portrait_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_template" ADD CONSTRAINT "card_template_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_template" ADD CONSTRAINT "card_template_series_id_card_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."card_series"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_template" ADD CONSTRAINT "card_template_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_template_audit_event" ADD CONSTRAINT "card_template_audit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_template_audit_event" ADD CONSTRAINT "card_template_audit_event_template_id_card_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."card_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_template_rendered_variant" ADD CONSTRAINT "card_template_rendered_variant_template_id_card_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."card_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_character_normalized_identity_unique" ON "card_character" USING btree ("normalized_game_name","normalized_character_name");--> statement-breakpoint
CREATE INDEX "card_character_lifecycle_idx" ON "card_character" USING btree ("lifecycle");--> statement-breakpoint
CREATE INDEX "card_character_normalized_game_idx" ON "card_character" USING btree ("normalized_game_name");--> statement-breakpoint
CREATE UNIQUE INDEX "card_instance_template_mint_number_unique" ON "card_instance" USING btree ("template_id","mint_number");--> statement-breakpoint
CREATE INDEX "card_instance_owner_template_mint_idx" ON "card_instance" USING btree ("owner_user_id","template_id","mint_number");--> statement-breakpoint
CREATE INDEX "card_instance_template_idx" ON "card_instance" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "card_instance_pack_instance_idx" ON "card_instance" USING btree ("pack_instance_id");--> statement-breakpoint
CREATE INDEX "card_series_lifecycle_idx" ON "card_series" USING btree ("lifecycle");--> statement-breakpoint
CREATE INDEX "card_series_name_idx" ON "card_series" USING btree ("name");--> statement-breakpoint
CREATE INDEX "card_template_character_idx" ON "card_template" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "card_template_series_idx" ON "card_template" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "card_template_lifecycle_availability_idx" ON "card_template" USING btree ("lifecycle","availability");--> statement-breakpoint
CREATE INDEX "card_template_rarity_idx" ON "card_template" USING btree ("rarity");--> statement-breakpoint
CREATE INDEX "card_template_supply_lock_idx" ON "card_template" USING btree ("id","minted_supply","lifetime_supply_ceiling");--> statement-breakpoint
CREATE INDEX "card_template_audit_event_template_created_idx" ON "card_template_audit_event" USING btree ("template_id","created_at");--> statement-breakpoint
CREATE INDEX "card_template_audit_event_actor_created_idx" ON "card_template_audit_event" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "card_template_rendered_variant_template_variant_unique" ON "card_template_rendered_variant" USING btree ("template_id","variant");--> statement-breakpoint
CREATE INDEX "card_template_rendered_variant_template_idx" ON "card_template_rendered_variant" USING btree ("template_id");
