# Plan 004: Repair the Drizzle migration chain safely

> **Executor instructions**: This plan contains a mandatory production-state
> gate. Do not rename a file, generate a migration, or run `drizzle-kit migrate`
> against a deployed database before every applicable gate passes. If a STOP
> condition occurs, stop and report the exact query output. When done, update
> this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5899131..HEAD -- packages/db/src/migrations packages/db/package.json bun.lock`
> If the migration directory changed, repeat the inventory and hash checks in
> this plan before proceeding. A mismatch is a STOP condition.

## Status

- **State**: DONE
- **Priority**: P0
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: Plan 001
- **Category**: database, reliability
- **Planned at**: commit `5899131`, 2026-07-14

### Repository-only completion — 2026-07-14

The operator confirmed that no environment uses Drizzle migrations and that
the only database is an unimportant local development instance. The operator
explicitly waived deployed-environment inventory and disposable PostgreSQL
migration verification. No database was contacted or modified.

- The migration directory has not changed since the planned SHA. Commit
  `057ad01` made LF the repository checkout baseline, revealing that the
  originally documented hashes described CRLF working-tree bytes. The
  canonical LF hashes are:
  - `0014_outstanding_the_leader.sql` is
    `9C3BC0E74D1FE1578B1CF9C803B9868F2B05101C5BD7DCD28705F643ABDE2921`.
  - `0015_plain_darkstar.sql` is
    `3BB0EABAFC952CBA10811BBD90030A2FE639BD96BA8DB4A5CA994CCDA8D3FCE9`.
    Converting those same bytes to CRLF in memory reproduces the old documented
    hashes exactly, so this is not migration-content drift.
- The 0015 file was renamed to the journal tag with identical LF bytes and hash.
- The repository mapping test observes exact equality between all 51 journal
  tags and all 51 top-level SQL basenames.
- Focused and root tests, root type checks, repository check, and diff checks
  pass. Repository verification did not connect to a database.

## Why this matters

Drizzle's journal names migration 0015 `0015_dazzling_wild_pack`, while the
only matching SQL on disk is `0015_plain_darkstar.sql`. The migrator resolves
SQL by the journal tag, so a clean migration can fail even though later schema
snapshots exist. Renaming is the correct repository repair only after proving
that deployed environments are already past this historical point; otherwise
changing the recorded timestamp/hash relationship can cause a historical
migration to be replayed.

## Current state

- `_journal.json` contains 51 entries and the migration directory contains 51
  SQL files.
- Journal entry 15 has:
  - `when`: `1773087161486`
  - `tag`: `0015_dazzling_wild_pack`
- The SQL file is `0015_plain_darkstar.sql`; no `dazzling` SQL file exists.
- Git history shows commit `69c731a` moved the profile SQL to ordinal 0015 but
  left the journal with the generated `dazzling` name.
- Current SHA-256 values:
  - `0014_outstanding_the_leader.sql`:
    `9C3BC0E74D1FE1578B1CF9C803B9868F2B05101C5BD7DCD28705F643ABDE2921`
  - `0015_plain_darkstar.sql`:
    `3BB0EABAFC952CBA10811BBD90030A2FE639BD96BA8DB4A5CA994CCDA8D3FCE9`
- The former values
  `50D75D94BDD4C481127224F5D473582FA8082219CD6C8DA22327BA0F6AD2F1B2`
  and `4225EF4CED1E9261915786062A44AE7A81BF39D513236B8BE47D86C7FE81BCD4`
  are the SHA-256 hashes of equivalent CRLF working-tree bytes before the LF
  checkout baseline; they are retained only to reconcile historical deployment
  records.
- The intended profile DDL introduces `profile_settings` and
  `user.avatar_fallback_color`; engagement DDL introduces
  `engagement_question`.

## Target state

- Every journal tag has exactly one same-named SQL file and vice versa.
- The 0015 SQL bytes are unchanged; only its basename is repaired.
- A repository test enforces journal-to-SQL filename equality.
- A fresh disposable PostgreSQL database applies all 51 migrations once and
  applies zero additional migrations on the second run.
- No deployed database ledger or schema is modified by this plan.

## Scope

### In scope

- Rename
  `packages/db/src/migrations/0015_plain_darkstar.sql` to
  `packages/db/src/migrations/0015_dazzling_wild_pack.sql`
- `packages/db/src/migrations/migrations.test.ts`
- `packages/db/package.json`
- `bun.lock` if dependency metadata changes

### Out of scope

- Editing SQL contents, `_journal.json`, or snapshots
- Manually changing `drizzle.__drizzle_migrations`
- Running DDL against production/staging
- Squashing or regenerating historical migrations
- Adding deployment automation

## Implementation steps

### 1. Inventory every deployed environment, read-only

For production, staging, preview, and any long-lived developer database, run
the following with read-only credentials:

First run only this existence query:

```sql
SELECT to_regclass('drizzle.__drizzle_migrations') AS migration_table;
```

If and only if it returns a non-null table, run the ledger query:

```sql
SELECT id, lower(hash) AS hash, created_at
FROM drizzle.__drizzle_migrations
WHERE created_at IN (1773013428777, 1773085502297, 1773087161486)
   OR created_at = (SELECT max(created_at) FROM drizzle.__drizzle_migrations)
