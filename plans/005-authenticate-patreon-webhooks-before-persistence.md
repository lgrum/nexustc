# Plan 005: Authenticate Patreon webhooks before persistence

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. Do
> not retain rejected request bodies or broad request headers as a fallback.
> If a STOP condition occurs, stop and report it. When done, update this
> plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5899131..HEAD -- apps/web/src/lib/patreon-webhook.ts apps/web/src/lib/patreon-webhook.test.ts packages/db/src/migrations`
> If webhook persistence or the migration chain changed, reconcile the live
> code before proceeding. A material mismatch is a STOP condition.

## Status

- **State**: DONE
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plans 001 and 004
- **Category**: security, privacy, reliability
- **Planned at**: commit `5899131`, 2026-07-14
- **Result**: APPROVE on `codex/plan-005-patreon-webhook-boundary`
- **Commit**: `871f2e2`
- **Verification note**: The operator explicitly waived disposable PostgreSQL
  verification because no relevant deployed environment uses these Drizzle
  migrations. No database was contacted during completion.

## Why this matters

The webhook handler currently writes every request body, every request header,
the full URL, and the supplied signature before checking whether the request
is authentic. An unauthenticated sender can therefore consume database space
and persist cookies, authorization headers, query strings, or arbitrary body
data. The handler also buffers the body without a byte limit. Authenticate and
bound the request first, then retain only the minimum useful forensic record
for genuine Patreon traffic.

## Current state

- `apps/web/src/lib/patreon-webhook.ts` converts all request headers with
  `Object.fromEntries(request.headers.entries())`.
- It stores body, headers, signature, method, and the full `request.url` before
  validating required Patreon headers or HMAC.
- Request text and JSON database columns are unbounded at the application
  boundary.
- The owner UI deliberately searches stored body/signature values and displays
  request metadata.
- The route itself is a thin delegation layer with a focused route test.
- Historical rows can already contain non-Patreon headers or URL query values.

## Target state

- Missing authentication headers, oversized bodies, and invalid signatures
  produce no database row.
- Raw request bodies are capped at 1 MiB while streaming; `Content-Length` is
  only an early rejection hint, not the enforcement mechanism.
- Authenticated requests store only content length/type, user agent, URL path,
  method, Patreon event/signature, and the body needed by the current owner UI.
- Signed malformed JSON may still be recorded and marked invalid for forensic
  debugging.
- Existing rows are redacted with a forward-only custom migration.

## Scope

### In scope

- `apps/web/src/lib/patreon-webhook.ts`
- `apps/web/src/lib/patreon-webhook.test.ts`
- One generated custom migration under `packages/db/src/migrations/`
- Generated journal/snapshot metadata under the same migration directory

### Out of scope

- Changing the Patreon signature algorithm or shared secret
- Owner API/UI response shapes
- A webhook replay service
- A general request-body middleware framework
- Scheduled retention/deletion policy

## Implementation steps

### 1. Define a byte limit and minimal stored metadata

In `apps/web/src/lib/patreon-webhook.ts`, add a named 1 MiB constant. Add a
small function that returns only these optional request headers:

- `content-length`
- `content-type`
- `user-agent`

Omit absent values rather than storing them as null. Keep the authenticated
Patreon event and signature in their existing dedicated columns; do not copy
them into the JSON header field.

Store `new URL(request.url).pathname` instead of the full URL so query strings
and fragments cannot enter the forensic table.

### 2. Read the body with an enforced streaming cap

Add a focused helper that:

1. Rejects a valid numeric `Content-Length` greater than 1 MiB before reading.
2. Reads from `request.body?.getReader()` chunk by chunk.
3. Counts raw bytes and aborts/cancels once the cumulative total exceeds the
   limit.
4. Uses one incremental `TextDecoder`, including the final flush, to preserve
   multi-byte UTF-8 boundaries.
5. Returns a discriminated result so the handler maps oversized input to 413.

Do not trust `Content-Length` as the sole check and do not call
`request.text()` before enforcing the streaming limit. Avoid buffering both a
complete `Uint8Array` and a complete string.

### 3. Reorder the authentication boundary

Refactor the handler into this exact order:

1. Read the Patreon event and signature headers. If either is absent, return
   400 without inserting.
2. Read the bounded body. If it exceeds 1 MiB, return 413 without inserting.
3. Verify the existing HMAC over the exact decoded body. If it fails, return
   401 without inserting.
4. Insert one sanitized request row.
5. Parse and process the authenticated event with existing behavior.

Preserve existing response/status semantics for valid handled events, valid
unhandled events, and signed malformed JSON. For failures after a valid row is
inserted, update that row's processing status as the current implementation
does.

Do not store rejected bodies elsewhere. Operational logs may record status,
event name, byte count, and a generated request ID, but never body, signature,
cookies, authorization headers, or query strings.

### 4. Redact historical rows with a generated migration

After Plan 004 is merged, classify every deployed database as
**migration-managed** or intentionally **db:push-managed**. With read-only
credentials, run:

```sql
SELECT
  count(*) AS row_count,
  pg_total_relation_size('public.patreon_webhook_request') AS total_bytes
