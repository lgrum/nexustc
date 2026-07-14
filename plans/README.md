# NeXusTC improvement plans

These read-only advisory handoffs were generated with the `improve` skill from
repository commit `5899131` on 2026-07-14. Each plan is self-contained for a
separate executor.
Before implementation, run the plan's drift check and reconcile it with the
live branch. A plan remains **TODO** until an executor starts it; it reaches
**DONE** only after its verification and rollout conditions pass.

## Recommended execution order

| Order | Plan                                                                                                                 | Priority | Effort |  Risk   | Depends on | Status                      |
| ----: | -------------------------------------------------------------------------------------------------------------------- | :------: | :----: | :-----: | ---------- | --------------------------- |
|     1 | [001 - Make root verification cover every TypeScript workspace](001-make-root-verification-cover-every-workspace.md) |    P1    |   M    |   LOW   | -          | DONE - `d7184df`, `0bd9bb6` |
|     2 | [004 - Repair the Drizzle migration chain safely](004-repair-the-drizzle-migration-chain.md)                         |    P0    |   M    |  HIGH   | 001        | TODO                        |
|     3 | [002 - Harden the RPC HTTP boundary](002-harden-the-rpc-http-boundary.md)                                            |    P1    |   S    |   MED   | 001        | TODO                        |
|     4 | [003 - Keep news hidden until linked content is public](003-enforce-public-visibility-on-news.md)                    |    P1    |  S-M   |   MED   | 001        | TODO                        |
|     5 | [007 - Make API session roles authoritative](007-refresh-privileged-session-authorization.md)                        |    P1    |   S    | LOW-MED | 001        | TODO                        |
|     6 | [005 - Authenticate Patreon webhooks before persistence](005-authenticate-patreon-webhooks-before-persistence.md)    |    P1    |   M    |   MED   | 001, 004   | TODO                        |
|     7 | [006 - Bound admin image processing and uploads](006-bound-admin-image-processing.md)                                |    P1    |   M    |   MED   | 001, 002   | TODO                        |
|     8 | [008 - Add one-time profile upload intents](008-add-one-time-profile-upload-intents.md)                              |    P1    |   M    |   MED   | 001, 007   | TODO                        |

Plan 004 is the highest-severity repository defect, but Plan 001 goes first so
the migration mapping test and all later package tests actually participate in
root verification. Begin Plan 004's read-only deployed-environment inventory
immediately while Plan 001 is implemented; make its repository change only
after Plan 001 and the inventory gate pass. After Plan 001, independent plans
may run in parallel when they do not share a dependency or file. In particular,
Plans 003, 004, and 007 do not overlap. Keep Plans 002 then 006 sequential
because both edit the RPC route, Plans 004 then 005 sequential because 005
generates a migration, and Plans 007 then 008 sequential because the admin
upload flow relies on refreshed privileged authorization.

## Outcome map

- **Verification/DX**: Plan 001 makes the advertised root tests and type-check
  cover all TypeScript workspaces.
- **Request boundaries**: Plans 002, 005, and 006 constrain RPC, webhook, and
  image inputs at their earliest trusted boundary.
- **Public data policy**: Plan 003 makes public news reuse the existing content
  visibility predicate.
- **Deployment safety**: Plan 004 repairs a broken journal-to-SQL mapping only
  after read-only deployed-state reconciliation.
- **Authorization**: Plan 007 removes the five-minute cached-role window from
  oRPC authorization and entitlement decisions.
- **Object storage**: Plan 008 binds profile uploads to atomic, one-time,
  short-lived server intents.

## Shared completion rules

For every plan:

1. Start from a clean, current branch and run the drift check.
2. Stop on any listed STOP condition; do not weaken a boundary to make tests
   pass.
3. Run focused verification first, then the root commands added by Plan 001.
4. Run `bun run check` after implementation because it may format files;
   inspect its diff, then rerun any focused/type/build gate affected by edits.
5. Update the plan's status row and record a PR/commit link when available.
   Valid statuses are `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`, and `REJECTED`.
6. Use the suggested conventional commit unless the actual diff requires a
   more accurate scope.

## Deliberately deferred work

These plans do not introduce a CI provider, generic job queue, generalized
upload framework, role cache, new scheduler, or cross-system transaction
layer. Those abstractions are not required to close the verified gaps. The
plans identify narrow maintenance follow-ups, such as webhook retention and R2
lifecycle cleanup, where the repository currently lacks an established owner or
runtime mechanism.
