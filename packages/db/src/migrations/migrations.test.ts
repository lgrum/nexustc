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
