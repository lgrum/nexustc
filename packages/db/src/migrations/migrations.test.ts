import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "vitest";

type MigrationJournal = {
  entries: { tag: string }[];
};

const migrationsDirectory = import.meta.dirname;

test("every migration journal tag has exactly one SQL file", async () => {
  const journal = JSON.parse(
    await readFile(
      path.join(migrationsDirectory, "meta", "_journal.json"),
      "utf-8"
    )
  ) as MigrationJournal;
  const journalFiles = journal.entries
    .map(({ tag }) => `${tag}.sql`)
    .toSorted();
  const directoryEntries = await readdir(migrationsDirectory, {
    withFileTypes: true,
  });
  const sqlFiles = directoryEntries
    .filter((entry) => entry.isFile() && path.extname(entry.name) === ".sql")
    .map((entry) => entry.name)
    .toSorted();

  expect(sqlFiles).toEqual(journalFiles);
});

test("collection visibility migration defaults to private and indexes owner reads", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0085_past_next_avengers.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain(`"publicCollection": false`);
  expect(migrationSql).toContain(
    'CREATE INDEX "card_instance_owner_issued_idx"'
  );
  expect(migrationSql).toContain(
    'CREATE INDEX "card_instance_owner_binding_idx"'
  );
  expect(migrationSql).toContain(
    'CREATE INDEX "pack_instance_owner_template_issued_idx"'
  );
  expect(migrationSql).toContain(
    'CREATE INDEX "pack_instance_owner_binding_idx"'
  );
});

test("collectible admin actions are append-only with restrictive history links", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0093_smiling_squadron_supreme.sql"),
    "utf-8"
  );
  const followUpSql = await readFile(
    path.join(migrationsDirectory, "0094_tan_praxagora.sql"),
    "utf-8"
  );
  const linkageSql = await readFile(
    path.join(migrationsDirectory, "0095_eminent_doctor_octopus.sql"),
    "utf-8"
  );
  const shapeSql = await readFile(
    path.join(migrationsDirectory, "0096_loving_norrin_radd.sql"),
    "utf-8"
  );
  expect(migrationSql).toContain('CREATE TABLE "collectible_admin_action"');
  expect(migrationSql).toContain("ON DELETE restrict ON UPDATE no action");
  expect(followUpSql).toContain(
    'CREATE TRIGGER "collectible_admin_action_append_only"'
  );
  expect(followUpSql).toContain(
    'CREATE FUNCTION "prevent_collectible_admin_action_mutation"'
  );
  expect(linkageSql).toContain(
    'FOREIGN KEY ("linked_action_id") REFERENCES "public"."collectible_admin_action"("id") ON DELETE restrict'
  );
  expect(shapeSql).toContain("collectible_admin_action_target_reference_check");
});

test("collectible account closure uses restrictive wallet pseudonyms and narrow immutable-history exceptions", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0097_polite_iceman.sql"),
    "utf-8"
  );

  for (const walletColumn of [
    "closed_owner_wallet_id",
    "actor_wallet_id",
    "recipient_wallet_id",
    "seller_wallet_id",
    "buyer_wallet_id",
    "owner_wallet_id",
    "user_wallet_id",
  ]) {
    expect(migrationSql).toContain(`ADD COLUMN "${walletColumn}"`);
  }
  expect(migrationSql).toContain(
    'REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict'
  );
  expect(migrationSql).toContain("pack_instance_owner_identity_check");
  expect(migrationSql).toContain("card_instance_exclusive_location_check");
  expect(migrationSql).toContain(
    'CREATE OR REPLACE FUNCTION "prevent_collectible_ownership_event_mutation"'
  );
  expect(migrationSql).toContain(
    "to_jsonb(NEW) - ARRAY['actor_user_id', 'actor_wallet_id'"
  );
  expect(migrationSql).toContain("OLD.state <> 'sent'");
  expect(migrationSql).not.toMatch(/DROP TABLE|DELETE FROM card_instance/);
});

