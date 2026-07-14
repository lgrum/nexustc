# Plan 006: Bound admin image processing and uploads

> **Executor instructions**: Follow this plan step by step. Preserve the CSRF
> plugin added by Plan 002 when editing the shared RPC route. If a STOP
> condition occurs, stop and report it; do not bypass Sharp limits or create a
> custom concurrency framework. When done, update this plan's row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5899131..HEAD -- packages/shared/src/media.ts packages/api/src/utils/images.ts packages/api/src/utils/images.test.ts packages/api/src/utils/deferred-media.ts packages/api/src/utils/deferred-media.test.ts packages/api/src/routers/media.ts packages/api/src/routers/media.test.ts packages/api/src/routers/chronos.ts packages/api/src/routers/chronos.test.ts ':(literal)apps/web/src/app/api/rpc/[...rpc]/route.ts' ':(literal)apps/web/src/app/api/rpc/[...rpc]/route.test.ts'`
> If an in-scope file changed, reconcile it before proceeding. A material
> mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plans 001 and 002
- **Category**: security, performance, reliability
- **Planned at**: commit `5899131`, 2026-07-14

## Why this matters

Admin RPCs accept `File` inputs, decode entire images, and ask Sharp to process
them without byte or pixel limits. Media and Chronos also use `Promise.all`,
multiplying transient buffers and CPU work. The same optimizer is used by
deferred media on posts, announcements, creators, stickers, emoji, and profile
definitions, so the root fix must cover every server-side `z.file()` boundary,
not only two routers.

## Current state

- `packages/api/src/utils/images.ts` duplicates the shared MIME list, buffers
  input/output, and sets no byte/dimension/pixel limit.
- `packages/api/src/routers/media.ts` caps count at 12 but not bytes and runs
  optimize/upload concurrently.
- `packages/api/src/routers/chronos.ts` has no count/byte cap and also runs
  concurrently.
- `packages/api/src/utils/deferred-media.ts` permits up to 100 selection items;
  pending files have MIME validation only. Its processing loop is already
  sequential and should stay that way.
- `rg -n "z\.file\(" packages/api/src` currently identifies exactly those
  three file-input families: media, Chronos, and deferred media.
- Installed oRPC transports `File`/`Blob` input as multipart `FormData`, not
  base64. `BodyLimitPlugin` enforces both declared and streamed byte size.
- Content create/edit can carry two deferred selections. With a 40 MiB limit
  per selection, the largest valid binary input is 80 MiB plus multipart
  overhead.

## Target state and constants

Add these shared constants to `packages/shared/src/media.ts`:

```ts
export const ADMIN_IMAGE_MAX_FILES = 12;
export const ADMIN_IMAGE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ADMIN_IMAGE_MAX_SELECTION_BYTES = 40 * 1024 * 1024;
export const ADMIN_IMAGE_MAX_DIMENSION = 8192;
export const ADMIN_IMAGE_MAX_DECODED_PIXELS = 40_000_000;
export const ADMIN_RPC_BODY_MAX_BYTES = 96 * 1024 * 1024;
```

The 96 MiB transport ceiling deliberately accommodates two valid 40 MiB
deferred selections plus multipart fields/headers. It is a global gross-body
boundary; file schemas remain the tighter business boundary.

## Scope

### In scope

- `packages/shared/src/media.ts`
- `packages/api/src/utils/images.ts`
- `packages/api/src/utils/images.test.ts`
- `packages/api/src/utils/deferred-media.ts`
- `packages/api/src/utils/deferred-media.test.ts`
- `packages/api/src/routers/media.ts`
- `packages/api/src/routers/media.test.ts`
- `packages/api/src/routers/chronos.ts`
- `packages/api/src/routers/chronos.test.ts`
- `apps/web/src/app/api/rpc/[...rpc]/route.ts`
- `apps/web/src/app/api/rpc/[...rpc]/route.test.ts`

### Out of scope

- Comic direct-to-R2 page uploads and profile presigned uploads
- Client-side compression/progress UX
- A generic worker pool or queue
- Object-storage orphan redesign
- Image output format or quality changes

## Implementation steps

### 1. Centralize schemas and binary limits

In `packages/api/src/utils/images.ts`, reuse `MEDIA_IMAGE_MIME_TYPES` and export:

- `adminImageFileSchema`: allowed MIME and at most 10 MiB by `File.size`.
- `adminImageFilesSchema`: 1-12 files and at most 40 MiB total `File.size`.

Use `adminImageFilesSchema` in both media and Chronos inputs.

In `packages/api/src/utils/deferred-media.ts`, replace its MIME-only pending
file schema with `adminImageFileSchema`. Add a refinement to
`deferredMediaSelectionInputSchema` that sums only pending file sizes and
rejects a selection above 40 MiB. Preserve the existing 100 total-item count
because most items may be already-stored references. Comic page items marked
`uploaded` contain no RPC `File` and are unaffected.

**Verify**:

```bash
rg -n "z\.file\(" packages/api/src
```

Expected: the raw `z.file()` construction is centralized in `images.ts`; the
other server inputs import the shared schema.

### 2. Bound Sharp before encoding

In `optimizeFile`:

