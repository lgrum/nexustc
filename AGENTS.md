# AGENTS.md

Repository-wide guidance for coding agents working on NeXusTC. A nested
`AGENTS.md` adds or overrides these rules for its subtree; in particular, read
`apps/web/AGENTS.md` before changing the web app.

## Start Here

1. Read the closest `AGENTS.md`, the target package's `package.json`, and the
   neighboring implementation and tests before editing.
2. Search for the existing domain helper, schema, component, or procedure and
   its callers. Shared behavior usually already has an owner in `packages/*` or
   `apps/web/src/lib`.
3. Keep the change within the package that owns the behavior. Do not duplicate
   server rules in the browser or move domain logic into route components.
4. Preserve unrelated work in the tree. Never edit generated/build output such
   as `node_modules`, `.next`, `dist`, coverage, or Turbo caches.
5. Run a focused check first, then the repository gates appropriate to the
   change. `bun run check` writes fixes across the repository, so inspect its
   diff afterward.

## Current Stack

NeXusTC is a Bun/Turborepo TypeScript monorepo. The active web application is
Next.js 16 App Router with React 19. The main stack is:

- Next.js App Router, React Server Components, and Cache Components
- oRPC with Zod at the HTTP/API boundary
- TanStack Query for browser server state and TanStack Form for forms
- Better Auth with role/permission extensions and Patreon integration
- Drizzle ORM with PostgreSQL, plus Redis for caching/rate limits
- Cloudflare R2 through the S3 client for managed media
- Tailwind CSS 4, shadcn components built on Base UI, and Hugeicons
- Vitest (`happy-dom` in the web app, Node in backend packages)
- Oxfmt and Oxlint through Ultracite presets

The product UI is primarily Spanish. Keep new user-facing copy in Spanish
unless the surrounding feature deliberately uses another language.

## Repository Map

| Path                         | Responsibility                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/web/src/app`           | Next.js pages, layouts, route groups, metadata, and HTTP route handlers                             |
| `apps/web/src/components`    | Reusable application components; primitives live in `components/ui`                                 |
| `apps/web/src/hooks`         | Browser hooks, including the typed TanStack Form setup                                              |
| `apps/web/src/lib`           | Web adapters and helpers: oRPC clients, auth client, uploads, analytics, image/metadata helpers     |
| `packages/api/src/routers`   | Domain oRPC procedures; assembled in `routers/index.ts`                                             |
| `packages/api/src/services`  | Reusable backend business logic shared across procedures or server entry points                     |
| `packages/api/src/utils`     | Focused backend/infrastructure helpers such as visibility, rate limits, media, and Redis operations |
| `packages/auth`              | Better Auth configuration, plugins, email delivery, and Patreon account synchronization             |
| `packages/db/src/schema`     | Drizzle schemas (`app.ts` and `notification.ts`)                                                    |
| `packages/db/src/migrations` | Ordered SQL migrations and Drizzle metadata                                                         |
| `packages/env`               | The complete typed environment-variable contract                                                    |
| `packages/shared`            | Cross-package constants, Zod schemas, permissions, profile/media rules, and pure domain helpers     |
| `packages/patreon`           | Typed Patreon API parsing/client logic                                                              |
| `packages/transactional`     | React Email templates                                                                               |
| `packages/config`            | Shared TypeScript configuration                                                                     |
| `docs`                       | Maintained feature notes and test instructions                                                      |
| `plans`                      | Advisory implementation plans; always perform their drift check against the live branch             |

Useful domain references include `docs/notification-system.md`,
`docs/vip-early-access-system.md`, `docs/comic-upload-testing.md`, and
`docs/analytics-events.md`. `plans/README.md` is the index and status ledger for
advisory plans; a plan is not a source of truth after the code has drifted.

## Commands

Use Bun 1.3.x and run commands from the repository root unless noted.

```bash
# Install and develop
bun install
bun run dev
bun run dev:web

# Non-mutating quality gates
bun run fmt:check
bun run lint
bun run check-types
bun run test

# Mutating formatter/linter pass
bun run check

# Builds
bun run build
bun run web:build