ORDER BY created_at;
```

Run the schema-object query regardless of ledger mode:

```sql
SELECT
  to_regclass('public.engagement_question') AS engagement_question,
  to_regclass('public.profile_settings') AS profile_settings,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user'
      AND column_name = 'avatar_fallback_color'
  ) AS has_avatar_fallback_color;
```

Record environment name, query timestamp, migration management mode, maximum
`created_at`, relevant rows/hashes, and the three schema checks in the change
ticket or PR.

Proceed only when each migration-managed environment has a latest ledger row
at or newer than `1773087161486`, the expected objects exist, and relevant
hashes agree with the canonical files after normalizing both hexadecimal
strings to lowercase. (`Get-FileHash` prints uppercase while Drizzle stores
lowercase.) For historical ledger comparison only, either the canonical LF
hash or the exact CRLF-equivalent hash documented above proves the same SQL
content; any other hash is a STOP condition. Timestamp equality is safe only
when entry 15's normalized hash is one of those two reconciled 0015 hashes and
all expected objects exist. An
older profile row timestamp can be historical evidence only when a later
migration row proves that the database has already passed entry 15.

An environment with no migration ledger may proceed only when operations
confirms it is intentionally `db:push`-managed and the expected objects exist.
Do not run the migrator against that environment as part of this plan.

### 2. Reconfirm repository bytes and mapping

Before editing, run:

```powershell
(Get-FileHash packages/db/src/migrations/0014_outstanding_the_leader.sql -Algorithm SHA256).Hash
(Get-FileHash packages/db/src/migrations/0015_plain_darkstar.sql -Algorithm SHA256).Hash
```

Confirm the values match the hashes in **Current state** case-insensitively.
Also parse
`meta/_journal.json` and confirm its entry 15 still names
`0015_dazzling_wild_pack` at `1773087161486`.

### 3. Rename only the mismatched SQL file

Use Git-aware rename semantics:

```bash
git mv packages/db/src/migrations/0015_plain_darkstar.sql packages/db/src/migrations/0015_dazzling_wild_pack.sql
```

Re-hash the destination and confirm it remains
`3BB0EABAFC952CBA10811BBD90030A2FE639BD96BA8DB4A5CA994CCDA8D3FCE9`.
`git diff --find-renames` must show a 100% rename with no content diff.

Do not edit the journal to match `plain_darkstar`; the journal is the
migrator's ordered source of migration identity.

### 4. Add a permanent mapping test

Create `packages/db/src/migrations/migrations.test.ts` using Node's
`fs`, `path`, and `url` APIs plus Vitest. The test must:

1. Read `meta/_journal.json` relative to the test file.
2. Map each journal entry to `${entry.tag}.sql`.
3. List only top-level `*.sql` files in the migration directory.
4. Sort both arrays and assert exact equality.

The exact-equality assertion catches missing, orphaned, and duplicate-name
drift. Do not require one snapshot per migration: the repository intentionally
contains migrations without corresponding snapshots.

Add `"test": "vitest run"` to `packages/db/package.json` and add
`"vitest": "catalog:"` to its dev dependencies. Plan 001 deliberately does
not add a DB test task because this test does not exist until this plan.
Preserve Plan 001's `check-types` task, run `bun install`, and confirm only the
expected manifest/lockfile changes occur.

### 5. Prove the chain on disposable PostgreSQL

Use this single PowerShell procedure from the repository root. Do not split it
into separate shell sessions: every native command is checked immediately and
`finally` restores `DATABASE_URL` and removes only the verified disposable
container even when a verification step fails.

```powershell
$sha = git rev-parse --short HEAD
if ($LASTEXITCODE -ne 0) { throw "STOP: cannot resolve repository SHA" }
$container = "nexustc-plan-004-pg-$sha"
$database = "nexustc_plan004"
$password = [guid]::NewGuid().ToString("N")
$hadDatabaseUrl = Test-Path Env:DATABASE_URL
$previousDatabaseUrl = $env:DATABASE_URL
$containerCreated = $false