test("collectible Profile Showcase migration extends the enum and seeds the registry", async () => {
  const enumMigrationSql = await readFile(
    path.join(migrationsDirectory, "0086_clumsy_surge.sql"),
    "utf-8"
  );
  const seedMigrationSql = await readFile(
    path.join(migrationsDirectory, "0087_profile-showcase-catalog-seed.sql"),
    "utf-8"
  );

  expect(enumMigrationSql).toContain(
    `ALTER TYPE "public"."profile_showcase_type_key" ADD VALUE 'card'`
  );
  expect(enumMigrationSql).toContain(
    `ALTER TYPE "public"."profile_showcase_type_key" ADD VALUE 'rare-card'`
  );
  expect(enumMigrationSql).toContain(
    `ALTER TYPE "public"."profile_showcase_type_key" ADD VALUE 'unopened-pack'`
  );
  expect(seedMigrationSql).toContain(
    `INSERT INTO "profile_showcase_type" ("key", "is_active", "published_config_revision", "required_tier", "created_at", "updated_at")`
  );
  expect(seedMigrationSql).toContain('ON CONFLICT ("key") DO NOTHING');
});

test("review likes migrate to stable review identities", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0056_cute_the_anarchist.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain('UPDATE "post_rating"');
  expect(migrationSql).toContain(
    'ALTER TABLE "post_rating" ALTER COLUMN "id" SET NOT NULL'
  );
  expect(migrationSql.indexOf('UPDATE "post_rating"')).toBeLessThan(
    migrationSql.indexOf(
      'ALTER TABLE "post_rating" ALTER COLUMN "id" SET NOT NULL'
    )
  );
  expect(migrationSql).toContain('SET "rating_id" = "rating"."id"');
  expect(migrationSql).toContain(
    'DELETE FROM "post_rating_like" WHERE "rating_id" IS NULL'
  );
  expect(migrationSql).toContain(
    'FOREIGN KEY ("rating_id") REFERENCES "public"."post_rating"("id") ON DELETE cascade'
  );
  expect(migrationSql).toContain('PRIMARY KEY("user_id","rating_id")');
});

test("account progression starts dormant with immutable append-only storage", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0057_curvy_venus.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain('CREATE TABLE "progression_system"');
  expect(migrationSql).toContain(
    'CREATE TRIGGER "progression_activation_immutable"'
  );
  expect(migrationSql).toContain('CREATE TABLE "user_progression"');
  expect(migrationSql).toContain(
    'CHECK ("user_progression"."total_xp" between 0 and 365000)'
  );
  expect(migrationSql).toContain('CREATE TABLE "xp_event"');
  expect(migrationSql).toContain(
    'CONSTRAINT "xp_event_idempotency_key_unique" UNIQUE("idempotency_key")'
  );
});

test("Eteris uses an immutable balanced-ledger schema", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0058_supreme_black_panther.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain('CREATE TABLE "eteris_wallet"');
  expect(migrationSql).toContain('CREATE TABLE "eteris_wallet_balance"');
  expect(migrationSql).toContain('CREATE TABLE "eteris_transaction"');
  expect(migrationSql).toContain('CREATE TABLE "eteris_posting"');
  expect(migrationSql).toContain('CREATE TRIGGER "eteris_posting_immutable"');
  expect(migrationSql).toContain(
    'CREATE TRIGGER "eteris_transaction_immutable"'
  );
  expect(migrationSql).toContain(
    'CONSTRAINT "eteris_transaction_idempotency_key_unique" UNIQUE("idempotency_key")'
  );
  expect(migrationSql).toContain(
    'CONSTRAINT "eteris_posting_amount_check" CHECK ("eteris_posting"."amount" <> 0)'
  );
  expect(migrationSql).toContain(
    'FOREIGN KEY ("wallet_id") REFERENCES "public"."eteris_wallet"("id") ON DELETE restrict'
  );
});

test("Eteris transaction anonymization cannot rewrite ledger sequence", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0066_immutable_eteris_sequence.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain(
    'OLD."sequence" IS NOT DISTINCT FROM NEW."sequence"'
  );
  expect(migrationSql).toContain(
    'CREATE OR REPLACE FUNCTION "prevent_eteris_transaction_mutation"'
  );
});

