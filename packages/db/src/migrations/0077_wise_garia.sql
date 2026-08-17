CREATE TYPE "public"."pack_duplicate_policy" AS ENUM('allow', 'no-duplicates');--> statement-breakpoint
CREATE TYPE "public"."pack_lifecycle" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."pack_revision_availability" AS ENUM('active', 'disabled', 'exhausted');--> statement-breakpoint
CREATE TYPE "public"."pack_revision_lifecycle" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "pack_draw_group" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"draw_count" integer NOT NULL,
	"guarantees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"order" integer NOT NULL,
	"revision_id" text NOT NULL,
	CONSTRAINT "pack_draw_group_draw_count_check" CHECK ("pack_draw_group"."draw_count" > 0 AND "pack_draw_group"."draw_count" <= 20),
	CONSTRAINT "pack_draw_group_order_check" CHECK ("pack_draw_group"."order" > 0)
);
--> statement-breakpoint
CREATE TABLE "pack_draw_group_card_weight" (
	"card_template_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"draw_group_id" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"rarity" "card_rarity" NOT NULL,
	"weight" integer NOT NULL,
	CONSTRAINT "pack_draw_group_card_weight_bounds_check" CHECK ("pack_draw_group_card_weight"."weight" > 0 AND "pack_draw_group_card_weight"."weight" <= 1000000)
);
--> statement-breakpoint
CREATE TABLE "pack_draw_group_rarity_weight" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"draw_group_id" text NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"rarity" "card_rarity" NOT NULL,
	"weight" integer NOT NULL,
	CONSTRAINT "pack_draw_group_rarity_weight_bounds_check" CHECK ("pack_draw_group_rarity_weight"."weight" > 0 AND "pack_draw_group_rarity_weight"."weight" <= 1000000)
);
--> statement-breakpoint
CREATE TABLE "pack_revision" (
	"availability" "pack_revision_availability" DEFAULT 'active' NOT NULL,
	"card_count" integer NOT NULL,
	"configuration_hash" text,
	"created_by_user_id" text,
	"duplicate_policy" "pack_duplicate_policy" DEFAULT 'allow' NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"lifecycle" "pack_revision_lifecycle" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by_user_id" text,
	"revision" integer,
	"template_id" text NOT NULL,
	"updated_by_user_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pack_revision_card_count_check" CHECK ("pack_revision"."card_count" > 0 AND "pack_revision"."card_count" <= 20),
	CONSTRAINT "pack_revision_published_metadata_check" CHECK (("pack_revision"."lifecycle" = 'draft' AND "pack_revision"."revision" IS NULL AND "pack_revision"."configuration_hash" IS NULL) OR ("pack_revision"."lifecycle" = 'published' AND "pack_revision"."revision" > 0 AND "pack_revision"."configuration_hash" IS NOT NULL)),
	CONSTRAINT "pack_revision_version_check" CHECK ("pack_revision"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "pack_template" (
	"asset_media_id" text NOT NULL,
	"created_by_user_id" text,
	"description" text DEFAULT '' NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"latest_published_revision_id" text,
	"lifecycle" "pack_lifecycle" DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"retired_at" timestamp with time zone,
	"retired_by_user_id" text,
	"updated_by_user_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pack_template_version_check" CHECK ("pack_template"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "pack_draw_group" ADD CONSTRAINT "pack_draw_group_revision_id_pack_revision_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."pack_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_draw_group_card_weight" ADD CONSTRAINT "pack_draw_group_card_weight_card_template_id_card_template_id_fk" FOREIGN KEY ("card_template_id") REFERENCES "public"."card_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_draw_group_card_weight" ADD CONSTRAINT "pack_draw_group_card_weight_draw_group_id_pack_draw_group_id_fk" FOREIGN KEY ("draw_group_id") REFERENCES "public"."pack_draw_group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_draw_group_rarity_weight" ADD CONSTRAINT "pack_draw_group_rarity_weight_draw_group_id_pack_draw_group_id_fk" FOREIGN KEY ("draw_group_id") REFERENCES "public"."pack_draw_group"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_revision" ADD CONSTRAINT "pack_revision_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_revision" ADD CONSTRAINT "pack_revision_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_revision" ADD CONSTRAINT "pack_revision_template_id_pack_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."pack_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_revision" ADD CONSTRAINT "pack_revision_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_template" ADD CONSTRAINT "pack_template_asset_media_id_media_id_fk" FOREIGN KEY ("asset_media_id") REFERENCES "public"."media"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_template" ADD CONSTRAINT "pack_template_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_template" ADD CONSTRAINT "pack_template_retired_by_user_id_user_id_fk" FOREIGN KEY ("retired_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pack_template" ADD CONSTRAINT "pack_template_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pack_draw_group_revision_order_unique" ON "pack_draw_group" USING btree ("revision_id","order");--> statement-breakpoint
CREATE INDEX "pack_draw_group_revision_idx" ON "pack_draw_group" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pack_draw_group_card_weight_unique" ON "pack_draw_group_card_weight" USING btree ("draw_group_id","card_template_id");--> statement-breakpoint
CREATE INDEX "pack_draw_group_card_weight_group_idx" ON "pack_draw_group_card_weight" USING btree ("draw_group_id");--> statement-breakpoint
CREATE INDEX "pack_draw_group_card_weight_template_idx" ON "pack_draw_group_card_weight" USING btree ("card_template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pack_draw_group_rarity_weight_unique" ON "pack_draw_group_rarity_weight" USING btree ("draw_group_id","rarity");--> statement-breakpoint
CREATE INDEX "pack_draw_group_rarity_weight_group_idx" ON "pack_draw_group_rarity_weight" USING btree ("draw_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pack_revision_template_revision_unique" ON "pack_revision" USING btree ("template_id","revision");--> statement-breakpoint
CREATE INDEX "pack_revision_template_lifecycle_idx" ON "pack_revision" USING btree ("template_id","lifecycle");--> statement-breakpoint
CREATE INDEX "pack_revision_availability_idx" ON "pack_revision" USING btree ("availability");--> statement-breakpoint
CREATE INDEX "pack_template_lifecycle_idx" ON "pack_template" USING btree ("lifecycle");--> statement-breakpoint
CREATE INDEX "pack_template_latest_revision_idx" ON "pack_template" USING btree ("latest_published_revision_id");--> statement-breakpoint
ALTER TABLE "pack_template" ADD CONSTRAINT "pack_template_latest_revision_fk" FOREIGN KEY ("latest_published_revision_id") REFERENCES "public"."pack_revision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "prevent_pack_revision_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'pack_revision' THEN
    IF OLD.lifecycle = 'published' THEN
      RAISE EXCEPTION 'Published Pack Revisions are immutable';
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      IF TG_TABLE_NAME = 'pack_draw_group' THEN
        IF EXISTS (
          SELECT 1
          FROM "pack_revision"
          WHERE "pack_revision"."id" = (to_jsonb(NEW)->>'revision_id')
            AND "pack_revision"."lifecycle" = 'published'
        ) THEN
          RAISE EXCEPTION 'Published Pack Revision children are immutable';
        END IF;
      ELSIF EXISTS (
        SELECT 1
        FROM "pack_draw_group"
        INNER JOIN "pack_revision"
          ON "pack_revision"."id" = "pack_draw_group"."revision_id"
        WHERE "pack_draw_group"."id" = (to_jsonb(NEW)->>'draw_group_id')
          AND "pack_revision"."lifecycle" = 'published'
      ) THEN
        RAISE EXCEPTION 'Published Pack Revision children are immutable';
      END IF;
    ELSIF TG_OP = 'UPDATE' AND (
      (
        TG_TABLE_NAME = 'pack_draw_group'
        AND EXISTS (
          SELECT 1
          FROM "pack_revision"
          WHERE "pack_revision"."id" = (to_jsonb(NEW)->>'revision_id')
            AND "pack_revision"."lifecycle" = 'published'
        )
      )
      OR (
        TG_TABLE_NAME <> 'pack_draw_group'
        AND EXISTS (
          SELECT 1
          FROM "pack_draw_group"
          INNER JOIN "pack_revision"
            ON "pack_revision"."id" = "pack_draw_group"."revision_id"
          WHERE "pack_draw_group"."id" = (to_jsonb(NEW)->>'draw_group_id')
            AND "pack_revision"."lifecycle" = 'published'
        )
      )
    ) THEN
      RAISE EXCEPTION 'Published Pack Revision children are immutable';
    ELSIF TG_TABLE_NAME = 'pack_draw_group' AND EXISTS (
      SELECT 1
      FROM "pack_revision"
      WHERE "pack_revision"."id" = (to_jsonb(OLD)->>'revision_id')
        AND "pack_revision"."lifecycle" = 'published'
    ) THEN
      RAISE EXCEPTION 'Published Pack Revision children are immutable';
    ELSIF EXISTS (
      SELECT 1
      FROM "pack_draw_group"
      INNER JOIN "pack_revision"
        ON "pack_revision"."id" = "pack_draw_group"."revision_id"
      WHERE "pack_draw_group"."id" = (to_jsonb(OLD)->>'draw_group_id')
        AND "pack_revision"."lifecycle" = 'published'
    ) THEN
      RAISE EXCEPTION 'Published Pack Revision children are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "pack_revision_immutable"
BEFORE UPDATE OR DELETE ON "pack_revision"
FOR EACH ROW EXECUTE FUNCTION "prevent_pack_revision_mutation"();--> statement-breakpoint
CREATE TRIGGER "pack_draw_group_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "pack_draw_group"
FOR EACH ROW EXECUTE FUNCTION "prevent_pack_revision_mutation"();--> statement-breakpoint
CREATE TRIGGER "pack_draw_group_rarity_weight_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "pack_draw_group_rarity_weight"
FOR EACH ROW EXECUTE FUNCTION "prevent_pack_revision_mutation"();--> statement-breakpoint
CREATE TRIGGER "pack_draw_group_card_weight_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "pack_draw_group_card_weight"
FOR EACH ROW EXECUTE FUNCTION "prevent_pack_revision_mutation"();