1. Reject `file.size` above 10 MiB before `arrayBuffer()`.
2. Construct Sharp with
   `limitInputPixels: ADMIN_IMAGE_MAX_DECODED_PIXELS`; preserve `animated: true`
   for GIF.
3. Read metadata before the WebP transform.
4. Set `frameHeight = metadata.pageHeight ?? metadata.height`; reject missing
   or zero width/frame height and either dimension above 8192.
5. Set `frameCount = metadata.pages ?? 1` and reject
   `width * frameHeight * frameCount` above 40 million, using safe finite
   integer arithmetic.
6. Run the existing WebP quality/output only after the checks pass.

Do not compare 8192 against a stacked animated `metadata.height`; Sharp may
report the total stacked height there. Keep Sharp's decoder-side pixel limit
even though metadata is checked.

**Verify**:

```bash
bun run --cwd packages/api test -- src/utils/images.test.ts src/utils/deferred-media.test.ts
```

Expected: valid static/animated fixtures pass and every byte/dimension/pixel
boundary case fails before encoding/upload.

### 3. Serialize media and Chronos processing

In `media.admin.upload`, replace `Promise.all` with an ordered `for...of` loop
that optimizes and uploads one file at a time. Retain only object keys and row
metadata. After all uploads succeed, use one native multi-row Drizzle insert
with `returning`; do not hold a transaction open around R2 network calls.
Preserve deletion of already-uploaded keys if a later upload/insert fails.

In `chronos.uploadImages`, use the same ordered `for...of` shape and preserve
input order in returned keys. Preserve current error semantics; do not add a
concurrency-pool abstraction.

**Verify**:

```bash
bun run --cwd packages/api test -- src/routers/media.test.ts src/routers/chronos.test.ts
```

Expected: deferred-promise spies show maximum optimizer/upload concurrency of
one, response ordering is stable, and cleanup runs after a partial failure.

### 4. Add the global gross-body boundary

In `apps/web/src/app/api/rpc/[...rpc]/route.ts`, import `BodyLimitPlugin` from
`@orpc/server/fetch` and add:

```ts
new BodyLimitPlugin({ maxBodySize: ADMIN_RPC_BODY_MAX_BYTES });
```

Preserve `SimpleCsrfProtectionHandlerPlugin`, `LoggingHandlerPlugin`, and the
POST-only export from Plan 002. Extend the route test with declared and streamed
bodies above 96 MiB; include the CSRF header and assert 413 before procedure
execution. Use a generated stream/chunks, not a committed 96 MiB fixture.

**Verify**:

```bash
bun run --cwd apps/web test -- "src/app/api/rpc/[...rpc]/route.test.ts"
```

Expected: both size paths return 413 without calling the procedure; existing
CSRF/method tests still pass.

### 5. Complete regression coverage and root checks

Image/schema tests must cover: valid PNG and AVIF; supported animation;
per-file >10 MiB before `arrayBuffer`; 13-file rejection; selection >40 MiB;
dimension >8192; total animated pixels >40 million; invalid image bytes; and
two independent 40 MiB deferred selections remaining schema-valid at their
own boundaries.

Run:

```bash
bun run --cwd packages/api test -- src/utils/images.test.ts src/utils/deferred-media.test.ts src/routers/media.test.ts src/routers/chronos.test.ts
bun run --cwd apps/web test -- "src/app/api/rpc/[...rpc]/route.test.ts"
bun run test
bun run check-types
bun run check
bun run --cwd apps/web build
```

Expected: all focused/root gates and the production build exit 0.

## Done criteria

- [ ] Every server `File` input uses the 10 MiB shared file schema.
- [ ] Media/Chronos and each deferred selection enforce 40 MiB aggregates.
- [ ] Sharp enforces frame dimension and total decoded-pixel limits.
- [ ] Media and Chronos launch at most one optimization/upload at a time.
- [ ] The RPC route rejects actual bodies above 96 MiB and preserves Plan 002.
- [ ] Focused/root tests, type-check, check, and web build exit 0.
- [ ] Only the eleven in-scope files and `plans/README.md` changed.
- [ ] The Plan 006 index row is updated.

## STOP conditions

- A legitimate observed admin workflow exceeds 10 MiB per file, 40 MiB per
  selection, or two selections/80 MiB per request; report the exact workflow
  and measurement before changing constants.
- `rg -F "z.file(" packages/api/src` finds another server file-input family not
  covered here.
- Sharp metadata for a supported animation fixture does not expose reliable
  frame height/count in the installed version.
- The multi-row PostgreSQL insert is not atomic as one statement.
- Installed oRPC body-limit behavior differs from declared/streamed enforcement.
- Meeting a measured staff latency SLA requires parallelism; collect evidence
  before selecting bounded concurrency.

## Maintenance notes

- Revisit limits from authenticated production telemetry, not client claims.
- Keep new RPC file inputs on the shared schemas and below the 96 MiB gross
  transport ceiling.
- Sequential processing is intentional; a pool is a measured future
  optimization, not a prerequisite.

## Suggested delivery

- **Branch**: `codex/plan-006-admin-image-limits`
- **Commit**: `fix(api): bound admin image processing`