test("Eteris records wallet status history for cutoff reports", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0067_eteris_wallet_status_history.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain('CREATE TABLE "eteris_wallet_status_event"');
  expect(migrationSql).toContain(
    'CREATE TRIGGER "eteris_wallet_status_history"'
  );
  expect(migrationSql).toContain('INSERT INTO "eteris_wallet_status_event"');
});

test("zero-clipped reversals remain consumed in the XP ledger", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0068_amusing_jasper_sitwell.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain(
    '"xp_event"."kind" = \'reversal\' and "xp_event"."reverses_event_id" is not null'
  );
  expect(migrationSql).toContain('"xp_event"."state" = \'posted\'');
});

test("comic reading XP uses compact ranges on existing progress", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0059_thin_vanisher.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain(
    "ADD COLUMN \"xp_processed_page_ranges\" jsonb DEFAULT '[]'::jsonb NOT NULL"
  );
  expect(migrationSql).toContain(
    'ADD COLUMN "xp_tracking_updated_at" timestamp with time zone'
  );
  expect(migrationSql).toContain('UPDATE "user_comic_progress"');
  expect(migrationSql).toContain("jsonb_build_array(1, GREATEST(");
  expect(migrationSql).not.toContain("CREATE TABLE");
});

test("review reward subjects survive review deletion for audited reversal", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0060_mean_yellowjacket.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain('CREATE TABLE "xp_reward_subject"');
  expect(migrationSql).toContain(
    'CREATE UNIQUE INDEX "xp_reward_subject_kind_entity_unique"'
  );
  expect(migrationSql).not.toContain(
    'FOREIGN KEY ("entity_id") REFERENCES "public"."post_rating"'
  );
  expect(migrationSql).toContain(
    'FOREIGN KEY ("subject_id") REFERENCES "public"."xp_reward_subject"("id") ON DELETE set null'
  );
  expect(migrationSql).toContain(
    'CREATE UNIQUE INDEX "xp_reward_block_user_kind_scope_unique"'
  );
});

test("integrity evidence is private, expiring, and tied to human cases", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0061_pending_xp_integrity.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain('CREATE TABLE "xp_integrity_case"');
  expect(migrationSql).toContain('CREATE TABLE "xp_risk_signal"');
  expect(migrationSql).toContain('CREATE TABLE "xp_like_disqualification"');
  expect(migrationSql).not.toContain("raw_ip");
  expect(migrationSql).toContain(
    'CREATE INDEX "xp_risk_signal_expires_at_idx"'
  );
  expect(migrationSql).toContain(
    'FOREIGN KEY ("integrity_case_id") REFERENCES "public"."xp_integrity_case"("id")'
  );
});

test("economy operations persist one UTC snapshot and audited reconciliation", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0062_operational_economy.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain('CREATE TABLE "eteris_daily_snapshot"');
  expect(migrationSql).toContain('"day" date PRIMARY KEY NOT NULL');
  expect(migrationSql).toContain('CREATE TABLE "eteris_wallet_reconciliation"');
  expect(migrationSql).not.toMatch(/email|device_hash|ip_prefix_hash/);
});

test("daily streak state is private, bounded, and removed with its account", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0069_organic_captain_america.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain(
    `ALTER TYPE "public"."xp_event_kind" ADD VALUE 'streak_day'`
  );
  expect(migrationSql).toContain('CREATE TABLE "user_streak"');
  expect(migrationSql).toContain('"current_evidence" jsonb DEFAULT');
  expect(migrationSql).toContain(
    'FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade'
  );
  expect(migrationSql).not.toMatch(/comment_body|review_body|telemetry/);
});

test("streak challenges persist one immutable target and completion", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0069_organic_captain_america.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain(
    `ALTER TYPE "public"."xp_event_kind" ADD VALUE 'streak_challenge'`
  );
  expect(migrationSql).toContain('"challenge_target" integer');
  expect(migrationSql).toContain('"challenge_target" in (10, 20, 30)');
  expect(migrationSql).toContain('"challenge_completed_day_key" text');
});

