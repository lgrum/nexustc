# Profile Media R2 lifecycle

Temporary Profile Media sources use `profiles/temp/`. Canonical Profile Media
uses `profiles/media/`. Before deploying code that issues temporary sources,
the target R2 bucket must have the uniquely named
`profile-media-abandoned-sources-1d` lifecycle rule.

Run the repository operator check from a trusted shell with the complete
application environment from `packages/env/src/index.ts` loaded, including
`CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
`R2_ASSETS_BUCKET_NAME`, plus the operator-only `CLOUDFLARE_API_TOKEN`. The
Cloudflare token needs permission to read bucket lock rules, and the R2
credentials need bucket lifecycle and object read/write access.

First inventory the exact target without changing it:

```powershell
bun run --cwd packages/api profile-media:lifecycle --bucket=$env:R2_ASSETS_BUCKET_NAME --confirm-bucket=$env:R2_ASSETS_BUCKET_NAME --confirm-prefix=profiles/temp/
```

Review every lifecycle and lock rule printed by that command. Obtain explicit
authorization for that bucket and environment, then apply and verify:

```powershell
bun run --cwd packages/api profile-media:lifecycle --apply --bucket=$env:R2_ASSETS_BUCKET_NAME --confirm-bucket=$env:R2_ASSETS_BUCKET_NAME --confirm-prefix=profiles/temp/ --handoff=profile-media-r2-lifecycle-handoff.md
```

The apply command preserves existing lifecycle and lock rules, refuses an
overlapping lock, upserts only the Profile Media rule, and uploads temporary
and permanent probes through presigned URLs. It requires the temporary probe
to report the named one-day expiration rule and the permanent probe to report
no expiration, removes both probes, then writes the credential-free deployment
handoff. The handoff path must not already exist.

R2 may physically remove expired objects after the reported expiration time;
the lifecycle rule is fallback cleanup for sources abandoned before
finalization.
