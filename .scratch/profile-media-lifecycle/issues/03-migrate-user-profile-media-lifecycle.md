# 03 — Migrate user Profile Media lifecycle

**What to build:** Put avatar and banner upload, canonicalization, activation, replacement, removal, and physical-deletion recovery behind the deep Profile Media interface without changing the browser-facing procedures.

**Blocked by:** 02 — Complete bounded admin image ingestion.

**Status:** resolved

- [x] A narrow Profile Media deletion ledger is added through a reviewed database migration with journal and snapshot metadata.
- [x] Postgres remains authoritative: replacement or removal changes the active reference, removes the obsolete media record, and records its R2 key atomically.
- [x] The Profile Media module exposes the agreed issue, finalize, user-removal, and managed-change interface with stable Profile Media error codes.
- [x] R2 sits behind one production adapter and one in-memory test adapter; database and Redis clients are passed directly.
- [x] Upload intents remain single-use and bind actor, slot, key, MIME type, and source length.
- [x] Source uploads use the dedicated temporary prefix and canonical WebPs use a separate permanent prefix.
- [x] Every supported source becomes canonical WebP; animated GIFs preserve animation and existing WebP avoids lossy re-encoding.
- [x] Regular avatar/banner limits and entitlement rules remain unchanged.
- [x] Owner avatar/banner sources may use the 40 MiB allowance while canonical output remains capped at 10 MiB.
- [x] Finalizing an avatar or banner activates it and retires displaced Profile Media.
- [x] Removing an avatar or banner permanently retires it with no retained history.
- [x] Successful R2 deletion removes the ledger entry; failure leaves durable retry metadata.
- [x] Every Profile Media mutation performs a small fair cleanup sweep without failing the user-visible mutation.
- [x] Existing procedure names, request bodies, response bodies, authentication, and Spanish errors remain unchanged.
- [x] Interface tests cover issuance, replay rejection, metadata mismatch, optimization, limits, activation, replacement, removal, successful deletion, failed deletion, and retry fairness.
- [x] Router tests are reduced to authentication, trust-boundary validation, error translation, and contract preservation.
- [x] The migration test, focused package tests, repository tests, type checks, formatting checks, and production web build pass.

## Answer

Implemented the user Profile Media lifecycle behind the preserved profile RPC contracts, including canonical WebP storage, atomic replacement/removal, durable deletion retries, bounded cleanup, and the reusable managed-reference change interface.
