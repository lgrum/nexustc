# Plan 008: Add one-time profile upload intents

> **Executor instructions**: Follow this plan step by step. Use Redis `GETDEL`
> for atomic one-time consumption; do not replace it with `GET` followed by
> `DEL`. If a STOP condition occurs, stop and report it. When done, update this
> plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5899131..HEAD -- packages/api/src/utils/profile-media-cooldown.ts packages/api/src/utils/profile-media-cooldown.test.ts packages/api/src/routers/profile.ts packages/api/src/routers/profile.test.ts packages/api/src/routers/profile-admin.ts packages/api/src/routers/profile-admin.test.ts packages/api/src/routers/file.ts apps/web/src/lib/profile-media-upload.ts apps/web/src/lib/profile-media-upload.test.ts apps/web/src/components/profile/appearance-section.tsx apps/web/src/components/admin/profile-asset-input.tsx`
> If an in-scope file changed, reconcile the live request/response shapes and
> cleanup semantics before proceeding. A material mismatch is a STOP
> condition.

## Status

- **State**: DONE
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plans 001 and 007
- **Category**: security, storage, reliability
- **Planned at**: commit `5899131`, 2026-07-14
- **Result**: APPROVE on `codex/plan-008-profile-upload-intents`
- **Commit**: `f95d80a`
- **Capability note**: The operator confirmed production Redis 7.2 and supplied
  a successful `COMMAND INFO GETDEL` response before implementation resumed.

## Why this matters

Profile upload policy endpoints mint reusable object-storage credentials and
finalize endpoints accept any object under the caller's allowed key prefix.
They do not bind finalization to one short-lived server-side authorization for
an exact key, slot, content type, and byte length. The ordinary-user cooldown
is also reserved only during finalization, so callers can mint multiple
policies before the first finalize. A one-time Redis intent closes both gaps
without changing the client contract or inventing a general upload framework.

## Current state

- `packages/api/src/utils/profile-media-cooldown.ts` reserves a Redis cooldown
  with `SET ... NX EX` for five minutes and already has focused tests.
- The ordinary profile policy checks cooldown/TTL and signs for one hour; the
  finalize procedure inspects the object and only then reserves cooldown.
- Admin profile policy/finalize has similar signing/finalization behavior but
  intentionally no ordinary-user cooldown.
- Rejected-object cleanup exists in the admin finalize path; the ordinary
  profile path currently returns `BAD_REQUEST` without deleting the rejected
  object.
- `packages/api/src/routers/file.ts` contains an unbounded legacy
  `getPostPresignedUrls` procedure with no internal callers and a bounded
  `getAvatarUploadUrl` procedure that is bounded; no internal caller was found,
  so unknown external compatibility is the reason to preserve it.

## Target state

- Every profile policy creates a five-minute Redis intent binding exact upload
  metadata and object key to one user/slot.
- Finalization atomically consumes that intent before accepting the R2 object;
  replay or mismatch is rejected.
- Signed/client upload conditions make each issued object key create-only, so
  an accepted object cannot be overwritten during the remaining URL TTL.
- Ordinary-user cooldown is reserved before signing, not after upload.
- Once reserved, the ordinary cooldown always expires naturally after five
  minutes; failure paths never risk deleting a concurrent request's key.
- The unused unbounded legacy post signer is removed after consumer checks.

## Scope

### In scope

- `packages/api/src/utils/profile-media-cooldown.ts`
- `packages/api/src/utils/profile-media-cooldown.test.ts`
- `packages/api/src/routers/profile.ts`
- `packages/api/src/routers/profile.test.ts`
- `packages/api/src/routers/profile-admin.ts`
- `packages/api/src/routers/profile-admin.test.ts`
- `packages/api/src/routers/file.ts`
- `apps/web/src/lib/profile-media-upload.ts`
- `apps/web/src/lib/profile-media-upload.test.ts`
- `apps/web/src/components/profile/appearance-section.tsx`
- `apps/web/src/components/admin/profile-asset-input.tsx`

### Out of scope

- Comic/admin-media upload flows
- Client request/response shape changes
- R2 lifecycle-rule provisioning
- Profile history retention redesign
- Making profile database writes and object storage globally atomic
- A generic upload-intent framework

## Implementation steps

### 1. Prove Redis and consumer prerequisites

Before coding:

1. Confirm every deployed Redis is version 6.2 or newer and supports `GETDEL`.
2. Search the monorepo and deployment/client documentation for
   `getPostPresignedUrls`. Confirm there are no generated clients, external
   scripts, or released applications that call it.
3. Capture current profile policy/finalize request and response shapes; this
   plan must preserve them.

If external clients call the legacy signer, deprecate and meter it in a
separate compatibility plan rather than deleting it here.

For each Redis environment, use its approved read-only CLI/session and run:

```bash
redis-cli -u "$REDIS_URL" INFO server
redis-cli -u "$REDIS_URL" COMMAND INFO GETDEL
```

Expected: `redis_version` is at least 6.2 and the second command returns a
non-empty command description. Never paste the resolved URL into the plan,
logs, or PR. If `redis-cli` is unavailable, operations must provide equivalent
version/command output before implementation proceeds.

### 2. Extend the existing cooldown utility with intents

Keep the current filename; do not split or rename this small Redis concern.
In `profile-media-cooldown.ts`, define a Zod-validated intent value with:

```ts
type ProfileMediaUploadIntent = {
  contentLength: number;
  contentType: string;
  objectKey: string;
  issuedToUserId: string;
  slot: "avatar" | "banner" | "role-icon" | "role-overlay" | "emblem-icon";
};
```

Use the exact live slot union if names differ. Add helpers for:

- Intent key: `profile:media-upload-intent:${objectKey}`
- Create: `SET key JSON NX EX 300`
- Consume: one Redis `cache.getDel(key)` call (the `GETDEL` command), followed
  by safe JSON parse/Zod validation
- Delete: used only to roll back a policy/signing failure before finalization

Creation must return whether the key was reserved; it must not overwrite an
existing intent. Consumption returns `null` for absent, malformed, or expired
values and makes the key unusable for a second finalize. Do not perform
`GET`/validate/`DEL` as separate Redis calls.

Reuse the current five-minute cooldown constant for the intent and presigned
policy lifetime unless the live provider requires a shorter supported value.

### 3. Reserve ordinary-user authorization before signing

In the ordinary profile upload-policy procedure:

1. Perform current authentication and input validation.
2. Reserve the existing user/slot cooldown with `SET NX EX`.
3. Generate the exact object key.
4. Create the exact intent with `SET NX EX`.
5. Sign an upload policy for five minutes, preserving content-length/type
   constraints and including `IfNoneMatch: "*"` in `PutObjectCommand`.

If intent creation or signing fails, delete only the unique object-key intent
if it was created. Leave the cooldown to expire after five minutes. The current
cooldown value is only `"1"`, so deleting it in a failure path could remove a
new reservation if the original TTL expired during a slow request.

Apply the same signed `IfNoneMatch: "*"` condition in the admin profile-media
policy. This is load-bearing: consuming an intent does not invalidate a
presigned URL, so without a create-only PUT the caller could overwrite an
already-finalized key during the remaining URL TTL. Follow the existing server
pattern in `packages/api/src/routers/media.ts`'s comic upload policy.

### 4. Consume and validate on ordinary finalization

In the ordinary finalize procedure:

1. Validate the caller and allowed object-key prefix as defense in depth.
2. Atomically consume the intent with `GETDEL` before reading from R2.
3. Require exact matches for issued-to user ID, slot, object key, expected content
   type, and expected content length.
4. Inspect the object and compare actual type/length to the consumed intent.
5. Continue the existing profile update and history behavior.

On a missing/replayed intent, reject without deleting the object: a replay may
refer to an object already accepted by the database. If an intent was consumed
but its bound metadata mismatches, delete that rejected object. On ordinary
object validation failure, add the same rejected-object deletion already used
by the admin path. In every failure and success case, leave the cooldown in
place for its normal TTL.

Remove the current database-failure `cache.del(cooldownKey)` for the same race
reason; the five-minute TTL is the cleanup. Do not delete an object after a
partial database commit unless the existing code proves no row refers to it;
broader cross-system atomicity is outside this plan.

### 5. Apply one-time intents to admin profile uploads

In `profile-admin.ts`, create and consume the same exact intent around the
admin policy/finalize flow. Bind `issuedToUserId` to the authenticated owner who
receives the current `profiles/<slot>/<session-user-id>/...` key. Keep current
owner authorization (strengthened by Plan 007).

Do not apply the ordinary user's cooldown to administrators. Retain the
five-minute intent expiry and rejected-object cleanup.

### 6. Send the signed create-only header from both browser clients

Create `apps/web/src/lib/profile-media-upload.ts` with one small wrapper around
the existing `uploadBlobWithProgress`. The wrapper must always pass:

```ts
{ "If-None-Match": "*" }
```

through the helper's existing fourth argument while preserving an optional
progress callback. Use this wrapper from both
`components/profile/appearance-section.tsx` and
`components/admin/profile-asset-input.tsx`.

Model it on `apps/web/src/lib/comic-page-upload-client.ts`, which already sends
the same header required by its signed `IfNoneMatch` condition. Do not duplicate
the header literal in two components.

### 7. Remove only the unused unbounded signer

After the consumer check in step 1, delete
`getPostPresignedUrls` from `packages/api/src/routers/file.ts` and remove only
imports/constants made unused by that deletion.

Keep `getAvatarUploadUrl` and all other file-router behavior. Do not rename the
router or clean up unrelated legacy code in this change.

### 8. Extend Redis, router, and browser-helper tests

Extend `profile-media-cooldown.test.ts` to cover:

1. Intent keys include the exact object key.
2. Create uses `NX` and `EX 300` and does not overwrite.
3. A valid intent round-trips through one `GETDEL`.
4. A second consume returns `null`.
5. Malformed JSON or schema-invalid data is rejected safely.
6. Existing cooldown behavior remains intact.
7. No failure path deletes the shared cooldown; TTL remains the only release.

Add focused profile/admin router tests proving:

- Policy reserves before signing; signer failure removes its unique intent but
  leaves cooldown active.
- Finalize rejects missing/replayed/mismatched intents before accepting the
  object.
- Actual R2 metadata must match the consumed intent.
- Successful and rejected ordinary finalize leave cooldown active; rejected
  validation deletes the rejected object.
- Admin intents bind to the requesting owner and remain one-time.
- Both policy tests inspect the signed `PutObjectCommand` and require
  `IfNoneMatch: "*"`.

In `apps/web/src/lib/profile-media-upload.test.ts`, mock
`uploadBlobWithProgress`, call the wrapper with and without a progress callback,
and assert the fourth argument is exactly `{ "If-None-Match": "*" }` while the
file, URL, and callback are forwarded unchanged.

Mock Redis and R2. Do not require live external services.

### 9. Verify

Run:

```bash
bun run --cwd packages/api test -- src/utils/profile-media-cooldown.test.ts src/routers/profile.test.ts src/routers/profile-admin.test.ts
bun run --cwd apps/web test -- src/lib/profile-media-upload.test.ts
bun run test
bun run check-types
bun run check
rg -n "getPostPresignedUrls" apps packages --glob "!node_modules/**"
```

Use the actual router test filenames if the repository organizes them
differently. The final `rg` must return no application/client references.

An operator may additionally exercise Redis/R2 in a non-production environment,
but that is not a completion gate without an established integration harness.

## Done criteria

- [ ] Both policy families create exact five-minute intents and presigned URLs.
- [ ] Both signed PUTs require `If-None-Match: *`, and both browser flows send
      it through the tested shared wrapper.
- [ ] Finalize uses one Redis `GETDEL`; replay and metadata mismatch fail.
- [ ] Ordinary cooldown is reserved before signing and no failure path deletes
      it.
- [ ] Rejected ordinary/admin objects are deleted only when doing so cannot
      affect an already accepted replay.
- [ ] `getPostPresignedUrls` has no application/package references; the bounded
      avatar procedure remains.
- [ ] Focused/root tests, type-check, and check exit 0.
- [ ] Only the eleven in-scope files and `plans/README.md` changed.
- [ ] The Plan 008 index row is updated.

## STOP conditions

- Any deployed Redis lacks atomic `GETDEL` support.
- An external or generated client still calls `getPostPresignedUrls`.
- Presigned policy lifetime cannot be reduced to five minutes without breaking
  a measured client workflow.
- R2 does not expose trustworthy content length/type for finalization.
- R2 does not enforce the signed `If-None-Match: *` conditional PUT semantics
  already used by comic uploads.
- Current profile database writes can partially commit in a way that makes the
  prescribed object cleanup unsafe.

## Maintenance notes

- Configure an R2 lifecycle rule for abandoned profile-upload prefixes when
  infrastructure ownership is established; intents cannot remove objects that
  are uploaded but never finalized.
- Keep intent TTL and presigned-policy TTL aligned.
- Extend this exact mechanism to another upload family only after its threat
  model and client flow are reviewed; do not generalize preemptively.

## Suggested delivery

- **Branch**: `codex/plan-008-profile-upload-intents`
- **Commit**: `fix(api): bind profile uploads to one-time intents`
