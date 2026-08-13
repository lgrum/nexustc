CREATE TYPE "public"."profile_catalog_kind" AS ENUM('layout', 'skin', 'decoration');--> statement-breakpoint
CREATE TYPE "public"."profile_catalog_lifecycle" AS ENUM('draft', 'active', 'archived', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."profile_catalog_ownership_source" AS ENUM('purchase', 'grant');--> statement-breakpoint
CREATE TYPE "public"."profile_catalog_revision_state" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."profile_decoration_slot" AS ENUM('avatar-frame', 'nameplate-effect', 'profile-frame', 'ambient-effect');--> statement-breakpoint
CREATE TYPE "public"."profile_layout_key" AS ENUM('stack', 'grid', 'spotlight');--> statement-breakpoint
CREATE TYPE "public"."profile_showcase_type_key" AS ENUM('library', 'reviews', 'favorite-games', 'xp', 'streak', 'eteris');--> statement-breakpoint
CREATE TYPE "public"."profile_showcase_variant" AS ENUM('compact', 'standard', 'featured');--> statement-breakpoint
CREATE TABLE "profile_catalog_audit" (
	"action" text NOT NULL,
	"actor_user_id" text,
	"after" jsonb,
	"before" jsonb,
	"id" text PRIMARY KEY NOT NULL,
	"note" text,
	"target_id" text NOT NULL,
	"target_kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_catalog_decoration_revision" (
	"effect_key" text,
	"font_key" text,
	"media_asset_id" text,
	"reduced_motion" jsonb,
	"revision_id" text PRIMARY KEY NOT NULL,
	"slot" "profile_decoration_slot" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_catalog_item" (
	"current_published_revision_id" text,
	"id" text PRIMARY KEY NOT NULL,
	"is_protected_default" boolean DEFAULT false NOT NULL,
	"kind" "profile_catalog_kind" NOT NULL,
	"lifecycle" "profile_catalog_lifecycle" DEFAULT 'draft' NOT NULL,
	"stable_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_catalog_item_stable_key_unique" UNIQUE("stable_key")
);
--> statement-breakpoint
CREATE TABLE "profile_catalog_item_revision" (
	"catalog_order" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" text,
	"description" text DEFAULT '' NOT NULL,
	"eteris_price" bigint,
	"id" text PRIMARY KEY NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"item_id" text NOT NULL,
	"name" text NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_user_id" text,
	"required_tier" text,
	"revision" integer NOT NULL,
	"state" "profile_catalog_revision_state" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_catalog_item_revision_price_nonnegative" CHECK ("profile_catalog_item_revision"."eteris_price" IS NULL OR "profile_catalog_item_revision"."eteris_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "profile_catalog_layout_revision" (
	"revision_id" text PRIMARY KEY NOT NULL,
	"renderer_key" "profile_layout_key" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_catalog_ownership" (
	"catalog_item_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" text,
	"grant_reason" text,
	"id" text PRIMARY KEY NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" text,
	"revoke_reason" text,
	"source_reference" text NOT NULL,
	"source_type" "profile_catalog_ownership_source" NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_catalog_skin_revision" (
	"background_asset_id" text,
	"revision_id" text PRIMARY KEY NOT NULL,
	"tokens" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_customization" (
	"revision" integer DEFAULT 1 NOT NULL,
	"selected_layout_item_id" text NOT NULL,
	"selected_skin_item_id" text NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_customization_revision_positive" CHECK ("profile_customization"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "profile_equipped_decoration" (
	"catalog_item_id" text NOT NULL,
	"slot" "profile_decoration_slot" NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_equipped_decoration_user_id_slot_pk" PRIMARY KEY("user_id","slot")
);
--> statement-breakpoint
CREATE TABLE "profile_showcase_config" (
	"enabled" boolean DEFAULT false NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"display_order" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_schema_version" integer NOT NULL,
	"type_key" "profile_showcase_type_key" NOT NULL,
	"user_id" text NOT NULL,
	"variant" "profile_showcase_variant" DEFAULT 'standard' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_showcase_config_order_nonnegative" CHECK ("profile_showcase_config"."display_order" >= 0),
	CONSTRAINT "profile_showcase_config_payload_version_positive" CHECK ("profile_showcase_config"."payload_schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "profile_showcase_type" (
	"is_active" boolean DEFAULT true NOT NULL,
	"key" "profile_showcase_type_key" PRIMARY KEY NOT NULL,
	"published_config_revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_catalog_audit" ADD CONSTRAINT "pca_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_catalog_decoration_revision" ADD CONSTRAINT "pcdr_revision_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."profile_catalog_item_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_catalog_decoration_revision" ADD CONSTRAINT "pcdr_media_asset_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."profile_media_asset"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_catalog_item_revision" ADD CONSTRAINT "pcir_item_fk" FOREIGN KEY ("item_id") REFERENCES "public"."profile_catalog_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_catalog_item_revision" ADD CONSTRAINT "pcir_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_catalog_item_revision" ADD CONSTRAINT "pcir_publisher_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_catalog_layout_revision" ADD CONSTRAINT "pclr_revision_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."profile_catalog_item_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_catalog_ownership" ADD CONSTRAINT "pco_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_catalog_ownership" ADD CONSTRAINT "pco_catalog_item_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."profile_catalog_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_catalog_ownership" ADD CONSTRAINT "pco_granter_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_catalog_ownership" ADD CONSTRAINT "pco_revoker_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_catalog_skin_revision" ADD CONSTRAINT "pcsr_revision_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."profile_catalog_item_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_catalog_skin_revision" ADD CONSTRAINT "pcsr_background_asset_fk" FOREIGN KEY ("background_asset_id") REFERENCES "public"."profile_media_asset"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_customization" ADD CONSTRAINT "pc_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_customization" ADD CONSTRAINT "pc_layout_item_fk" FOREIGN KEY ("selected_layout_item_id") REFERENCES "public"."profile_catalog_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_customization" ADD CONSTRAINT "pc_skin_item_fk" FOREIGN KEY ("selected_skin_item_id") REFERENCES "public"."profile_catalog_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_equipped_decoration" ADD CONSTRAINT "ped_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_equipped_decoration" ADD CONSTRAINT "ped_catalog_item_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."profile_catalog_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_showcase_config" ADD CONSTRAINT "psc_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_showcase_config" ADD CONSTRAINT "psc_type_fk" FOREIGN KEY ("type_key") REFERENCES "public"."profile_showcase_type"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_catalog_audit_target_idx" ON "profile_catalog_audit" USING btree ("target_kind","target_id","created_at");--> statement-breakpoint
CREATE INDEX "profile_catalog_item_kind_idx" ON "profile_catalog_item" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_catalog_item_revision_number_uq" ON "profile_catalog_item_revision" USING btree ("item_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_catalog_ownership_source_uq" ON "profile_catalog_ownership" USING btree ("source_type","source_reference");--> statement-breakpoint
CREATE INDEX "profile_catalog_ownership_user_item_idx" ON "profile_catalog_ownership" USING btree ("user_id","catalog_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_showcase_config_user_type_uq" ON "profile_showcase_config" USING btree ("user_id","type_key");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_showcase_config_user_order_uq" ON "profile_showcase_config" USING btree ("user_id","display_order");
--> statement-breakpoint
INSERT INTO "profile_catalog_item" (
	"id", "stable_key", "kind", "lifecycle", "is_protected_default", "created_at", "updated_at"
) VALUES
	('profile-layout-default', 'layout.stack', 'layout', 'active', true, now(), now()),
	('profile-skin-default', 'skin.default', 'skin', 'active', true, now(), now());
--> statement-breakpoint
INSERT INTO "profile_catalog_item_revision" (
	"id", "item_id", "revision", "state", "name", "description", "is_free",
	"catalog_order", "published_at", "created_at", "updated_at"
) VALUES
	(
		'profile-layout-default-r1', 'profile-layout-default', 1, 'published',
		'Pila', 'Diseño protegido de una columna.', true, 0, now(), now(), now()
	),
	(
		'profile-skin-default-r1', 'profile-skin-default', 1, 'published',
		'Predeterminado', 'Apariencia protegida de NeXusTC.', true, 0, now(), now(), now()
	);
--> statement-breakpoint
INSERT INTO "profile_catalog_layout_revision" ("revision_id", "renderer_key")
VALUES ('profile-layout-default-r1', 'stack');
--> statement-breakpoint
INSERT INTO "profile_catalog_skin_revision" ("revision_id", "tokens")
VALUES (
	'profile-skin-default-r1',
	'{"cardAccent":"none","radius":"default","shadow":"default"}'::jsonb
);
--> statement-breakpoint
UPDATE "profile_catalog_item"
SET "current_published_revision_id" = 'profile-layout-default-r1', "updated_at" = now()
WHERE "id" = 'profile-layout-default';
--> statement-breakpoint
UPDATE "profile_catalog_item"
SET "current_published_revision_id" = 'profile-skin-default-r1', "updated_at" = now()
WHERE "id" = 'profile-skin-default';
--> statement-breakpoint
INSERT INTO "profile_showcase_type" (
	"key", "is_active", "published_config_revision", "created_at", "updated_at"
) VALUES
	('library', true, 1, now(), now()),
	('reviews', true, 1, now(), now()),
	('favorite-games', true, 1, now(), now()),
	('xp', true, 1, now(), now()),
	('streak', true, 1, now(), now()),
	('eteris', true, 1, now(), now());