FROM public.patreon_webhook_request;
```

Record the result and execution mode. If the table exceeds 100,000 rows or 1
GiB, STOP and request a DBA-reviewed batched cleanup/maintenance window rather
than running one table-wide update. Also STOP if the execution mode is unknown
or mixed.

Generate a custom Drizzle migration from `packages/db`:

```bash
bun x drizzle-kit generate --custom --name=redact-patreon-webhook-metadata
```

Inspect the generated ordinal/journal entry, then put only this data update in
the generated SQL file, adjusting quoting only if the live schema requires it:

```sql
SET lock_timeout = '5s';
SET statement_timeout = '5min';

UPDATE "patreon_webhook_request"
SET
  "headers" = jsonb_strip_nulls(jsonb_build_object(
    'content-length', "headers"->'content-length',
    'content-type', "headers"->'content-type',
    'user-agent', "headers"->'user-agent'
  )),
  "url" = split_part("url", '?', 1);
```

This is a forward-only redaction. Do not write a down migration that restores
sensitive values. Do not update the body/signature columns because the current
authenticated-request UI depends on them and historical rows cannot be
re-authenticated offline without a carefully scoped separate migration.

Run Plan 004's journal-to-SQL mapping test after generation.

For migration-managed environments, apply the custom migration only through
the environment's approved migrator during an authorized deployment. For an
intentionally `db:push`-managed environment, `drizzle-kit push` will not run a
custom data migration: execute the same `UPDATE` once through an explicitly
approved operator runbook inside `BEGIN`, `SET LOCAL lock_timeout = '5s'`,
`SET LOCAL statement_timeout = '5min'`, and `COMMIT`. Do not mark this plan
complete until every long-lived environment has one recorded execution path
and post-update readback. A lock/statement timeout is a STOP condition, not a
reason to remove the timeout.

### 5. Add handler tests

Create or extend `apps/web/src/lib/patreon-webhook.test.ts` with mocked database
and Patreon processing boundaries. Use the real `verifyWebhookSignature` with
a synthetic test-only secret for signature cases; mocking the verifier would
make the multi-chunk UTF-8 regression test vacuous. Cover at least:

1. Missing event/signature returns 400 and never inserts.
2. A declared or streamed body over 1 MiB returns 413 and never inserts.
3. An invalid signature returns 401 and never inserts.
4. A valid, unhandled event inserts once and returns the existing ignored
   response.
5. The inserted row contains only the three allowlisted headers, a path-only
   URL, and no authorization/cookie/query data.
6. A valid signature with malformed JSON inserts, then follows the existing
   invalid-processing path.
7. A multi-chunk UTF-8 body verifies against the same string Patreon signed.

Keep the existing thin route test. Do not put handler behavior into the route
test.

### 6. Verify

Run:

```bash
bun run --cwd apps/web test -- src/lib/patreon-webhook.test.ts src/app/api/patreon/webhook/route.test.ts
bun run --cwd packages/db test -- src/migrations/migrations.test.ts
bun run test
bun run check-types
bun run check
bun run --cwd apps/web build
git diff --check
```

Run this as one PowerShell procedure from the repository root. Do not split it
into separate sessions; native failures are checked immediately and `finally`
always restores `DATABASE_URL` and removes the verified disposable container:

```powershell
$sha = git rev-parse --short HEAD
if ($LASTEXITCODE -ne 0) { throw "STOP: cannot resolve repository SHA" }
$container = "nexustc-plan-005-pg-$sha"
$database = "nexustc_plan005"
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
  if (Get-NetTCPConnection -LocalPort 55433 -ErrorAction SilentlyContinue) {
    throw "STOP: local port 55433 is already in use"
  }

  docker run --detach --name $container `
    --env "POSTGRES_PASSWORD=$password" `
    --env "POSTGRES_DB=$database" `
    --publish 127.0.0.1:55433:5432 `
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

  $env:DATABASE_URL = "postgresql://postgres:$password@127.0.0.1:55433/$database"
  Push-Location packages/db
  try {
    bun x drizzle-kit migrate --config drizzle.config.ts
    if ($LASTEXITCODE -ne 0) { throw "STOP: first migration run failed" }
  } finally {
    Pop-Location
  }

  $count = docker exec $container psql -U postgres -d $database -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations;"
  if ($LASTEXITCODE -ne 0 -or $count.Trim() -ne "52") {
    throw "STOP: expected 52 migration rows, received '$count'"
  }

  docker exec $container psql -U postgres -d $database --command "INSERT INTO patreon_webhook_request (id, body, headers, method, url, updated_at) VALUES ('plan-005-sample', '{}', jsonb_build_object('authorization', 'test-only', 'cookie', 'test-only', 'content-type', 'application/json', 'user-agent', 'plan-005'), 'POST', 'https://example.invalid/api/patreon/webhook?token=test-only', now());"
  if ($LASTEXITCODE -ne 0) { throw "STOP: could not insert synthetic row" }

  docker exec $container psql -U postgres -d $database --command "UPDATE patreon_webhook_request SET headers = jsonb_strip_nulls(jsonb_build_object('content-length', headers->'content-length', 'content-type', headers->'content-type', 'user-agent', headers->'user-agent')), url = split_part(url, '?', 1) WHERE id = 'plan-005-sample';"
  if ($LASTEXITCODE -ne 0) { throw "STOP: redaction SQL failed" }

  $redacted = docker exec $container psql -U postgres -d $database -tAc "SELECT headers = jsonb_build_object('content-type', 'application/json', 'user-agent', 'plan-005') AND position('?' in url) = 0 FROM patreon_webhook_request WHERE id = 'plan-005-sample';"
  if ($LASTEXITCODE -ne 0 -or $redacted.Trim() -ne "t") {
    throw "STOP: synthetic row was not redacted: '$redacted'"
  }

  Push-Location packages/db
  try {
    bun x drizzle-kit migrate --config drizzle.config.ts
    if ($LASTEXITCODE -ne 0) { throw "STOP: second migration run failed" }
  } finally {
    Pop-Location
  }

  $secondCount = docker exec $container psql -U postgres -d $database -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations;"
  if ($LASTEXITCODE -ne 0 -or $secondCount.Trim() -ne "52") {
    throw "STOP: second migrate changed ledger count: '$secondCount'"
  }
} finally {
  if ($hadDatabaseUrl) { $env:DATABASE_URL = $previousDatabaseUrl }
  else { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue }

  if ($containerCreated) {
    if (-not $container.StartsWith("nexustc-plan-005-pg-")) {
      throw "STOP: refusing to remove an unexpected container"
    }
    docker rm --force $container
    if ($LASTEXITCODE -ne 0) {
      throw "STOP: failed to remove disposable container $container"
    }
  }
}
```

Expected: the script exits 0, both migration counts are 52, the synthetic row
is redacted, the container is removed, and prior `DATABASE_URL` state is
restored.

For each authorized deployed cleanup, read back:

```sql
SELECT count(*) AS rows_with_disallowed_headers
FROM patreon_webhook_request
WHERE EXISTS (
  SELECT 1
  FROM jsonb_object_keys(headers) AS keys(key)
  WHERE key NOT IN ('content-length', 'content-type', 'user-agent')
);

