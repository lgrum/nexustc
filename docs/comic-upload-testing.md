# Comic upload testing

## Isolated environment

Use a disposable PostgreSQL database, R2 bucket, and uploader account. Point the local app's `DATABASE_URL`, `R2_ASSETS_BUCKET_NAME`, R2 credentials, and `NEXT_PUBLIC_ASSETS_BUCKET_URL` at those resources. The R2 bucket must allow browser `PUT` requests from `http://localhost:3000`.

Never run interruption or cleanup tests against production.

## Automated checks

```bash
bun run test
bun run check-types
```

The upload tests cover natural filename ordering, four-request concurrency, 25-item signing batches, out-of-order completion, individual upload failures, ordered object-key manifests, and retries without re-uploading successful pages.

## Generate browser fixtures

Generate an ordered fixture set in the system temp directory:

```bash
bun run test:comic-upload:fixtures 10
bun run test:comic-upload:fixtures 100
bun run test:comic-upload:fixtures 500
bun run test:comic-upload:fixtures 1000
```

An optional second argument overrides the output directory.

## Browser matrix

Run `bun run dev:next`, create a draft comic, and test fixture sets in this order: 10, 100, 500, then 1,000 pages.

For every set:

1. Confirm pages initially appear in natural filename order.
2. Reorder the first, middle, and last pages before upload.
3. Apply the selection and confirm it creates no R2 or media-registration requests.
4. Submit the comic and confirm no more than four R2 `PUT` requests run concurrently.
5. Confirm the first request creates an upload session and returns the reserved comic ID.
6. Confirm signing requests contain no more than 25 items and every R2 key starts with `media/comic/<comic-id>/<session-id>/`.
7. Confirm no media rows exist for the session before the final comic mutation.
8. Confirm the final mutation contains ordered object keys rather than image bodies.
9. Open the media library and confirm the pages are inside `Comic/<comic title>`, never the root.
10. Open and edit the comic to confirm the chosen order is unchanged.
11. Open the reader and verify the labeled first, middle, and last pages.

Check the persisted order directly:

```sql
SELECT pm.sort_order, m.object_key
FROM post_media AS pm
JOIN media AS m ON m.id = pm.media_id
WHERE pm.post_id = '<test-comic-id>'
ORDER BY pm.sort_order;
```

`sort_order` must be contiguous from `0` through `comic_page_count - 1`.

## Failure matrix

Repeat the 10-page test while using browser network controls to:

- switch offline after several uploads complete, then restore connectivity and retry;
- block one R2 `PUT` request;
- block the final comic mutation after its R2 uploads complete, then retry;
- throttle to Slow 3G;
- cancel the comic form before submission and confirm that no upload occurred.

Only failed pages should remain pending. A finalization retry must reuse uploaded object keys, return the same comic ID after a lost success response, and never change page order.

Unfinished sessions expire after 24 hours. Starting a later upload opportunistically removes expired sessions and their R2 objects; finalized sessions only lose their temporary session row.

Refreshing the browser during an unfinished upload is intentionally not recoverable in Phase 1.