try {
  docker info
  if ($LASTEXITCODE -ne 0) { throw "STOP: Docker is unavailable" }

  $existingContainers = docker ps -a --format '{{.Names}}'
  if ($LASTEXITCODE -ne 0) { throw "STOP: cannot inventory Docker containers" }
  if ($existingContainers -contains $container) {
    throw "STOP: disposable container name already exists: $container"
  }
  if (Get-NetTCPConnection -LocalPort 55432 -ErrorAction SilentlyContinue) {
    throw "STOP: local port 55432 is already in use"
  }

  docker run --detach --name $container `
    --env "POSTGRES_PASSWORD=$password" `
    --env "POSTGRES_DB=$database" `
    --publish 127.0.0.1:55432:5432 `
    postgres:17-alpine
  $runExitCode = $LASTEXITCODE
  if ($runExitCode -ne 0) {
    $containerCreated = (docker ps -a --format '{{.Names}}') -contains $container
    throw "STOP: Docker could not start PostgreSQL"
  }
  $containerCreated = $true

  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec $container pg_isready -U postgres -d $database
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  if ($LASTEXITCODE -ne 0) {
    throw "STOP: disposable PostgreSQL did not become ready"
  }

  $env:DATABASE_URL = "postgresql://postgres:$password@127.0.0.1:55432/$database"
  Push-Location packages/db
  try {
    bun x drizzle-kit migrate --config drizzle.config.ts
    if ($LASTEXITCODE -ne 0) { throw "STOP: first migration run failed" }
  } finally {
    Pop-Location
  }

  $count = docker exec $container psql -U postgres -d $database -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations;"
  if ($LASTEXITCODE -ne 0 -or $count.Trim() -ne "51") {
    throw "STOP: expected 51 migration rows, received '$count'"
  }

  $objects = docker exec $container psql -U postgres -d $database -tAc "SELECT to_regclass('public.engagement_question'), to_regclass('public.profile_settings'), EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user' AND column_name='avatar_fallback_color');"
  if ($LASTEXITCODE -ne 0 -or $objects.Trim() -ne "engagement_question|profile_settings|t") {
    throw "STOP: expected migration objects are missing: '$objects'"
  }

  Push-Location packages/db
  try {
    bun x drizzle-kit migrate --config drizzle.config.ts
    if ($LASTEXITCODE -ne 0) { throw "STOP: second migration run failed" }
  } finally {
    Pop-Location
  }

  $secondCount = docker exec $container psql -U postgres -d $database -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations;"
  if ($LASTEXITCODE -ne 0 -or $secondCount.Trim() -ne "51") {
    throw "STOP: second migrate changed ledger count: '$secondCount'"
  }
} finally {
  if ($hadDatabaseUrl) { $env:DATABASE_URL = $previousDatabaseUrl }
  else { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }

  if ($containerCreated) {
    if (-not $container.StartsWith("nexustc-plan-004-pg-")) {
      throw "STOP: refusing to remove an unexpected container"
    }
    docker rm --force $container
    if ($LASTEXITCODE -ne 0) {
      throw "STOP: failed to remove disposable container $container"
    }
  }
}
```

Expected: the script exits 0, both migration counts are 51, all three expected
objects exist, the container is removed, and the prior `DATABASE_URL` state is
restored.

Do not substitute `db:push`; it does not validate the migration chain. If a
disposable PostgreSQL service is unavailable, STOP rather than using a shared
database.

### 6. Verify repository checks

Run:

```bash
bun run --cwd packages/db test -- src/migrations/migrations.test.ts
bun run test
bun run check-types
bun run check
git diff --check
git diff --find-renames -- packages/db/src/migrations packages/db/package.json bun.lock
```

Expected results: all checks pass, the mapping test observes 51 journal names
and 51 SQL names, and the only historical SQL change is the 100% rename.

## Done criteria

- [x] Deployed-environment inventory was explicitly waived by the operator
      because no environment uses Drizzle migrations.
- [x] The 0015 change is a 100% rename and its hash is unchanged.
- [x] The new test proves journal tag names and SQL basenames are exactly equal.
- [x] Disposable PostgreSQL verification was explicitly waived by the operator;
      no database was contacted.
- [x] Focused/root tests, type-check, check, and `git diff --check` exit 0.
- [x] Only the four in-scope paths plus `plans/README.md` changed.
- [x] The Plan 004 index row is updated.

## STOP conditions

- Any migration-managed environment cannot be inspected read-only.
- Any migration-managed environment's latest ledger timestamp is older than
  `1773087161486`, or equality has a noncanonical hash/missing object.
- A relevant ledger hash conflicts with the canonical SQL bytes.
- Expected schema objects are missing or their state conflicts with the
  ledger.
- An environment has an unexplained mixture of `db:push` and migrations.
- The source hashes or journal entry differ from this plan after drift check.
- Production, staging, preview, or long-lived developer databases cannot all
  be identified by environment name and inspected with read-only credentials.
- A fresh disposable PostgreSQL database is unavailable.
- Docker is unavailable, the fixed local port/container name is occupied, or
  an alternative disposable service has not been explicitly approved and
  documented with equivalent isolation/readback/cleanup commands.
- Drizzle attempts to replay entry 15 on an existing environment during
  testing; disconnect immediately and report it.

## Maintenance notes

- Keep the filename mapping test in the root suite so generated migrations
  cannot silently drift again.
- Never rename an already deployed migration without repeating ledger/hash
  reconciliation.
- Plan 005 may add a new custom migration; execute it only after this mapping
  repair is merged and validated.

## Suggested delivery

- **Branch**: `codex/plan-004-migration-chain`
- **Commit**: `fix(db): repair migration filename mapping`
