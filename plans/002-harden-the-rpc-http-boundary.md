# Plan 002: Harden the RPC HTTP boundary

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report it; do not invent a replacement CSRF
> scheme. When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5899131..HEAD -- ':(literal)apps/web/src/app/api/rpc/[...rpc]/route.ts' ':(literal)apps/web/src/app/api/rpc/[...rpc]/route.test.ts' apps/web/src/lib/orpc.ts apps/web/src/lib/orpc.test.ts`
> If an in-scope file changed, compare the excerpts below with the live code.
> A material mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: Plan 001
- **Category**: security, API
- **Planned at**: commit `5899131`, 2026-07-14
- **Result**: DONE on `codex/plan-002-rpc-transport`
- **Commit**: `11adf30`

## Why this matters

The RPC route exports every HTTP verb even though the browser client uses
`POST`. oRPC's fetch adapter already rejects un-routed `GET` requests through
its built-in strict-GET plugin, so this is not a general GET-mutation flaw.
However, the exported `HEAD` handler can still reach no-input procedures, and
credentialed POST requests have no explicit request-authenticity signal. The
application also uses cross-site-capable session cookies, making a small,
central CSRF boundary worthwhile.

## Current state

- `apps/web/src/app/api/rpc/[...rpc]/route.ts` constructs one `RPCHandler` with
  only `LoggingHandlerPlugin`, then exports the same handler as `DELETE`,
  `GET`, `HEAD`, `PATCH`, `POST`, and `PUT`.
- `apps/web/src/lib/orpc.ts` constructs the browser `RPCLink` centrally with
  `credentials: "include"` and no custom request header.
- Installed `@orpc/server@1.13.9` already adds `StrictGetMethodPlugin` in the
  fetch `RPCHandler`; an un-routed `GET` returns 405. Preserve that native
  behavior instead of adding custom method parsing.
- Installed `SimpleCsrfProtectionHandlerPlugin` defaults to requiring
  `x-csrf-token: orpc` and returns 403 when the header is missing.

## Target state

- The Next route exports only `POST`; Next handles all other methods as 405.
- Every RPC POST must carry the installed plugin's default CSRF header.
- The one browser RPC link always sends that header.
- Route-level tests prove that a missing header cannot invoke a procedure and
  an accepted request can.

## Scope

### In scope

- `apps/web/src/app/api/rpc/[...rpc]/route.ts`
- `apps/web/src/app/api/rpc/[...rpc]/route.test.ts`
- `apps/web/src/lib/orpc.ts`
- `apps/web/src/lib/orpc.test.ts`

### Out of scope

- Per-procedure GET routing or caching
- Cookie attributes and Better Auth configuration
- CORS, CSP, or proxy configuration
- API procedure implementations
- A custom synchronizer-token service

## Implementation steps

### 1. Make POST the only exported transport

In `apps/web/src/app/api/rpc/[...rpc]/route.ts`:

1. Import `SimpleCsrfProtectionHandlerPlugin` from
   `@orpc/server/plugins`.
2. Add `new SimpleCsrfProtectionHandlerPlugin()` to the handler's `plugins`
   array. Keep the existing logging plugin.
3. Keep `export const POST = handle`.
4. Remove the `DELETE`, `GET`, `HEAD`, `PATCH`, and `PUT` exports.

Do not add a hand-written method switch. Do not customize the plugin's header
name or value; the installed defaults are the contract used by the client.

### 2. Send the authenticity header from the browser client

In `apps/web/src/lib/orpc.ts`, define a small exported immutable constant:

```ts
export const ORPC_REQUEST_HEADERS = {
  "x-csrf-token": "orpc",
} as const;
```

Pass it through the existing `RPCLink` `headers` option. Do not change the
server-only `createRouterClient` path: it invokes procedures in-process and
does not traverse the HTTP handler.

### 3. Add focused transport tests

Create or extend `apps/web/src/app/api/rpc/[...rpc]/route.test.ts` using an
in-memory harmless, no-input procedure and mocked route dependencies. Assert:

1. The route module exposes `POST` and does not expose the other verb exports.
2. A POST without `x-csrf-token` returns 403 and the procedure spy is not
   called.
3. A POST with `x-csrf-token: orpc` succeeds and invokes the procedure once.

Keep the test at the HTTP handler boundary. Do not call a real application
mutation or require a database.

Extend `apps/web/src/lib/orpc.test.ts` with a fetch spy or mocked `RPCLink`
constructor. Invoke a harmless client call and assert the actual outgoing
request/options contain `x-csrf-token: orpc`. Also assert the exported
constant's exact value. A constant-only test is insufficient because it can
pass while the link is not wired to use it.

### 4. Verify

Run, in order:

```bash
bun run --cwd apps/web test -- "src/app/api/rpc/[...rpc]/route.test.ts" src/lib/orpc.test.ts
bun run check-types
bun run check
bun run --cwd apps/web build
```

Expected results:

- All focused tests pass.
- Type-check, Ultracite, and the production web build pass.
- A manual `HEAD /api/rpc/...` response is 405 and does not execute a
  procedure.
- A POST missing the header is 403; the normal browser client remains usable.

For the manual method check with the local app running, execute:

```bash
curl.exe -I http://localhost:3000/api/rpc/notification/markAllNotificationsRead
```

Expected: HTTP 405 and no procedure-side effect.

## Done criteria

- [ ] The route exports only `POST`; `rg -n "export const (DELETE|GET|HEAD|PATCH|PUT)" "apps/web/src/app/api/rpc/[...rpc]/route.ts"` returns no matches.
- [ ] Missing CSRF header is 403 without procedure execution; the correct
      header succeeds.
- [ ] The browser link test observes the header on its actual transport.
- [ ] Focused tests, root tests/type-check/check, and the web build exit 0.
- [ ] Only the four in-scope files and `plans/README.md` changed.
- [ ] The Plan 002 index row is updated.

## STOP conditions

- A supported RPC consumer exists outside `apps/web/src/lib/orpc.ts` and
  cannot send the required header.
- The installed oRPC version no longer exports
  `SimpleCsrfProtectionHandlerPlugin` or its defaults differ from those above.
- The client transport is intentionally configured to use non-POST methods.
- Testing requires weakening the production plugin or invoking a real
  mutation.

## Maintenance notes

- Future HTTP RPC clients must send `x-csrf-token: orpc`.
- Keep the route POST-only unless a procedure receives an explicit,
  independently reviewed safe-GET contract.
- Plan 006 also changes this route's plugin list; execute it after this plan
  and preserve both plugins.

## Suggested delivery

- **Branch**: `codex/plan-002-rpc-transport`
- **Commit**: `fix(web): harden rpc request transport`
