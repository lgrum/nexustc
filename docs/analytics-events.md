# Analytics Events

NeXusTC uses Umami for privacy-conscious analytics. Event names are emitted directly through `apps/web/src/lib/analytics.ts` without a project prefix because Umami scopes analytics by website/domain.

## Event Matrix

| Event                                | Fires when                               | Key data                                                                                               |
| ------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `login_started`                      | User switches to a login form            | `source`                                                                                               |
| `login_completed`                    | Email login succeeds                     | `method`, `source`                                                                                     |
| `login_failed`                       | Login validation or auth fails           | `reason`, `source`                                                                                     |
| `signup_started`                     | User switches to a signup form           | `source`                                                                                               |
| `signup_completed`                   | Email signup succeeds                    | `method`, `newsletterOptIn`, `source`                                                                  |
| `signup_failed`                      | Signup validation or auth fails          | `reason`, `source`                                                                                     |
| `password_reset_requested`           | Password reset email request completes   | `result`, `reason`                                                                                     |
| `password_reset_completed`           | Password reset submission completes      | `result`, `reason`                                                                                     |
| `logout_clicked`                     | User clicks profile logout               | `source`                                                                                               |
| `profile_tab_changed`                | Profile section tab changes              | `tab`                                                                                                  |
| `social_account_link_started`        | Social account linking starts            | `provider`                                                                                             |
| `social_account_unlinked`            | Social account unlink succeeds           | `provider`                                                                                             |
| `password_changed`                   | Password change completes or fails       | `result`, `reason`                                                                                     |
| `patreon_sync_completed`             | Patreon membership sync completes        | `result`, `reason`                                                                                     |
| `profile_appearance_saved`           | Profile appearance save succeeds         | `bannerMode`                                                                                           |
| `profile_media_uploaded`             | Avatar/banner upload succeeds            | `slot`, `contentType`                                                                                  |
| `profile_media_removed`              | Avatar/banner removal succeeds           | `slot`                                                                                                 |
| `search_performed`                   | Search filters/query change              | `type`, `queryLength`, `filterCount`                                                                   |
| `search_tab_changed`                 | Search type tab changes                  | `type`                                                                                                 |
| `random_content_selected`            | Random content button succeeds           | `contentType`, `source`                                                                                |
| `content_card_clicked`               | A catalog card is opened                 | `contentId`, `contentType`, `source`                                                                   |
| `followed_content_clicked`           | Followed content item is opened          | `contentId`, `contentType`                                                                             |
| `comment_submitted`                  | A comment/reply/prompt answer succeeds   | `postId`, `isReply`, `hasEngagementPrompt`, `contentLength`                                            |
| `engagement_prompt_shown`            | Engagement prompt rotates into view      | `promptId`, `promptSource`                                                                             |
| `engagement_prompt_answer_clicked`   | User clicks to answer a prompt           | `promptId`, `promptSource`                                                                             |
| `post_rating_started`                | Rating dialog opens                      | `postId`, `hasExistingRating`                                                                          |
| `post_rating_submitted`              | Rating create/update succeeds            | `postId`, `rating`, `reviewLength`, `hasExistingRating`                                                |
| `post_rating_deleted`                | Rating deletion succeeds                 | `postId`                                                                                               |
| `post_like_toggled`                  | Post like succeeds                       | `postId`, `liked`                                                                                      |
| `post_bookmark_toggled`              | Post bookmark succeeds                   | `postId`, `bookmarked`                                                                                 |
| `content_follow_toggled`             | Content follow/unfollow succeeds         | `contentId`, `following`                                                                               |
| `share_link_copied`                  | Share link copy succeeds                 | `contentId`, `contentType`, `source`                                                                   |
| `image_viewer_external_opened`       | Image viewer opens current image         | `imageIndex`, `imageCount`, `hasTitle`                                                                 |
| `comic_reader_opened`                | A comic reader mounts                    | `comicId`, `mode`, `pageCount`, `startPage`                                                            |
| `comic_reader_mode_changed`          | Reader mode changes                      | `comicId`, `fromMode`, `toMode`                                                                        |
| `comic_chapter_completed`            | Reader reaches the last page             | `comicId`, `mode`, `pageCount`                                                                         |
| `news_article_clicked`               | News listing article is opened           | `articleId`, `contentId`, `contentType`, `source`                                                      |
| `news_related_content_clicked`       | Article related content is opened        | `articleId`, `contentId`, `contentType`, `source`                                                      |
| `notification_center_opened`         | Notification center opens                | `unreadCount`                                                                                          |
| `notification_filter_changed`        | Notification feed filter changes         | `filter`                                                                                               |
| `notification_load_more_clicked`     | Notification feed loads another page     | `filter`                                                                                               |
| `notification_mark_all_read_clicked` | Mark-all-read action is clicked          | `unreadCount`                                                                                          |
| `notification_mark_read_clicked`     | Single notification is marked read       | `notificationId`, `source`                                                                             |
| `notification_open_clicked`          | Notification target is opened            | `notificationId`, `notificationType`, `contentType`                                                    |
| `vip_page_viewed`                    | VIP route renders                        | `earlyAccessItemCount`                                                                                 |
| `vip_content_clicked`                | VIP feed item is opened                  | `contentId`, `earlyAccessState`, `viewerCanAccess`                                                     |
| `membership_tier_selected`           | Membership tier checkout link is clicked | `tier`, `source`                                                                                       |
| `checkout_started`                   | External Patreon checkout opens          | `provider`, `tier`, `source`                                                                           |
| `age_verification_shown`             | Age gate is shown                        | `path`                                                                                                 |
| `age_verification_accepted`          | Age gate is accepted                     | `path`                                                                                                 |
| `adblock_dialog_shown`               | Adblock blocker appears                  | `path`                                                                                                 |
| `adblock_reload_clicked`             | User reloads from adblock dialog         | `path`                                                                                                 |
| `membership_cta_clicked`             | Membership CTA is clicked                | `source`                                                                                               |
| `url_shortener_opened`               | Admin URL shortener dialog opens         | `shortenerCount`                                                                                       |
| `url_shortener_completed`            | Admin URL shortener completes or fails   | `result`, `shortenerCount`                                                                             |
| `url_shortener_copy_clicked`         | Shortened URL copy succeeds              | `shortenerCount`                                                                                       |
| `markdown_link_generated`            | Admin markdown link copy succeeds        | `textLength`, `linkLength`                                                                             |
| `admin_announcement_published`       | Admin global announcement publishes      | `titleLength`, `descriptionLength`, `hasImage`, `hasExpiration`                                        |
| `admin_news_article_published`       | Admin news article publishes             | `contentId`, `titleLength`, `summaryLength`, `bodyLength`, `hasBanner`, `hasExpiration`, `isScheduled` |

