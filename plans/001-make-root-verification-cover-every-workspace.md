# Plan 001: Make root verification cover every TypeScript workspace

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report it; do not weaken checks or improvise.
> When done, update this plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5899131..HEAD -- package.json bun.lock packages/api/package.json packages/api/tsconfig.json packages/api/src/services/patreon-reconciliation.test.ts packages/auth/package.json packages/db/package.json packages/env/package.json packages/patreon/package.json packages/shared/package.json packages/transactional/package.json`
> If an in-scope file changed, compare the excerpts below with the live code.
> A material mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests, dx
- **Planned at**: commit `5899131`, 2026-07-14
- **Result**: DONE on `codex/plan-001-verification-baseline`
- **Commits**: `057ad01` (LF baseline), `10020f9` (Plan 001)

## Why this matters

The advertised root commands are green while Turbo silently skips most
workspaces. Auth and Patreon already contain five tests that `bun run test`
does not run, and only the Next workspace currently participates in
`bun run check-types`. This plan makes the existing root commands truthful
without inventing CI, adding empty test tasks, or tightening unrelated web
compiler policy.

## Current state

- `package.json:43-45` delegates `test` and `check-types` to Turbo.
- `apps/web/package.json:11-12` is the only workspace with both
  `check-types: tsc --noEmit` and `test: vitest run`.
- `packages/api/package.json:12-14` has Vitest scripts but no `check-types`.
- `packages/auth/package.json:12` has no scripts, despite
  `packages/auth/test/two-factor-delivery.test.ts` containing one passing test.
- `packages/patreon/package.json` has no scripts, despite
  `packages/patreon/src/index.test.ts` containing four passing tests.
- Root `package.json` catalogs TypeScript `^5.9.3` but installs `^6.0.3` as a
  root dev dependency. Every package peer range is TypeScript 5.
- A direct TypeScript 5.9 check found only these characterized issues:
  `packages/api/tsconfig.json` needs JSX enabled to follow auth imports into
  transactional `.tsx` templates; Patreon must own Vitest; and
  `packages/api/src/services/patreon-reconciliation.test.ts:29` must use a
  typed `Promise.resolve()` implementation because zero-argument
  `mockResolvedValue()` fails TypeScript 5.9 while an explicit `undefined`
  violates Oxlint.
- Execution on 2026-07-14 traced the apparent 541-file formatting failure to
  Windows `core.autocrlf=true` in new worktrees. Commit `057ad01` adds
  `* text=auto eol=lf` to `.gitattributes`; no mass content rewrite was needed.
- Manifest convention: scripts use direct tool commands (`vitest run`,
  `tsc --noEmit`) and shared versions use the Bun workspace catalog.

## Commands you will need

| Purpose           | Command                                  | Expected on success                                 |
| ----------------- | ---------------------------------------- | --------------------------------------------------- |
| Install           | `bun install`                            | exit 0; lockfile updated without unrelated upgrades |
| Graph             | `bun x turbo run check-types --dry=json` | eight real `tsc --noEmit` tasks                     |
| Typecheck         | `bun run check-types`                    | exit 0 for all participating workspaces             |
| Tests             | `bun run test`                           | API, web, auth, and Patreon tasks all pass          |
| Format            | `bun run fmt:check`                      | exit 0                                              |
| Lint              | `bun run lint`                           | exit 0; no new warnings in changed files            |
| Required fix pass | `bun run check`                          | exit 0; inspect all formatter/linter edits          |

## Scope

**In scope**:

- `package.json`
- `bun.lock`
- `packages/api/package.json`
- `packages/api/tsconfig.json`
- `packages/api/src/services/patreon-reconciliation.test.ts`
- `packages/auth/package.json`
- `packages/db/package.json`
- `packages/env/package.json`
- `packages/patreon/package.json`
- `packages/shared/package.json`
- `packages/transactional/package.json`

**Out of scope**:

- `apps/web/tsconfig.json` strictness or test exclusions.
- Fake `test` tasks or `--passWithNoTests` in packages with no tests.
- A `check-types` task for `@repo/config`; it has no project tsconfig or source.
- CI, workspace renames, dependency cleanup beyond the TypeScript version.
- Compiler suppressions, skipped tests, or weaker compiler flags.

## Git workflow

- Branch: `codex/plan-001-verification-baseline`
- Use conventional commits, e.g. `test(repo): cover every workspace`.
- Do not push or open a PR unless instructed by the operator.

## Steps

### Step 1: Align the root compiler with package peer ranges

In root `package.json`, change only the TypeScript dev dependency from
`^6.0.3` to `^5.9.3`, matching the existing catalog and package peer ranges.
Run `bun install`; inspect the lockfile and reject unrelated dependency-family
upgrades.

**Verify**: `bun x tsc --version` -> a 5.9.x version.

### Step 2: Add real typecheck tasks

Add `"check-types": "tsc --noEmit"` to the scripts in API, auth, DB, env,
Patreon, shared, and transactional package manifests. Preserve existing
scripts. Add `"jsx": "react-jsx"` only to `packages/api/tsconfig.json` so its
workspace-source dependency graph can resolve transactional email templates.

**Verify**:
`$j = bun x turbo run check-types --dry=json | ConvertFrom-Json; $j.tasks | Select-Object taskId,command`
-> real `tsc --noEmit` commands for `next`, API, auth, DB, env, Patreon,
shared, and transactional; only `@repo/config` may be `<NONEXISTENT>`.

### Step 3: Wire the existing skipped tests

Add `"test": "vitest run"` and dev dependency `"vitest": "catalog:"` to
auth and Patreon only. Do not create test scripts elsewhere. In
`patreon-reconciliation.test.ts`, replace the zero-argument mock with:

```ts
where: vi.fn(() => Promise.resolve()),
```

**Verify**:

- `bun run --cwd packages/auth test` -> one file and one test pass.
- `bun run --cwd packages/patreon test` -> one file and four tests pass.

### Step 4: Prove the root gates are truthful

Run the root typecheck and test commands. The current aggregate is 204 tests
across 40 files, but use named Turbo task success rather than that brittle total
if unrelated tests have been added since this plan was written.

**Verify**:

- `bun run check-types` -> all eight TypeScript project tasks pass.
- `bun run test` -> API, web, auth, and Patreon tasks pass.
- `bun run fmt:check` and `bun run lint` -> exit 0.
- Run `bun run check` last as required by repository policy, inspect its diff,
  then rerun `bun run fmt:check` and `bun run lint` -> exit 0.

## Test plan

No new test behavior is needed; the purpose is to execute tests that already
exist. The two focused package commands prove auth and Patreon are wired, and
the Turbo dry runs prove no package is silently omitted.

## Done criteria

- [x] Root TypeScript resolves to 5.9.x.
- [x] Turbo runs eight real `check-types` tasks.
- [x] Turbo runs tests for API, web, auth, and Patreon.
- [x] `bun run check-types`, `bun run test`, `bun run check`,
      `bun run fmt:check`, and `bun run lint` exit 0.
- [x] No suppressions, skipped tests, or empty fake tasks were added.
- [x] `git diff --check` prints nothing.
- [x] The isolated worktree is clean after the two scoped commits.

## STOP conditions

Stop and report if:

- Any workspace other than the characterized API/Patreon cases fails under
  TypeScript 5.9.
- API still has errors beyond the JSX and mock signature cases described here.
- Passing requires weaker compiler flags, more exclusions, suppressions,
  `.skip`, `.only`, or `--passWithNoTests`.
- A package with source has no tsconfig, or another package contains tests that
  this plan did not account for.
- `bun install` selects TypeScript 6 or upgrades unrelated dependency families.
- `bun run fmt:check` is not green before this plan, or `bun run check` would
  modify files outside the in-scope list. Do not normalize the whole repository
  inside this plan.

## Maintenance notes

Any new TypeScript workspace must declare `check-types`; any workspace that
adds its first test must declare `test` and own Vitest. Keep Turbo as the single
root orchestrator. Web strictness is a separate migration and should not be
smuggled into this baseline plan.