test("zero-XP streak ledger entries avoid uncommitted enum labels", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0070_hard_lucky_pierre.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain("completionLedger");
  expect(migrationSql).not.toContain("streak_day");
  expect(migrationSql).not.toContain("streak_challenge");
});

test("profile customization seeds only shared protected defaults", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0071_lonely_payback.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain('CREATE TABLE "profile_customization"');
  expect(migrationSql).toContain("'profile-layout-default'");
  expect(migrationSql).toContain("'profile-skin-default'");
  expect(migrationSql).toContain('INSERT INTO "profile_showcase_type"');
  expect(migrationSql).not.toContain('INSERT INTO "profile_customization"');
  expect(migrationSql).not.toMatch(/SELECT[\s\S]+FROM "user"/);
});

test("profile customization cascades personal state but preserves catalog history", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0071_lonely_payback.sql"),
    "utf-8"
  );

  for (const foreignKey of [
    "pc_user_fk",
    "ped_user_fk",
    "psc_user_fk",
    "pco_user_fk",
  ]) {
    expect(migrationSql).toMatch(
      new RegExp(`${foreignKey}[\\s\\S]{0,180}ON DELETE cascade`)
    );
  }
  for (const foreignKey of [
    "pcir_item_fk",
    "pc_layout_item_fk",
    "pc_skin_item_fk",
    "ped_catalog_item_fk",
    "pco_catalog_item_fk",
  ]) {
    expect(migrationSql).toMatch(
      new RegExp(`${foreignKey}[\\s\\S]{0,180}ON DELETE restrict`)
    );
  }
  expect(migrationSql).toMatch(/pca_actor_fk[\s\S]{0,180}ON DELETE set null/);
});

test("profile layouts have stable published catalog identities", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0072_add_profile_layout_catalog.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain("'profile-layout-grid', 'layout.grid'");
  expect(migrationSql).toContain(
    "'profile-layout-spotlight', 'layout.spotlight'"
  );
  expect(migrationSql).toContain("'profile-layout-grid-r1', 'grid'");
  expect(migrationSql).toContain("'profile-layout-spotlight-r1', 'spotlight'");
});

test("card template audit history is protected by an append-only trigger", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0076_mute_edwin_jarvis.sql"),
    "utf-8"
  );

  expect(migrationSql).toContain('CREATE TABLE "card_template_audit_event"');
  expect(migrationSql).toContain(
    'CREATE FUNCTION "prevent_card_template_audit_event_mutation"()'
  );
  expect(migrationSql).toContain(
    'CREATE TRIGGER "card_template_audit_event_append_only"'
  );
  expect(migrationSql).toContain("BEFORE UPDATE OR DELETE");
});

test("Pack revisions and normalized draw groups are immutable after publication", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0077_wise_garia.sql"),
    "utf-8"
  );

  for (const table of [
    '"pack_revision"',
    '"pack_draw_group"',
    '"pack_draw_group_rarity_weight"',
    '"pack_draw_group_card_weight"',
  ]) {
    expect(migrationSql).toContain(
      table === '"pack_revision"'
        ? `BEFORE UPDATE OR DELETE ON ${table}`
        : `BEFORE INSERT OR UPDATE OR DELETE ON ${table}`
    );
  }
  expect(migrationSql).toContain(
    'CREATE OR REPLACE FUNCTION "prevent_pack_revision_mutation"()'
  );
  expect(migrationSql).toContain(
    'ALTER TABLE "pack_template" ADD CONSTRAINT "pack_template_latest_revision_fk"'
  );
  expect(migrationSql).toContain("Published Pack Revisions are immutable");
  expect(migrationSql).toContain(
    'CONSTRAINT "pack_draw_group_card_weight_bounds_check"'
  );
});

test("Pack revision binding policy remains an explicit integer-domain contract", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0078_silly_thena.sql"),
    "utf-8"
  );
  expect(migrationSql).toContain('CREATE TYPE "public"."pack_binding_policy"');
  expect(migrationSql).toContain('ADD COLUMN "binding_policy"');
  expect(migrationSql).toContain("'transferable', 'account-bound', 'either'");
});

