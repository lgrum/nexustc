CREATE INDEX "pack_revision_template_availability_idx" ON "pack_revision" USING btree ("template_id","availability");--> statement-breakpoint

-- Published configuration is immutable, while availability is an operational
-- projection that issuance may move to disabled/exhausted.
CREATE OR REPLACE FUNCTION "prevent_pack_revision_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'pack_revision' THEN
    IF OLD.lifecycle = 'published' THEN
      IF TG_OP = 'DELETE' OR (
        NEW.template_id IS DISTINCT FROM OLD.template_id
        OR NEW.binding_policy IS DISTINCT FROM OLD.binding_policy
        OR NEW.card_count IS DISTINCT FROM OLD.card_count
        OR NEW.configuration_hash IS DISTINCT FROM OLD.configuration_hash
        OR NEW.duplicate_policy IS DISTINCT FROM OLD.duplicate_policy
        OR NEW.lifecycle IS DISTINCT FROM OLD.lifecycle
        OR NEW.revision IS DISTINCT FROM OLD.revision
        OR NEW.published_at IS DISTINCT FROM OLD.published_at
        OR NEW.published_by_user_id IS DISTINCT FROM OLD.published_by_user_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
      ) THEN
        RAISE EXCEPTION 'Published Pack Revision configuration is immutable';
      END IF;
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
