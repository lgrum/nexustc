ALTER TABLE "card_template" ADD CONSTRAINT "card_template_first_minted_at_consistency_check" CHECK (("card_template"."minted_supply" = 0 AND "card_template"."first_minted_at" IS NULL) OR ("card_template"."minted_supply" > 0 AND "card_template"."first_minted_at" IS NOT NULL));--> statement-breakpoint
CREATE FUNCTION "prevent_card_template_supply_mutation"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."minted_supply" < OLD."minted_supply" THEN
    RAISE EXCEPTION 'Card Template minted supply is monotonic';
  END IF;
  IF OLD."minted_supply" > 0
    AND NEW."lifetime_supply_ceiling" IS DISTINCT FROM OLD."lifetime_supply_ceiling" THEN
    RAISE EXCEPTION 'Card Template lifetime supply ceiling is immutable after first mint';
  END IF;
  IF NEW."lifetime_supply_ceiling" IS NOT NULL
    AND NEW."minted_supply" > NEW."lifetime_supply_ceiling" THEN
    RAISE EXCEPTION 'Card Template minted supply exceeds lifetime ceiling';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "card_template_supply_immutable"
BEFORE UPDATE ON "card_template"
FOR EACH ROW EXECUTE FUNCTION "prevent_card_template_supply_mutation"();
