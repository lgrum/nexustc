ALTER TABLE "collectible_admin_action" ADD COLUMN "card_template_id" text;--> statement-breakpoint
ALTER TABLE "collectible_admin_action" ADD CONSTRAINT "collectible_admin_action_card_template_id_card_template_id_fk" FOREIGN KEY ("card_template_id") REFERENCES "public"."card_template"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION "prevent_collectible_admin_action_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'collectible_admin_action is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "collectible_admin_action_append_only"
BEFORE UPDATE OR DELETE ON "collectible_admin_action"
FOR EACH ROW EXECUTE FUNCTION "prevent_collectible_admin_action_mutation"();
