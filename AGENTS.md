# AGENTS.md

Guidelines for AI coding agents working in the NeXusTC codebase.

## Project Overview

NeXusTC is a full-stack TypeScript monorepo with TanStack Start (React + SSR), oRPC for type-safe APIs, Turborepo, Drizzle ORM (PostgreSQL), Better-Auth, and Redis. Package manager: **bun@1.3.0**.

## Build/Lint/Test Commands

```bash
# Development
bun run dev              # Start all apps (web on port 3000)
bun run dev:web          # Start web app only
bun install              # Install dependencies

# Building
bun run build            # Build all packages/apps
bun run web:build        # Build web app only
bun run check-types      # Type-check all packages

# Code Quality (Ultracite/Biome)
bun run check            # Run linter/formatter with auto-fix

# Testing
bun run test             # Run all tests
bun run test:watch       # Run API tests in watch mode (in packages/api)

# Single test file:
bun run test -- path/to/file.test.ts
# or within a package:
cd packages/api && bun run test -- src/routers/user.test.ts

# Database
bun run db:push          # Push schema changes to database
bun run db:generate      # Generate migrations from schema
```

## Code Style Guidelines

### TypeScript

- Use explicit types for function parameters/returns when it enhances clarity
- Prefer `unknown` over `any`
- Use const assertions (`as const`) for immutable values
- Prefer `type` over `interface` for type definitions

### Naming Conventions

- Variables/functions: camelCase (`getUserProfile`)
- Components: PascalCase (`UserProfile`)
- Constants: UPPER_SNAKE_CASE for true constants
- Files: kebab-case for utilities, PascalCase for components
- Database tables/columns: snake_case in schema

### Imports & Formatting

- Use specific imports over namespace imports
- Group imports: external libs first, then internal (`@repo/*`), then relative
- No barrel files (index re-exports)
- Use `const` by default, `let` only when reassignment needed
- Arrow functions for callbacks and short functions

### Modern Patterns

- `for...of` over `.forEach()` and indexed loops
- Optional chaining (`?.`) and nullish coalescing (`??`)
- Template literals over string concatenation
- Destructuring for objects/arrays
- Early returns over nested conditionals

### React

- Function components only (no class components)
- Hooks at top level only, never conditionally
- Specify all dependencies in hook arrays correctly
- Use `key` prop with unique IDs (not indices)
- React 19: use ref as prop, not `React.forwardRef`
- Semantic HTML and ARIA attributes for accessibility

### Async/Await

- Always `await` promises in async functions
- Use `async/await` over promise chains
- Proper error handling with try-catch
- Don't use async functions as Promise executors

### Error Handling

- Remove `console.log`, `debugger`, `alert` from production code
- Throw `Error` objects with descriptive messages
- Use try-catch meaningfully - don't catch just to rethrow
- Prefer early returns for error cases

### Security

- Add `rel="noopener"` when using `target="_blank"`
- Validate and sanitize user input
- Avoid `dangerouslySetInnerHTML` unless necessary

### Performance

- Avoid spread in accumulators within loops
- Use top-level regex literals
- Prefer specific imports over namespace imports

### Comments

- Never comment obvious code - it must be self-explanatory
- Use comments only for complex logic that needs explanation

## Testing Guidelines

- Test files: `*.test.ts` or `*.spec.ts`
- Web tests: Vitest with happy-dom environment
- API tests: Vitest with node environment
- Use async/await, never done callbacks
- Don't commit `.only` or `.skip` in tests
- Keep test suites flat - avoid excessive `describe` nesting

## Architecture Patterns

### API (oRPC)

- Use `publicProcedure` for unauthenticated endpoints
- Use `protectedProcedure` for authenticated-only
- Use `permissionProcedure([permissions])` for role-based access
- Routers organized by domain in `packages/api/src/routers/`

### Database (Drizzle)

- Schema in `packages/db/src/schema/app.ts`
- Use re-exported operators (`eq`, `and`, `or`) from `@repo/db`
- Redis singleton via `getRedis()`

### Frontend (TanStack Start)

- File-based routing in `apps/web/src/routes/`
- Components in `apps/web/src/components/`
- Use `orpc` client for API calls with TanStack Query
- Routes auto-generated - don't manually edit `routeTree.gen.ts`

## Environment Variables

Required: `DATABASE_URL`, `REDIS_URL`
Build-time: `VITE_TURNSTILE_SITE_KEY`, `VITE_ASSETS_BUCKET_URL`

Always run `bun run check` before committing to ensure code passes Ultracite/Biome rules.

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `bun x ultracite fix`
- **Check for issues**: `bun x ultracite check`
- **Diagnose setup**: `bun x ultracite doctor`

Oxlint + Oxfmt (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Oxlint + Oxfmt Can't Help

Oxlint + Oxfmt's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Oxlint + Oxfmt can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Oxlint + Oxfmt. Run `bun x ultracite fix` before committing to ensure compliance.