# Database schema workflow
bun run db:generate
bun run db:push
```

Focused examples:

```bash
bun run --cwd packages/api test -- src/utils/rate-limit.test.ts
bun run --cwd apps/web test -- src/lib/orpc.test.ts
bun run --cwd packages/db test -- src/migrations/migrations.test.ts
bun run --cwd apps/web check-types
```

`bun run db:push` changes the configured database. Do not use it as a routine
verification command or run it without authorization for that environment.
`bun run db:generate` only belongs in a deliberate schema change.

## General Code Conventions

- Oxfmt owns formatting and import ordering. Do not hand-format around it.
- Files are kebab-case, including component files. Exported React components
  are PascalCase; variables/functions are camelCase; real constants use
  UPPER_SNAKE_CASE.
- SQL table/column names are snake_case while Drizzle property names are
  camelCase.
- Prefer `type` for new object/union types, `unknown` at untrusted boundaries,
  and `satisfies` or narrowing over broad assertions. Follow the local file
  where a library type is clearer as an interface.
- Packages are strict TypeScript. The web config specifically enforces
  `strictNullChecks` and `noImplicitAny`; do not use its broader `strict: false`
  setting as permission to weaken types.
- Use `@/*` for web-internal imports and `@repo/<package>/<module>` for shared
  package modules. Import Drizzle operators from `@repo/db` so every workspace
  uses the same Drizzle instance.
- Avoid new convenience barrel files. Existing indexes are intentional public
  or composition boundaries, such as `packages/api/src/routers/index.ts` and
  the `@repo/db` package surface.
- Reuse canonical values and schemas from `packages/shared`; do not recreate
  role names, Patreon tiers, taxonomies, media limits, or visibility rules.
- Keep comments for invariants, non-obvious constraints, and required library
  ordering. A lint suppression must be narrow and explain why it is safe.
- Use the context logger in API code. Reserve `console` for framework/bootstrap
  boundaries where no request logger exists.
- Validate trust boundaries and keep accessibility, authorization, rate limits,
  and upload limits intact even when nearby code could be shortened.

## Next.js and React Patterns

### Server and Client Boundaries

- `page.tsx` and `layout.tsx` are Server Components by default. Fetch on the
  server and pass serializable data to an interactive `*-client.tsx` component.
- Add `"use client"` only to the smallest component that needs hooks, browser
  APIs, event handlers, or client state. Do not turn a route into a Client
  Component merely to fetch data.
- Next.js 16 behavior may differ from older training data. As required by
  `apps/web/AGENTS.md`, read the relevant local guide under
  `apps/web/node_modules/next/dist/docs/` before using or changing a Next API.
- Follow current async App Router signatures: route `params` and
  `searchParams` are promises where the neighboring pages declare them that
  way.

### Server Data and Caching

- Server pages call `orpcClient` from `@/lib/orpc` directly. The root layout
  imports `@/lib/orpc.server` once to install the request-aware in-process oRPC
  client; do not create a parallel server client.
- Request-bound calls use `createContext(await headers())` and may see the
  session. Keep authenticated, personalized, admin, and entitlement-dependent
  data out of shared caches.
- A cached anonymous function uses `"use cache"`, `cacheLife`, and `cacheTag`,
  and its oRPC call must pass `{ context: { cache: true } }`. That flag selects
  `createPublicContext()` specifically to prevent session data from entering a
  shared cache.
- When a successful mutation changes cached data, update
  `apps/web/src/app/api/rpc/[...rpc]/cache-tags.ts`. Keep tag names aligned with
  the pages that declare them.
- `apps/web/src/app/port-boundaries.test.ts` intentionally protects these
  server/cache boundaries with source-level assertions. Change it only when the
  architecture changes intentionally.

### Browser Data and Forms

- Prefer TanStack Query's generated options:
  `useQuery(orpc.domain.action.queryOptions(input))`,
  `useSuspenseQuery(...)`, and
  `useMutation(orpc.domain.action.mutationOptions(...))`.
- Use `orpcClient` directly for imperative operations, uploads, or a custom
  `queryFn`/`mutationFn`. Use `safeOrpc`/`safeOrpcClient` only where the UI
  intentionally consumes result objects instead of thrown errors.
- After mutations, invalidate the same `queryOptions()` used by readers rather
  than inventing string query keys.
- Use `useAppForm` and its registered field components from
  `apps/web/src/hooks/use-app-form.ts`. Put a Zod schema in `packages/shared`
  when both browser and server need the contract; otherwise keep it with its
  owning feature.

### UI

- Reuse `apps/web/src/components/ui` and existing feature components before
  adding primitives. These shadcn components use Base UI, whose composition
  prop is `render={<... />}` rather than Radix's `asChild` convention.
- Use the established Hugeicons pattern for new icons unless the surrounding
  component already uses another icon set.
- Use `next/image` for rendered content images when its constraints fit, and
  `getBucketUrl`/the existing media helpers for R2 object keys.
- Tailwind theme tokens and shared utilities live in
  `apps/web/src/styles.css`; `app/globals.css` imports that file. Prefer theme
  tokens and existing variants over isolated hard-coded styling.
- Preserve semantic HTML, labels, keyboard behavior, focus states, alt text,
  loading/error states, and reduced-motion behavior.

## API and Backend Patterns

### oRPC Procedures

- Procedure foundations live in `packages/api/src/index.ts`:
  - `publicProcedure` for genuinely public data
  - `protectedProcedure` for authenticated users
  - `permissionProcedure({ domain: ["action"] })` for staff capabilities
  - `ownerProcedure` only for owner-exclusive operations
- Define input validation with Zod before `.handler(...)`. Validation belongs at
  the boundary even when the browser already validates the same form.
- Domain routers normally default-export an object and are composed in
  `packages/api/src/routers/index.ts`. Add a new top-level domain there and let
  the inferred `AppRouter` types flow to clients.
- Use the existing fixed/sliding-window middleware for abuse-sensitive public
  or write endpoints. Do not implement an endpoint-local rate limiter.
- Throw declared oRPC errors (`errors.BAD_REQUEST`, `FORBIDDEN`, and so on)
  instead of returning ad hoc error payloads.
- Public content queries must reuse the established publication and early
  access visibility predicates. Do not approximate visibility in a new query.

### Ownership Within `packages/api`

- Keep transport, input schemas, permission selection, and response shaping in
  routers.
- Put business logic shared by multiple procedures or server entry points in
  `services` and pass the database/context dependency explicitly.
- Put focused pure or infrastructure helpers in `utils`. Reuse the S3 client,
  Redis operations, media validation, and visibility helpers rather than
  opening new clients or duplicating limits.
- Use `getLogger` from the oRPC context for request logs. Do not log secrets,
  tokens, webhook bodies, or raw authentication material.
- Optional caches may fail open only where the existing domain deliberately
  treats Redis as an optimization. Authorization, rate limiting, idempotency,
  and one-time upload intent checks are not optional caches.

## Authentication and Authorization

- Better Auth is configured in `packages/auth/src/index.ts`; browser bindings
  live in `apps/web/src/lib/auth-client.ts`; the Next handler is
  `apps/web/src/app/api/auth/[...auth]/route.ts`.
- Permission statements, roles, hierarchy, and their TypeScript types are
  defined together in `packages/shared/src/permissions.ts`. Update the
  statement and every intended role grant together.
- Server authorization must use `protectedProcedure`, `permissionProcedure`,
  `ownerProcedure`, or a server-side Better Auth API check. Client components
  such as `HasPermissions` are presentation controls, not security boundaries.
- API context deliberately requests a session with `disableCookieCache: true`
  so privileged roles are authoritative. Do not remove that behavior from
  authorization-sensitive paths.
- `nextCookies()` must remain the last Better Auth plugin. Its placement is a
  library invariant documented in the auth configuration.
- Treat auth, Patreon webhooks, password reset, two-factor delivery,
  impersonation, and profile upload intents as security-sensitive paths. Add or
  update focused tests whenever their behavior changes.

## Database, Redis, and Migrations

- The active Drizzle schemas are `packages/db/src/schema/app.ts` and
  `packages/db/src/schema/notification.ts`; both are included in the exported
  `db` schema.
- Use `db.query.*` for relational reads when it is clear and the query builder
  for explicit joins, projections, aggregation, locking, or conflict handling.
- Use a transaction when multiple writes must succeed or fail together. Prefer
  database uniqueness/foreign-key constraints and `onConflict...` behavior for
  concurrency guarantees.
- Use the shared `generateId` helper for application-owned text IDs. Preserve
  Better Auth's expected schema/ID behavior for its tables.
- `getRedis()` is the shared Redis singleton. Do not create independent Redis
  clients inside routers or services.
- For schema changes, edit the schema, run `bun run db:generate`, and commit the
  SQL file plus `meta/_journal.json` and the matching snapshot as one unit.
  Review generated SQL before accepting it.
- Never casually rename, reorder, delete, or hand-repair historical migration
  files. If migration history must be repaired, reconcile deployed state first.
- Run `packages/db/src/migrations/migrations.test.ts` after migration changes;
  it verifies an exact journal-to-SQL mapping.

## Environment Variables

- `packages/env/src/index.ts` is the only complete source of truth for required
  variables. Do not maintain a second list in documentation or access a new
  application variable directly from `process.env`.
- Local Next.js and Drizzle configuration use ignored environment files under
  `apps/web`. Never print, copy, commit, or expose their values.
- Add a new variable to the appropriate `client` or `server` schema and to
  `runtimeEnv`. Browser-visible variables must use the `NEXT_PUBLIC_` prefix.
- If a variable affects a Turbo build, add it to the relevant `turbo.json` task
  environment list so cache keys remain correct.
- Tests provide only the minimal safe public defaults in setup files. Do not
  weaken production validation merely to make a test or build run locally.

## Tests and Verification

- Tests are co-located as `*.test.ts`/`*.test.tsx`; backend packages use Node,
  while `apps/web` uses `happy-dom` plus Testing Library where DOM behavior is
  relevant.
- Prefer a focused behavior test at the module that owns the rule. Mock external
  systems at their boundary and keep business calculations real.
- The web TypeScript config excludes tests, so `check-types` is not a substitute
  for running the web Vitest suite.
- Never commit `.only` or `.skip`. Keep regression tests deterministic and free
  of live database, Redis, R2, Patreon, or email dependencies unless the task
  explicitly establishes an integration-test environment.

Use this verification order:

1. Run the smallest affected test file or package check.
2. Run `bun run check-types` and `bun run test` for shared/backend changes.
3. Run `bun run web:build` for Next.js routing, server/client boundary, cache,
   metadata, or build-configuration changes.
4. Run `bun run check` last, inspect any automatic edits, and rerun a focused
   check if formatting changed executable code.

If a required environment or external service blocks a gate, report the exact
blocked command. Do not substitute a destructive database operation or weaken
validation to manufacture a passing result.
