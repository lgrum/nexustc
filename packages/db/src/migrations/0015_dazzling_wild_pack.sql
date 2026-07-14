CREATE TYPE "public"."profile_assignment_source_type" AS ENUM('manual', 'seeded', 'system');--> statement-breakpoint
CREATE TYPE "public"."profile_banner_mode" AS ENUM('color', 'image');--> statement-breakpoint
CREATE TYPE "public"."profile_media_slot" AS ENUM('avatar', 'banner', 'role-icon', 'role-overlay', 'emblem-icon');--> statement-breakpoint
CREATE TYPE "public"."profile_media_validation_status" AS ENUM('pending', 'ready', 'rejected');--> statement-breakpoint
CREATE TABLE "profile_emblem_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"emblem_definition_id" text NOT NULL,
	"source_type" "profile_assignment_source_type" DEFAULT 'manual' NOT NULL,
	"source_key" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_emblem_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tooltip" text DEFAULT '' NOT NULL,
	"icon_asset_id" text,
	"visual_config" jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_emblem_definition_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "profile_media_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"slot" "profile_media_slot" NOT NULL,
	"mime_type" text NOT NULL,
	"object_key" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"duration_ms" integer,
	"is_animated" boolean DEFAULT false NOT NULL,
	"crop" jsonb,
	"validation_status" "profile_media_validation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_media_asset_object_key_unique" UNIQUE("object_key")
);
--> statement-breakpoint
CREATE TABLE "profile_role_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role_definition_id" text NOT NULL,
	"source_type" "profile_assignment_source_type" DEFAULT 'manual' NOT NULL,
	"source_key" text,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_role_definition" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon_asset_id" text,
	"overlay_asset_id" text,
	"visual_config" jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"is_exclusive" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_role_definition_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "profile_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"banner_mode" "profile_banner_mode" DEFAULT 'color' NOT NULL,
	"banner_color" text DEFAULT '#111827' NOT NULL,
	"banner_asset_id" text,
	"visibility_config" jsonb DEFAULT '{"reserved": {}}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_system_config" (
	"id" text PRIMARY KEY NOT NULL,
	"max_visible_emblems" integer DEFAULT 4 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "avatar_fallback_color" text DEFAULT '#f59e0b' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile_emblem_assignment" ADD CONSTRAINT "pea_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_emblem_assignment" ADD CONSTRAINT "pea_emblem_def_fk" FOREIGN KEY ("emblem_definition_id") REFERENCES "public"."profile_emblem_definition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_emblem_definition" ADD CONSTRAINT "ped_icon_asset_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."profile_media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_media_asset" ADD CONSTRAINT "pma_owner_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_role_assignment" ADD CONSTRAINT "pra_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_role_assignment" ADD CONSTRAINT "pra_role_def_fk" FOREIGN KEY ("role_definition_id") REFERENCES "public"."profile_role_definition"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_role_definition" ADD CONSTRAINT "prd_icon_asset_fk" FOREIGN KEY ("icon_asset_id") REFERENCES "public"."profile_media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_role_definition" ADD CONSTRAINT "prd_overlay_asset_fk" FOREIGN KEY ("overlay_asset_id") REFERENCES "public"."profile_media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_settings" ADD CONSTRAINT "ps_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_settings" ADD CONSTRAINT "ps_banner_asset_fk" FOREIGN KEY ("banner_asset_id") REFERENCES "public"."profile_media_asset"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_emblem_assignment_user_idx" ON "profile_emblem_assignment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profile_emblem_assignment_emblem_idx" ON "profile_emblem_assignment" USING btree ("emblem_definition_id");--> statement-breakpoint
CREATE INDEX "profile_emblem_definition_priority_idx" ON "profile_emblem_definition" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "profile_media_asset_owner_idx" ON "profile_media_asset" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "profile_media_asset_slot_idx" ON "profile_media_asset" USING btree ("slot");--> statement-breakpoint
CREATE INDEX "profile_media_asset_validation_idx" ON "profile_media_asset" USING btree ("validation_status");--> statement-breakpoint
CREATE INDEX "profile_role_assignment_user_idx" ON "profile_role_assignment" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "profile_role_assignment_role_idx" ON "profile_role_assignment" USING btree ("role_definition_id");--> statement-breakpoint
CREATE INDEX "profile_role_definition_priority_idx" ON "profile_role_definition" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "profile_role_definition_visible_idx" ON "profile_role_definition" USING btree ("is_visible");--> statement-breakpoint
CREATE INDEX "profile_settings_banner_asset_idx" ON "profile_settings" USING btree ("banner_asset_id");