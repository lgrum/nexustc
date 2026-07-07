# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NeXusTC is a full-stack TypeScript monorepo built with TanStack Start and oRPC for end-to-end type-safe APIs. The project uses Turborepo for workspace management, Drizzle ORM with PostgreSQL for database, Better-Auth for authentication, and Redis for caching/rate-limiting.

## Development Commands

**Package Manager**: This project uses `bun` (version 1.3.0)

### Core Commands

- `bun install` - Install all dependencies
- `bun run dev` - Start all applications in development mode (web runs on port 3000)
- `bun run build` - Build all applications
- `bun run test` - Run all tests across the monorepo
- `bun run check-types` - Type-check all packages

### Workspace-Specific Commands

- `bun run dev:web` - Start only the web application
- `bun run web:build` - Build web app
- `bun run web:start` - Start built web app

### Database Commands

- `bun run db:push` - Push schema changes to database (uses Drizzle Kit)
- `bun run db:generate` - Generate migrations from schema

### Code Quality

- `bun run check` - Run Biome (linter/formatter) with auto-fix

### Testing

- `bun run test` - Run all tests
- `bun run test:watch` (in packages/api) - Run API tests in watch mode
- Tests in `apps/web` use Vitest with happy-dom environment
- Tests in `packages/api` use Vitest with node environment

## Architecture

### Monorepo Structure

**Apps**:

- `apps/web` - Full-stack TanStack Start application (React + SSR)

**Packages**:

- `packages/api` - oRPC routers and business logic (the API layer)
- `packages/auth` - Better-Auth configuration and authentication logic
- `packages/db` - Drizzle ORM schema, migrations, and database utilities
- `packages/env` - Type-safe environment variable validation
- `packages/shared` - Shared schemas, types, constants, and permissions
- `packages/transactional` - Email templates
- `packages/config` - Shared configuration (TypeScript, Biome)

### API Architecture (oRPC)

The API uses **oRPC** for end-to-end type safety with OpenAPI integration. Key concepts:

**Context Creation** (`packages/api/src/context.ts`):

- Context includes: headers, session, db (Drizzle), cache (Redis), and logger (Pino)
- Created server-side and passed to all procedures

**Procedures** (`packages/api/src/index.ts`):

- `publicProcedure` - No authentication required
- `protectedProcedure` - Requires authenticated user
- `permissionProcedure(permissions)` - Requires specific role permissions
- Middleware for rate limiting: `fixedWindowRatelimitMiddleware` and `slidingWindowRatelimitMiddleware`

**Router Structure** (`packages/api/src/routers/`):

- Routers organized by domain: `comic`, `post`, `term`, `user`, `file`, `extras`, `rating`
- Each router exports oRPC procedures
- All routers combined in `appRouter` (exported type: `AppRouter`)

**Error Handling**:
Standard error codes defined in `packages/api/src/index.ts`

### Client-Side API Integration

**oRPC Client** (`apps/web/src/lib/orpc.ts`):

- Isomorphic client: uses direct router call server-side, HTTP client on browser
- `orpcClient` - Standard client (throws on errors)
- `safeOrpcClient` - Returns `{ success: boolean, data?, error? }`
- `orpc` / `safeOrpc` - TanStack Query utilities for queries/mutations
- Router context includes `orpc` and `queryClient` for use in loaders/components

**Usage Pattern**:

```typescript
// In route loaders or components
const { data } = orpc.user.getProfile.useSuspenseQuery();
const mutation = orpc.post.create.useMutation();
```

### Database Architecture

**Setup** (`packages/db/src/index.ts`):

- Drizzle ORM with PostgreSQL (node-postgres driver)
- Schema exported from `schema/app.ts`
- Re-exports common Drizzle operators (eq, and, or, etc.) for consistency
- Redis client singleton via `getRedis()` - reuses connection if already open

**Schema Location**: `packages/db/src/schema/app.ts`

**Migrations**: Located in `packages/db/src/migrations/`

### Authentication

**System**: Better-Auth (`packages/auth/src/index.ts`)

- Session management integrated into API context
- Role-based permissions system via `packages/shared/permissions.ts`
- Permission checking in `permissionProcedure` middleware

### Frontend Architecture

**Framework**: TanStack Start (React with file-based routing)

**Router Setup** (`apps/web/src/router.tsx`):

- Routes auto-generated in `routeTree.gen.ts` from `routes/` directory
- Context includes `orpc` and `queryClient`
- Default preload strategy: "intent"
- SSR Query integration for server-side data fetching

**Routes**: Located in `apps/web/src/routes/` - file-based routing

**Components**: Located in `apps/web/src/components/`

**State Management**:

- TanStack Query for server state
- React hooks for local state

### Environment Variables

Type-safe environment variables managed in `packages/env/`

Required for development:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- Build-time: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_ASSETS_BUCKET_URL`

Configuration files are in `apps/web/.env` (for development)

## Code Standards (Ultracite/Biome)

This project enforces strict code quality via **Ultracite** (Biome preset). Key principles:

**Type Safety**:

- Explicit types for function parameters/returns when it enhances clarity
- Prefer `unknown` over `any`
- Use const assertions (`as const`) for immutable values

**Modern Patterns**:

- Arrow functions for callbacks
- `for...of` over `.forEach()` and indexed loops
- Optional chaining (`?.`) and nullish coalescing (`??`)
- Template literals over concatenation
- `const` by default, `let` only when reassignment needed

**React**:

- Function components only
- Hooks at top level with correct dependencies
- Unique keys for iterables (prefer IDs over indices)
- Semantic HTML and proper ARIA attributes for accessibility
- React 19: use ref as prop instead of `React.forwardRef`

**Async/Await**:

- Always `await` promises in async functions
- Use `async/await` over promise chains
- Proper error handling with try-catch

**Performance**:

- Avoid spread in accumulators within loops
- Use top-level regex literals
- Prefer specific imports over namespace imports

**Security**:

- Add `rel="noopener"` when using `target="_blank"`
- Validate and sanitize user input

## Important Patterns

### Rate Limiting

Rate limiting utilities in `packages/api/src/utils/`:

- `rate-limit.ts` - Helper functions for rate limit keys and calculations
- `redis-operations.ts` - Fixed and sliding window implementations
- Apply via middleware: `fixedWindowRatelimitMiddleware({ limit: 10, windowSeconds: 60 })`

### Logging

- Uses Pino logger configured in `packages/api/src/context.ts`
- Available in oRPC context via `@orpc/experimental-pino`
- Level controlled by `LOG_LEVEL` env var (defaults to "error")

### Permissions

- Permission definitions in `packages/shared/permissions.ts`
- Check permissions via `permissionProcedure([permissions...])` middleware
- Uses Better-Auth's `userHasPermission` API

### Code Style

- Never comment stuff that's too obvious, the code must be self-explanatory
- Naming should clearly express the purpose of what it is describing

## Testing Guidelines

- Tests should be in `*.test.ts` or `*.spec.ts` files
- Web app tests use happy-dom environment
- API tests use node environment
- Use async/await instead of done callbacks
- Don't commit `.only` or `.skip` in tests
