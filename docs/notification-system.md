# Notification And News System

## 1. Full Database Schema

The implementation adds these tables in [notification.ts](/C:/Dev/nexustc/packages/db/src/schema/notification.ts):

- `notification`
  - Canonical feed item for in-app notifications.
  - Stores `id`, `type`, `target_content_id`, `title`, `description`, `published_at`, `expiration_at`, `archived_at`, `dedupe_key`, `collapse_key`, `metadata`, and optional image/source references.
- `notification_target`
  - Defines who can see a notification.
  - Supports `broadcast`, `content_followers`, and `user` audiences.
- `notification_read`
  - Per-user read state with `(user_id, notification_id)` primary key.
- `content_follower`
  - Follow graph for games and comics.
  - Indexed by `(user_id, created_at)` and `content_id` for fast fan-out-on-read lookups.
- `news_article`
  - Staff-authored content news linked to a specific game or comic.
  - Keeps article body separate from the feed item so the feed stays lightweight.
- `content_update`
  - Immutable update audit log for automatic version/page notifications.
  - Holds dedupe keys and source facts such as old/new version or page counts.

## 2. Notification Event Architecture

The service layer in [notification.ts](/C:/Dev/nexustc/packages/api/src/services/notification.ts) treats notification creation as server-side event materialization:

- `deriveContentUpdateEvent`
  - Converts content mutations into strongly typed update candidates.
- `createOrCollapseContentUpdateNotification`
  - Materializes automatic update events into feed records.
  - Collapses rapid repeated updates inside a cooldown window to prevent flooding.
- `publishContentNewsArticle`
  - Publishes manual staff news and archives the older live article notification for the same content.
- `createGlobalAnnouncement`
  - Publishes platform-wide announcement records.
- `createUserNotification`
  - Small extensibility hook for future direct-user events like auctions, trades, card rewards, and marketplace sales.

This architecture keeps client code passive: clients read notifications, but only trusted backend code can generate them.

## 3. Follower System Design

Followers are stored in `content_follower` and exposed through [notification/index.ts](/C:/Dev/nexustc/packages/api/src/routers/notification/index.ts):

- `followContent`
- `unfollowContent`
- `getFollowState`
- `getFollowing`

`getFollowing` returns both:

- the user’s followed games/comics
- the latest notification feed items that came from `content_followers` targeting

That gives the profile “Following” section a single backend source of truth.

## 4. Update Detection Logic

Automatic update detection is wired into the shared edit flow in [content-handlers.ts](/C:/Dev/nexustc/packages/api/src/utils/content-handlers.ts):

- Games:
  - notify only when a published post’s `version` changes
  - do not notify for title/body/link edits without a version bump
- Comics:
  - notify only when published comics gain additional media pages
  - notification includes the number of pages added
- Draft-to-publish transitions:
  - do not emit automatic “update” notifications
  - this avoids false positives on first publication

The pure rules are covered by tests in [notification.test.ts](/C:/Dev/nexustc/packages/api/src/services/notification.test.ts).

## 5. Notification Generation Logic

Generation follows these rules:

- Global announcements create one `notification` plus one `notification_target` with `broadcast`.
- Followed-content automatic updates create one `notification`, one `notification_target` with `content_followers`, and one `content_update` record.
- Manual content news creates one `news_article`, one `notification`, and one `notification_target` with `content_followers`.
- When a new manual article is published for the same content, previously published article records are archived and their live notification is archived too.

## 6. Scalable Distribution Strategy

The implementation uses fan-out-on-read for in-app delivery:

- store one notification record, not one row per follower
- resolve visibility through `notification_target` plus `content_follower`
- keep per-user state only in `notification_read`

This is a better fit for:

- large follower counts
- high-content skew
- future push/email workers that can subscribe to the same event stream later

Current scale protections:

- indexed follower lookup
- dedupe keys for idempotency
- cooldown collapse for rapid repeated updates
- expiration and archive filters in feed queries

## 7. API Endpoints

Implemented oRPC endpoints:

- User/feed endpoints in [notification/index.ts](/C:/Dev/nexustc/packages/api/src/routers/notification/index.ts)
  - `notification.getFeed`
  - `notification.getUnreadCount`
  - `notification.markRead`
  - `notification.markAllRead`
  - `notification.followContent`
  - `notification.unfollowContent`
  - `notification.getFollowState`
  - `notification.getFollowing`
- Admin endpoints in [notification/admin.ts](/C:/Dev/nexustc/packages/api/src/routers/notification/admin.ts)
  - `notification.admin.createGlobalAnnouncement`
  - `notification.admin.updateGlobalAnnouncement`
  - `notification.admin.createNewsArticle`
  - `notification.admin.listGlobalAnnouncements`
  - `notification.admin.listNewsArticles`
  - `notification.admin.archive`

## 8. Security Protections

Security is enforced server-side:

- Only protected/admin procedures can mutate follow state or publish notifications.
- Automatic notifications are generated inside backend content-edit transactions.
- Clients cannot directly trigger arbitrary notification creation for content updates.
- Read-marking only applies to notifications the current user can actually access.
- Admin notification APIs use explicit `notifications` permissions from [permissions.ts](/C:/Dev/nexustc/packages/shared/src/permissions.ts).

## 9. Integration Architecture For Future Systems

Future systems can integrate by creating `notification` rows through the same service layer and audience model:

- direct-user events
  - trade requests
  - being outbid
  - marketplace sales
  - XP rewards
  - card pack openings
- content-scoped events
  - DLC announcements
  - creator posts
  - event drops for a specific game/comic
- broadcast events
  - maintenance windows
  - policy changes
  - seasonal platform campaigns

The main extension pattern is:

1. detect a trusted backend domain event
2. materialize one canonical `notification`
3. attach one or more `notification_target` rows
4. let the feed resolver handle visibility

That keeps the schema stable even as the platform grows into trading, auctions, cosmetics, cards, and richer social systems.
