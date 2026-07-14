# Plan 003: Keep news hidden until linked content is public

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report it; do not invent a second visibility
> policy. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5899131..HEAD -- packages/api/src/services/notification.ts packages/api/src/services/notification-visibility.test.ts packages/api/src/routers/notification/admin.ts packages/api/src/routers/notification/admin.test.ts ':(literal)apps/web/src/app/api/rpc/[...rpc]/cache-tags.ts' ':(literal)apps/web/src/app/api/rpc/[...rpc]/cache-tags.test.ts'`
> If an in-scope implementation changed, reconcile it before proceeding. A
> material mismatch is a STOP condition. Also re-read the policy dependency
> `packages/api/src/utils/early-access.ts`; do not edit it in this plan.

## Status

- **Priority**: P1
- **Effort**: S-M
- **Risk**: MED
- **Depends on**: Plan 001
- **Category**: security, correctness
- **Planned at**: commit `5899131`, 2026-07-14

## Why this matters

The public news list and detail queries return the title and body of published
articles linked to content that may still be under early access. The catalog
and content-detail paths already share one public visibility predicate; news
currently bypasses it. This can disclose unreleased titles or announcement
copy through public RPC and cached Next pages.

## Current state

- `packages/api/src/utils/early-access.ts` defines
  `publicCatalogVisibilityCondition(now)`, requiring both release timing and
  early-access timing to be public.
- `packages/api/src/services/notification.ts`:
  - `getPublishedNewsArticleById` checks the news article's own status and
    publication dates, but not the linked content's public visibility.
  - `listPublishedNewsArticles` has the same omission.
  - `publishContentNewsArticle` intentionally allows an administrator to
    prepare an article for published content.
- The public notification router and Next news pages call these service reads.
- Next news pages use hour-scale caching.
- `apps/web/src/app/api/rpc/[...rpc]/cache-tags.ts` does not include `news`
  when comic/post visibility settings are edited or deleted.
- The documented VIP policy says public surfaces must exclude active early
  access while server-side code retains the real title for authorized users.

## Target state

- Both public news list and detail queries apply the existing canonical
  visibility predicate to their linked comic/post row.
- Administrators may pre-stage news only when its effective publication time
  is at or after the linked content's public boundary; notifications and
  articles use that same timestamp.
- Content visibility mutations invalidate cached news pages.
- Tests fail if either public query stops applying the shared predicate.

## Scope

### In scope

- `packages/api/src/services/notification.ts`
- `packages/api/src/services/notification-visibility.test.ts`
- `packages/api/src/routers/notification/admin.ts`
- `packages/api/src/routers/notification/admin.test.ts`
- `apps/web/src/app/api/rpc/[...rpc]/cache-tags.ts`
- `apps/web/src/app/api/rpc/[...rpc]/cache-tags.test.ts`

### Out of scope

- Admin news creation UI redesign
- A separate VIP-only news product
- Database schema changes
- Client-side filtering
- Reworking Next cache durations

## Implementation steps

### 1. Apply the canonical predicate at both public read boundaries

Import `publicCatalogVisibilityCondition` into
`packages/api/src/services/notification.ts` from the existing early-access
utility.

In both `getPublishedNewsArticleById` and `listPublishedNewsArticles`:

1. Capture one `const now = new Date()` for the query.
2. Add `publicCatalogVisibilityCondition(now)` to the existing Drizzle `and(...)`
   clause.
3. Preserve the article's existing `published`, status, and date checks.

The query already joins the linked content table used by the predicate. Reuse
that join. Do not duplicate the release/early-access expression locally and do
not fetch first then filter in TypeScript.

### 2. Keep article and notification publication aligned

In `publishContentNewsArticle`:

1. Calculate one `const publishedAt = params.publishedAt ?? new Date()` before
   loading the target.
2. Add `publicCatalogVisibilityCondition(publishedAt)` to the target post
   lookup along with matching ID and published status.
3. If no eligible target exists, throw one exported, stable service error code
   such as `NEWS_ARTICLE_TARGET_NOT_PUBLIC`.
4. Use that exact `publishedAt` for both the notification and news-article
   insert.

This permits a scheduled article when the linked content will be public at the
scheduled time, but prevents an immediate follower notification that links to
a public-news 404. Do not add a scheduler; the existing `publishedAt` fields
already express the timing.

In `packages/api/src/routers/notification/admin.ts`, catch only the exported
target-not-public service error and map it to the existing `BAD_REQUEST` error
shape with a concise Spanish message. Rethrow all unrelated errors unchanged.

### 3. Invalidate news when content visibility changes

In `apps/web/src/app/api/rpc/[...rpc]/cache-tags.ts`, add the existing `news`
tag to the mappings for comic and post edit/delete operations that can change
release or early-access visibility. Preserve all existing tags.

Extend `cache-tags.test.ts` with table-driven assertions for each affected
comic/post edit/delete procedure. Assert the returned tags include `news`; do
not assert only `news` because the existing content tags remain required.

### 4. Add service regression coverage

Create `packages/api/src/services/notification-visibility.test.ts`. Use the
repository's existing Vitest mocking style and the smallest fluent query fake
needed for these two service calls. Spy on or mock
`publicCatalogVisibilityCondition` and assert:

1. The public list read calls it once with a `Date` and incorporates its
   result in the final query predicate.
2. The public detail read does the same.
3. The detail method still returns `null` when the filtered query yields no
   row.
4. Immediate publication for active early-access/future content throws the
   stable service error before notification/article insertion.
5. Scheduled publication passes its exact scheduled timestamp to the
   visibility predicate and uses it for both inserts.
6. In `packages/api/src/routers/notification/admin.test.ts`, the admin router
   maps only that stable error to `BAD_REQUEST` and rethrows an unrelated
   service error unchanged. Mock the deferred-media wrapper and service; do not
   connect to storage or PostgreSQL.

Prefer a small query-builder fake over a new database dependency. These tests
protect predicate placement and timestamp flow; the existing
`packages/api/src/utils/early-access.test.ts` remains the semantic truth table
for future/active/public rows.

### 5. Verify

Run:

```bash
bun run --cwd packages/api test -- src/services/notification-visibility.test.ts src/routers/notification/admin.test.ts
bun run --cwd apps/web test -- "src/app/api/rpc/[...rpc]/cache-tags.test.ts"
bun run test
bun run check-types
bun run check
bun run --cwd apps/web build
```

Expected results:

- All focused and root tests pass.
- Structural service tests prove both public reads use the canonical predicate;
  the existing early-access unit tests prove its future/active/public truth
  table.
- Premature creation fails before inserting a notification or article, while
  valid scheduled publication uses one timestamp.
- Editing either comic or post visibility invalidates `news` caches.
- Type-check, lint/format check, and production build pass.

## Done criteria

- [ ] Both public news reads include `publicCatalogVisibilityCondition(now)`.
- [ ] Article creation checks the target at one effective publication time and
      uses that time for both records.
- [ ] The router maps only the stable target-not-public error to `BAD_REQUEST`.
- [ ] Comic/post edit and delete mappings include `news`.
- [ ] Focused tests, root tests/type-check/check, and web build exit 0.
- [ ] Only the six in-scope files (including the two new tests) and
      `plans/README.md` changed.
- [ ] The Plan 003 index row is updated.

## STOP conditions

- Product policy requires paying members to receive news before public release;
  that is
  a separate authorization design, not this public-query fix.
- The joined content shape no longer satisfies
  `publicCatalogVisibilityCondition`.
- Existing data permits `earlyAccessEnabled = true` with an undefined public
  timestamp and policy for that state is not documented.
- Regression coverage would require adding a database service solely for this
  test.

## Maintenance notes

- Public visibility policy belongs in `early-access.ts`; new public content
  surfaces should reuse it.
- Hour-scale caching can delay newly public news, but cannot expose it early
  after this change. If immediate release is later required, schedule cache
  revalidation separately.
- Keep scheduled pre-staging support aligned to the linked content's public
  boundary unless product requirements explicitly change.

## Suggested delivery

- **Branch**: `codex/plan-003-public-news-visibility`
- **Commit**: `fix(api): enforce public visibility on news`
