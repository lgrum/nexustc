-- Account-closure pseudonymization rewrites identity columns on settlement
-- history (user id -> wallet id). Migration 0099 re-created these three
-- append-only triggers without the rewrite exception that every other history
-- trigger has had since 0097, which aborted closure for any account holding
-- market or shop history.
CREATE OR REPLACE FUNCTION "prevent_black_market_listing_audit_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) - ARRAY['actor_user_id', 'actor_wallet_id'] = to_jsonb(OLD) - ARRAY['actor_user_id', 'actor_wallet_id']
    AND OLD.actor_user_id IS NOT NULL AND NEW.actor_user_id IS NULL
    AND OLD.actor_wallet_id IS NULL AND NEW.actor_wallet_id IS NOT NULL
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Black Market listing audit is append-only';
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_black_market_sale_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) - ARRAY['buyer_user_id', 'buyer_wallet_id', 'seller_user_id', 'seller_wallet_id']
      = to_jsonb(OLD) - ARRAY['buyer_user_id', 'buyer_wallet_id', 'seller_user_id', 'seller_wallet_id']
    AND (
      (NEW.buyer_user_id IS NOT DISTINCT FROM OLD.buyer_user_id AND NEW.buyer_wallet_id IS NOT DISTINCT FROM OLD.buyer_wallet_id)
      OR (OLD.buyer_user_id IS NOT NULL AND NEW.buyer_user_id IS NULL AND OLD.buyer_wallet_id IS NULL AND NEW.buyer_wallet_id IS NOT NULL)
    )
    AND (
      (NEW.seller_user_id IS NOT DISTINCT FROM OLD.seller_user_id AND NEW.seller_wallet_id IS NOT DISTINCT FROM OLD.seller_wallet_id)
      OR (OLD.seller_user_id IS NOT NULL AND NEW.seller_user_id IS NULL AND OLD.seller_wallet_id IS NULL AND NEW.seller_wallet_id IS NOT NULL)
    )
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Black Market sales are append-only';
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "prevent_official_card_shop_purchase_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND to_jsonb(NEW) - ARRAY['buyer_user_id', 'buyer_wallet_id'] = to_jsonb(OLD) - ARRAY['buyer_user_id', 'buyer_wallet_id']
    AND OLD.buyer_user_id IS NOT NULL AND NEW.buyer_user_id IS NULL
    AND OLD.buyer_wallet_id IS NULL AND NEW.buyer_wallet_id IS NOT NULL
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Official Card Shop purchases are append-only';
END;
$$;--> statement-breakpoint

-- Migration 0097 accidentally inverted the published-revision rule: it came to
-- reject EVERY change to a published revision, including the operational
-- availability/updated_at/version moves that issuance (exhaustion) and
-- moderation (disable/restore) must perform. Restore the 0081 allowlist for
-- those operational fields while keeping 0097's closure identity rewrite.
CREATE OR REPLACE FUNCTION "prevent_pack_revision_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'pack_revision' AND TG_OP = 'UPDATE'
    AND to_jsonb(NEW) - ARRAY['created_by_user_id', 'published_by_user_id', 'updated_by_user_id']
      = to_jsonb(OLD) - ARRAY['created_by_user_id', 'published_by_user_id', 'updated_by_user_id']
    AND (NEW.created_by_user_id IS NOT DISTINCT FROM OLD.created_by_user_id OR NEW.created_by_user_id IS NULL)
    AND (NEW.published_by_user_id IS NOT DISTINCT FROM OLD.published_by_user_id OR NEW.published_by_user_id IS NULL)
    AND (NEW.updated_by_user_id IS NOT DISTINCT FROM OLD.updated_by_user_id OR NEW.updated_by_user_id IS NULL)
  THEN
    RETURN NEW;
  END IF;
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
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
        OR NEW.published_by_user_id IS DISTINCT FROM OLD.published_by_user_id
      ) THEN
        RAISE EXCEPTION 'Published Pack Revision configuration is immutable';
      END IF;
    END IF;
  ELSE
    IF TG_OP = 'INSERT' THEN
      IF TG_TABLE_NAME = 'pack_draw_group' THEN
        IF EXISTS (SELECT 1 FROM pack_revision WHERE id = (to_jsonb(NEW)->>'revision_id') AND lifecycle = 'published') THEN
          RAISE EXCEPTION 'Published Pack Revision children are immutable';
        END IF;
      ELSIF EXISTS (
        SELECT 1 FROM pack_draw_group
        INNER JOIN pack_revision ON pack_revision.id = pack_draw_group.revision_id
        WHERE pack_draw_group.id = (to_jsonb(NEW)->>'draw_group_id') AND pack_revision.lifecycle = 'published'
      ) THEN
        RAISE EXCEPTION 'Published Pack Revision children are immutable';
      END IF;
    ELSIF TG_OP = 'UPDATE' AND (
      (TG_TABLE_NAME = 'pack_draw_group' AND EXISTS (
        SELECT 1 FROM pack_revision WHERE id = (to_jsonb(NEW)->>'revision_id') AND lifecycle = 'published'
      )) OR (TG_TABLE_NAME <> 'pack_draw_group' AND EXISTS (
        SELECT 1 FROM pack_draw_group
        INNER JOIN pack_revision ON pack_revision.id = pack_draw_group.revision_id
        WHERE pack_draw_group.id = (to_jsonb(NEW)->>'draw_group_id') AND pack_revision.lifecycle = 'published'
      ))
    ) THEN
      RAISE EXCEPTION 'Published Pack Revision children are immutable';
    ELSIF TG_TABLE_NAME = 'pack_draw_group' AND EXISTS (
      SELECT 1 FROM pack_revision WHERE id = (to_jsonb(OLD)->>'revision_id') AND lifecycle = 'published'
    ) THEN
      RAISE EXCEPTION 'Published Pack Revision children are immutable';
    ELSIF EXISTS (
      SELECT 1 FROM pack_draw_group
      INNER JOIN pack_revision ON pack_revision.id = pack_draw_group.revision_id
      WHERE pack_draw_group.id = (to_jsonb(OLD)->>'draw_group_id') AND pack_revision.lifecycle = 'published'
    ) THEN
      RAISE EXCEPTION 'Published Pack Revision children are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
