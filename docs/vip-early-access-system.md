# VIP Early Access System

## Product Positioning

The system is designed to monetize time, not permanence.

- The main catalog stays public-first.
- Early Access lives in its own VIP discovery surface.
- Non-eligible users can still browse, read the synopsis, and inspect screenshots.
- The strongest conversion levers are curiosity, countdown pressure, and temporary exclusivity.

## Internal Lifecycle

Each published game post can move through three effective states:

1. `VIP12_ONLY`
2. `VIP8_ONLY`
3. `PUBLIC`

The lifecycle is derived from server timestamps, never from the browser clock.

- `earlyAccessEnabled`
- `earlyAccessStartedAt`
- `vip12EarlyAccessHours`
- `vip8EarlyAccessHours`
- `earlyAccessVip12EndsAt`
- `earlyAccessPublicAt`

Default publishing behavior for game posts:

- Early Access enabled by default
- VIP 12 window: 24 hours
- VIP 8 window: 48 hours
- Public release after 72 hours total

## Admin Experience

Post creation/editing now exposes:

- `Enable Early Access` switch, default ON
- `VIP 12` duration override
- `VIP 8` duration override

Behavior:

- New draft/pending posts store the configuration but do not start the timer yet.
- The timer starts on first publish.
- If a published post already started Early Access, later edits preserve the original start time unless Early Access is disabled.
- Disabling Early Access makes the post public immediately.

## Viewer Rules

### Non-eligible users during active Early Access

Visible:

- Screenshots
- Synopsis
- Current VIP requirement
- Countdown to phase change
- Countdown to public release

Server-redacted:

- Real title
- Tags
- Download links
- Premium links
- Changelog

UI-hidden during active Early Access:

- Comments
- Ratings/reviews
- Creator support / external creator links

### Eligible VIP users during active Early Access

They can access the full post payload needed to download immediately, but public-facing social/external surfaces remain suppressed until public release.

## Security Model

### Prevented realistically

- Browser timer bypass:
  Server state is timestamp-driven. Client countdowns are display-only.

- Inspect-element leaks:
  Restricted fields are removed from the server payload before reaching the client.

- Search/homepage leakage:
  Public catalog queries exclude active Early Access posts.

- Related-content leakage:
  Recommendation queries exclude active Early Access posts from public surfaces.

- Comment/review leakage:
  Comments and ratings are blocked server-side while Early Access is active.

- Timezone manipulation:
  All gating is computed from server-side timestamps, not local timezone.

- Race conditions at expiry:
  Access checks are resolved per request from the current server time, so both sides of the transition use the same source of truth.

### Minimized, but not perfectly preventable

- Shared direct download URLs:
  If the platform stores static third-party or long-lived links, a VIP user can still share them manually.

- VIP user screenshots / reposts:
  Any human with legitimate access can exfiltrate content socially.

- Multi-device/session usage:
  A real VIP user can use multiple devices unless additional anti-sharing controls are introduced.

## Recommended Hardening Beyond This Patch

These are the next practical steps if the platform wants stronger protection:

1. Replace raw download links with a signed download gateway.
2. Issue short-lived, one-time or low-TTL access tokens per file request.
3. Add per-user download event logging and anomaly detection.
4. Mark restricted responses `Cache-Control: private, no-store`.
5. Add CDN rules so restricted HTML/API responses are never edge-cached publicly.
6. Introduce watermarking or per-user tokenized outbound URLs for the highest-value drops.

## Edge Cases

### VIP expires mid-download

The page may stop granting new downloads immediately after expiry, but an already-started transfer cannot always be revoked if the underlying storage URL stays valid. Signed short-lived download URLs are the real mitigation.

### User upgrades while already on the page

The post route now refetches on window focus, so coming back from profile/auth refreshes eligibility without a hard reload.

### Countdown reaches zero while user is active

The post view schedules a refetch when the current phase boundary is reached. The VIP feed also refreshes periodically.

### Post edited during Early Access

Content changes are allowed. The schedule keeps its original start time unless Early Access is explicitly disabled.

### Post disabled or deleted

Normal document status rules win. A deleted or unpublished post disappears regardless of Early Access state.

### Large rollout with thousands of posts

The lifecycle is query-friendly because phase end timestamps are stored explicitly and indexed, rather than recomputed in every catalog query from arbitrary interval math.

## Trust Principles

- Never let the main catalog feel broken or paywalled.
- Make the value proposition about being early, not being chosen forever.
- Keep the UI honest: if something is hidden, it should be hidden on the server too.
- Avoid fake urgency by preserving the original release clock after publication.