## Privacy Rules

- Do not send email, username, display name, raw search query, comment body, or review body.
- Prefer internal content IDs, categorical states, counts, booleans, and source labels.
- Keep event data below Umami's property limits and avoid high-cardinality values unless they are intentional content IDs.

## Dashboard Setup

Recommended Umami analysis views:

- Funnel: visit -> `signup_started` -> `signup_completed`.
- Funnel: `/search` -> `content_card_clicked` -> rating/comment event.
- Funnel: `/memberships` -> `membership_tier_selected` -> `checkout_started`.
- Funnel: notification center open -> `notification_open_clicked` -> related content/card event.
- Funnel: news index -> `news_article_clicked` -> `news_related_content_clicked`.
- Goal: `comment_submitted`.
- Goal: `post_rating_submitted`.
- Goal: `comic_chapter_completed`.
- Goal: `profile_appearance_saved`.
- Goal: `share_link_copied`.
- Segment/breakdown: `search_performed.type`, `search_performed.filterCount`, and `search_performed.queryLength`.
- Segment/breakdown: membership `tier` and checkout `provider`.
- Segment/breakdown: notification `filter`, `notificationType`, and unread-count buckets.
- Segment/breakdown: editorial publishing events by `hasImage`/`hasBanner`, `isScheduled`, and `hasExpiration`.