test("collectible issuance keeps hidden outcomes and history append-only", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0079_sour_toro.sql"),
    "utf-8"
  );
  expect(migrationSql).toContain('CREATE TABLE "pack_instance"');
  expect(migrationSql).toContain('CREATE TABLE "collectible_ownership_event"');
  expect(migrationSql).toContain(
    'FOREIGN KEY ("card_instance_id") REFERENCES "public"."card_instance"("id") ON DELETE restrict'
  );
  expect(migrationSql).toContain(
    'CREATE TRIGGER "collectible_ownership_event_append_only"'
  );
  expect(migrationSql).toContain(
    'CREATE TRIGGER "collectible_grant_execution_append_only"'
  );
  expect(migrationSql).toContain(
    'CREATE TRIGGER "card_instance_issuance_immutable"'
  );
  expect(migrationSql).toContain(
    'CREATE TRIGGER "pack_instance_provenance_immutable"'
  );
  expect(migrationSql).toContain("OLD.\"outcome_digest\" <> 'pending'");
});

test("card template supply remains monotonic and ceilings freeze after first mint", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0080_cloudy_owl.sql"),
    "utf-8"
  );
  expect(migrationSql).toContain(
    'CONSTRAINT "card_template_first_minted_at_consistency_check"'
  );
  expect(migrationSql).toContain(
    'CREATE FUNCTION "prevent_card_template_supply_mutation"()'
  );
  expect(migrationSql).toContain(
    'CREATE TRIGGER "card_template_supply_immutable"'
  );
  expect(migrationSql).toContain('NEW."minted_supply" < OLD."minted_supply"');
  expect(migrationSql).toContain('OLD."minted_supply" > 0');
});

test("trade custody and offer history keep active uniqueness and immutable terms", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0088_free_switch.sql"),
    "utf-8"
  );
  expect(migrationSql).toContain(
    'CREATE UNIQUE INDEX "collectible_custody_active_card_unique"'
  );
  expect(migrationSql).toContain(
    'CREATE UNIQUE INDEX "collectible_custody_active_pack_unique"'
  );
  expect(migrationSql).toContain("ON DELETE restrict");
  expect(migrationSql).toContain(
    'CREATE TRIGGER "trade_offer_history_append_only"'
  );
  expect(migrationSql).toContain(
    'CREATE TRIGGER "trade_offer_terms_immutable"'
  );
  expect(migrationSql).toContain(
    'CREATE TRIGGER "collectible_custody_identity_immutable"'
  );
});

test("trade bundle hardening permits many assets per side and keeps retained lookups indexed", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0089_trade_bundle_hardening.sql"),
    "utf-8"
  );
  expect(migrationSql).toContain(
    'DROP INDEX IF EXISTS "collectible_custody_active_trade_side_unique"'
  );
  expect(migrationSql).toContain(
    'CREATE INDEX "collectible_custody_trade_side_idx"'
  );
  expect(migrationSql).toContain(
    'CREATE INDEX "collectible_custody_card_lookup_idx"'
  );
  expect(migrationSql).toContain(
    'CREATE INDEX "collectible_custody_pack_lookup_idx"'
  );
});

test("gift offers keep free-transfer custody, immutable terms, and append-only history", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0090_ambiguous_loki.sql"),
    "utf-8"
  );
  expect(migrationSql).toContain('CREATE TYPE "public"."gift_offer_state"');
  expect(migrationSql).toContain('CREATE TABLE "gift_offer"');
  expect(migrationSql).toContain('CREATE TABLE "gift_offer_history"');
  expect(migrationSql).toContain(
    'ADD CONSTRAINT "collectible_custody_one_parent_check"'
  );
  expect(migrationSql).toContain(
    'CREATE TRIGGER "gift_offer_history_append_only"'
  );
  expect(migrationSql).toContain('CREATE TRIGGER "gift_offer_terms_immutable"');
  expect(migrationSql).toContain(
    'ADD COLUMN "inbound_gifts_enabled" boolean DEFAULT true NOT NULL'
  );
  expect(migrationSql).toContain("ADD VALUE 'gift'");
});