SELECT count(*) AS rows_with_query_urls
FROM patreon_webhook_request
WHERE url LIKE '%?%';
```

Both counts must be zero.

## Done criteria

- [ ] Missing headers, oversized bodies, and invalid signatures never insert.
- [ ] The bounded reader enforces 1 MiB on actual streamed bytes.
- [ ] Authenticated rows contain only allowlisted headers and query-free URLs.
- [ ] Every deployed database has a recorded migration-managed or approved
      push-managed cleanup path; both post-cleanup readback counts are zero.
- [ ] The mapping test observes 52 journal/SQL names, and a fresh disposable
      database remains at 52 ledger rows after a second migrate.
- [ ] Focused/root tests, type-check, check, web build, and diff check pass.
- [ ] Only in-scope files and `plans/README.md` changed; the Plan 005 index row
      is updated.

## STOP conditions

- Operations or incident response requires rejected payloads to be persisted;
  agree on a secured, bounded alternative before coding.
- Legitimate Patreon deliveries exceed 1 MiB according to observed production
  metrics.
- The request body is already consumed before this handler receives it.
- The historical table or JSON column names differ from the migration excerpt.
- A deployed table exceeds 100,000 rows/1 GiB, or the cleanup hits its
  lock/statement timeout.
- A `db:push` environment has no approved one-time SQL execution path.
- Plan 004's migration safety gate or disposable-database verification has not
  passed.
- Tests require exposing the webhook secret or real payloads.

## Maintenance notes

- Review the 1 MiB limit against observed authenticated payload sizes after 30
  days; raise it only with evidence and matching tests.
- Add a bounded retention job when the project has an established scheduler.
  Do not add a scheduler solely for this change.
- Treat stored signatures and bodies as sensitive even after header redaction.

## Suggested delivery

- **Branch**: `codex/plan-005-patreon-webhook-boundary`
- **Commit**: `fix(web): authenticate webhooks before persistence`
