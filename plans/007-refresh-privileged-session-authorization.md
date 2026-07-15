# Plan 007: Make API session roles authoritative

> **Executor instructions**: Follow this plan step by step. Use Better Auth's
> installed native cookie-cache bypass; do not add direct role SQL, session
> revocation hooks, or a second cache. If a STOP condition occurs, stop and
> report it. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5899131..HEAD -- packages/api/src/context.ts packages/api/src/context.test.ts`
> If session construction changed, reconcile the live code before proceeding.
> A material mismatch is a STOP condition. Re-read (but do not edit)
> `packages/auth/src/index.ts` to confirm cookie-cache configuration and
> `packages/api/src/index.ts` to confirm middleware still consumes the context
> session.

## Status

- **State**: DONE
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW-MED
- **Depends on**: Plan 001
- **Category**: security, authorization
- **Planned at**: commit `5899131`, 2026-07-14
- **Result**: APPROVE on `codex/plan-007-authoritative-api-sessions`
- **Commit**: `9033fe4`

## Why this matters

Better Auth's signed session cookie caches the complete user for five minutes.
Every oRPC context currently accepts that cached role. The role controls not
only owner/permission middleware and rate-limit bypass, but also early-access
media, premium links, profile entitlements, comic progress, and spam-policy
exceptions in ordinary public/protected procedures. Refreshing only admin
middleware would leave those disclosure/entitlement paths stale. The smallest
complete fix is to bypass the cookie cache once when creating every API
request context.

## Current state

- `packages/auth/src/index.ts:271-275` enables Better Auth cookie caching for
  five minutes.
- `packages/api/src/context.ts:37-42` calls
  `auth.api.getSession({ headers })` and places the result in oRPC context.
- `packages/api/src/index.ts` and role-sensitive routers trust that one context
  session; no second authoritative lookup occurs.
- Installed Better Auth `1.6.23` accepts
  `query: { disableCookieCache: true }` on `auth.api.getSession` and then reads
  current session/user state.
- Better Auth's own routes remain separate; this change affects only oRPC
  context construction.

## Target state

- Every authenticated oRPC request receives the current Better Auth
  session/user rather than a five-minute cached role.
- Owner, permission, rate-limit, early-access, profile entitlement, and other
  role-dependent code all inherit the fix without router-by-router changes.
- Anonymous `createPublicContext()` behavior is unchanged.
- Better Auth's cookie cache remains enabled for non-oRPC uses.

## Scope

### In scope

- `packages/api/src/context.ts`
- `packages/api/src/context.test.ts`

### Out of scope

- `packages/auth/src/index.ts` cookie settings
- `packages/api/src/index.ts` or router rewrites
- Direct Drizzle role lookups
- Role-change session revocation
- UI refresh behavior
- Multi-role or external policy engines

## Implementation steps

### 1. Bypass the cookie cache at the API context boundary

Change only `createContext` in `packages/api/src/context.ts`:

```ts
const session = await auth.api.getSession({
  headers,
  query: { disableCookieCache: true },
});
```

Preserve the existing `Context` type, logger, database instance, and
`createPublicContext`. Do not add a helper or modify individual procedures;
all role-sensitive callers already share this context boundary.

**Verify**:

```bash
rg -n -U "getSession\(\{[\s\S]*disableCookieCache: true" packages/api/src/context.ts
```

Expected: one match in `createContext`.

### 2. Add a focused context contract test

Create `packages/api/src/context.test.ts` with Vitest module mocks for
`@repo/auth` and `@repo/db`. Cover:

1. `createContext(headers)` calls `auth.api.getSession` exactly once with the
   same `Headers` instance and `query: { disableCookieCache: true }`.
2. The returned context contains the mocked fresh session, headers, and mocked
   database.
3. `createPublicContext()` returns `session: null` and does not call
   `getSession`.

Do not add a live database, HTTP server, or direct middleware harness. This
test protects the one shared authority boundary; existing router tests cover
their own role behavior.

**Verify**:

```bash
bun run --cwd packages/api test -- src/context.test.ts
```

Expected: all three cases pass and the mock observes the exact query option.

### 3. Run root gates and inspect scope

Run:

```bash
bun run --cwd packages/api test -- src/context.test.ts
bun run test
bun run check-types
bun run check
git diff --check
git status --short
```

Expected: all checks exit 0 and only the two in-scope source/test files plus
`plans/README.md` are changed for this plan.

## Done criteria

- [ ] `createContext` always passes `disableCookieCache: true`.
- [ ] `createPublicContext` remains session-free without an auth lookup.
- [ ] The focused test observes the exact request headers, option, session, and
      database values.
- [ ] Focused/root tests, type-check, check, and diff check exit 0.
- [ ] No auth configuration, middleware, router, or schema file changed.
- [ ] The Plan 007 index row is updated.

## STOP conditions

- Installed Better Auth no longer accepts `disableCookieCache` on
  `getSession`, or a test shows it does not load current user state.
- A supported API runtime constructs oRPC context somewhere other than
  `packages/api/src/context.ts`.
- The change requires widening session/auth types to `any`.
- Current throughput cannot tolerate one session-store read per authenticated
  oRPC request according to a measured load test; report the measurement and
  design an explicit invalidation strategy rather than restoring stale roles.

## Maintenance notes

- New oRPC entry points must use `createContext`; bypassing it can reintroduce
  stale authority.
- Keep the regression test when upgrading Better Auth because query option and
  cookie-cache semantics are version-sensitive.
- If session-read load becomes material, prefer event-driven invalidation with
  a documented revocation SLA over another fixed-time role cache.

## Suggested delivery

- **Branch**: `codex/plan-007-authoritative-api-sessions`
- **Commit**: `fix(api): refresh session roles per request`
