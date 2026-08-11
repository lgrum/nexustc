CREATE OR REPLACE FUNCTION "prevent_eteris_transaction_mutation"() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'UPDATE'
		AND OLD."actor_user_id" IS NOT NULL
		AND NEW."actor_user_id" IS NULL
		AND OLD."created_at" IS NOT DISTINCT FROM NEW."created_at"
		AND OLD."id" IS NOT DISTINCT FROM NEW."id"
		AND OLD."idempotency_key" IS NOT DISTINCT FROM NEW."idempotency_key"
		AND OLD."kind" IS NOT DISTINCT FROM NEW."kind"
		AND OLD."metadata" IS NOT DISTINCT FROM NEW."metadata"
		AND OLD."reason" IS NOT DISTINCT FROM NEW."reason"
		AND OLD."reverses_transaction_id" IS NOT DISTINCT FROM NEW."reverses_transaction_id"
		AND OLD."sequence" IS NOT DISTINCT FROM NEW."sequence"
		AND OLD."source_module" IS NOT DISTINCT FROM NEW."source_module"
		AND OLD."source_ref" IS NOT DISTINCT FROM NEW."source_ref"
	THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'eteris transactions are immutable';
END;
$$ LANGUAGE plpgsql;