test("published pack configuration stays immutable while availability can exhaust", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0081_medical_tyrannus.sql"),
    "utf-8"
  );
  expect(migrationSql).toContain(
    'CREATE INDEX "pack_revision_template_availability_idx"'
  );
  expect(migrationSql).toContain(
    'CREATE OR REPLACE FUNCTION "prevent_pack_revision_mutation"()'
  );
  expect(migrationSql).toContain(
    "NEW.configuration_hash IS DISTINCT FROM OLD.configuration_hash"
  );
  expect(migrationSql).toContain("-- projection that issuance may move");
});

test("pack openings retain committed results and a unique replay key", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0082_spotty_bloodstorm.sql"),
    "utf-8"
  );
  expect(migrationSql).toContain('CREATE TABLE "pack_opening"');
  expect(migrationSql).toContain('"cards" jsonb NOT NULL');
  expect(migrationSql).toContain('"fingerprint" text NOT NULL');
  expect(migrationSql).toContain(
    'CREATE UNIQUE INDEX "pack_opening_idempotency_key_unique"'
  );
  expect(migrationSql).toContain(
    'FOREIGN KEY ("pack_instance_id") REFERENCES "public"."pack_instance"("id") ON DELETE restrict'
  );
});

test("Official Shop migration preserves audit history and authoritative links", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0083_fuzzy_scream.sql"),
    "utf-8"
  );
  for (const table of [
    '"official_card_shop_offer"',
    '"official_card_shop_offer_audit_event"',
    '"official_card_shop_offer_usage"',
    '"official_card_shop_purchase"',
    '"official_card_shop_purchase_item"',
  ]) {
    expect(migrationSql).toContain(`CREATE TABLE ${table}`);
  }
  expect(migrationSql).toContain(
    'CONSTRAINT "official_card_shop_purchase_idempotency_key_unique" UNIQUE("idempotency_key")'
  );
  expect(migrationSql).toContain(
    'CREATE TRIGGER "official_card_shop_offer_audit_event_append_only"'
  );
  expect(migrationSql).toContain(
    'FOREIGN KEY ("eteris_transaction_id") REFERENCES "public"."eteris_transaction"("id") ON DELETE restrict'
  );
  expect(migrationSql).toContain(
    'FOREIGN KEY ("pack_instance_id") REFERENCES "public"."pack_instance"("id") ON DELETE restrict'
  );
});

test("Gachapon migration keeps weighted machine configuration and activation history immutable", async () => {
  const migrationSql = await readFile(
    path.join(migrationsDirectory, "0084_cynical_joshua_kane.sql"),
    "utf-8"
  );
  for (const table of [
    '"gachapon_machine"',
    '"gachapon_machine_pack_entry"',
    '"gachapon_machine_usage"',
    '"gachapon_activation"',
    '"gachapon_machine_audit_event"',
  ]) {
    expect(migrationSql).toContain(`CREATE TABLE ${table}`);
  }
  expect(migrationSql).toContain(
    'CONSTRAINT "gachapon_machine_pack_entry_weight_check" CHECK'
  );
  expect(migrationSql).toContain(
    'CONSTRAINT "gachapon_activation_idempotency_key_unique" UNIQUE("idempotency_key")'
  );
  expect(migrationSql).toContain(
    'CREATE TRIGGER "gachapon_machine_pack_entry_immutable_after_activation"'
  );
  expect(migrationSql).toContain(
    'CREATE TRIGGER "gachapon_activation_append_only"'
  );
  expect(migrationSql).toContain(
    'CREATE TRIGGER "gachapon_machine_audit_event_append_only"'
  );
  expect(migrationSql).toContain(
    'FOREIGN KEY ("eteris_transaction_id") REFERENCES "public"."eteris_transaction"("id") ON DELETE restrict'
  );
  expect(migrationSql).not.toMatch(/rarity_modifier|direct_card|outcome/);
});
