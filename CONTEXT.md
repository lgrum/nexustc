# NeXusTC Domain

The shared language for content, membership, and public profiles in NeXusTC.

## Language

**Profile Media**:
An image used to personalize public profiles: a user avatar or banner, or a staff-managed role or emblem visual. Once replaced or removed, it is permanently deleted and has no retained history.
_Avoid_: Profile upload, profile asset

**App Theme**:
A private, account-wide visual preference that changes the interface for the selecting user. It does not affect how that user's public profile appears to other users.
_Avoid_: Profile theme, public theme

**Profile Style**:
The public-facing combination of layout, colors, decorations, and effects that determines how an account's profile appears to visitors. It does not change the account owner's private interface or App Theme.
_Avoid_: Profile theme, public theme, account theme

**Profile Skin**:
The visual preset controlling a public profile's background, gradients, colors, borders, and card treatment. It is one component of a Profile Style and does not determine Profile Layout or equipped decorations.
_Avoid_: Profile theme, App Theme

**Profile Decoration**:
An independently equipped cosmetic effect assigned to one typed slot on a public profile. A profile may equip at most one decoration in each slot: Avatar Frame, Nameplate Effect, Profile Frame, or Ambient Effect.
_Avoid_: Profile Skin, unrestricted effect stack

**Purchased Profile Item**:
A Profile Skin, Profile Decoration, or Profile Layout permanently owned by an account after an Eteris purchase, subject only to an audited owner reversal of that purchase. It does not represent a real-money purchase or temporary VIP eligibility.
_Avoid_: Cash purchase, VIP rental

**Selected Profile Configuration**:
The account's saved Profile Layout, Profile Skin, Profile Decorations, and Showcase choices, including choices that are temporarily unavailable because VIP eligibility has expired.
_Avoid_: Effective profile, rendered profile

**Default Profile Configuration**:
The profile choices derived for an account that has never saved customization. They preserve existing visibility preferences without requiring per-account migration data.
_Avoid_: Backfilled configuration, saved customization

**Draft Profile Configuration**:
The profile owner's unsaved customization edits used only by the editor preview. It does not affect the public profile until that person explicitly saves the complete configuration.
_Avoid_: Selected Profile Configuration, autosaved profile

**Effective Profile Configuration**:
The public-profile configuration currently permitted to render. Ineligible required choices use platform defaults, while ineligible optional decorations and Showcases render as absent without erasing the Selected Profile Configuration.
_Avoid_: Saved profile, selected profile

**Profile Catalog**:
The curated collection of Profile Layouts, Profile Skins, and Profile Decorations available for selection or acquisition. The owner authors catalog content only within code-defined visual capabilities.
_Avoid_: Arbitrary style editor, user-authored CSS

**Profile Catalog Item**:
A stable Profile Catalog entry representing one Profile Layout, Profile Skin, or Profile Decoration across its published visual revisions. Lifecycle, eligibility, price, and ownership attach to the item rather than to an individual revision.
_Avoid_: Visual revision, Showcase type

**Archived Profile Item**:
A Profile Catalog item unavailable for new selection or acquisition while continuing to render for accounts that already had it selected and remain entitled to it.
_Avoid_: Globally disabled item, deleted item

**Globally Disabled Profile Item**:
A Profile Catalog item prevented from rendering for every account because of a security, legal, moderation, or severe quality issue. Saved selections and ownership remain intact pending an explicit administrative remedy.
_Avoid_: Archived item, refunded item

**Profile Item Entitlement**:
An account's eligibility to use a Profile Catalog item because it is free, the account meets a temporary VIP requirement, the account permanently purchased it with Eteris, the owner permanently granted it, or the account is the owner using the active published catalog. Admins and moderators satisfy VIP requirements but do not bypass Eteris-only ownership. A catalog item may allow multiple eligibility routes.
_Avoid_: Selected item, equipped item

**Showcase Entitlement**:
An account's eligibility to render a Showcase type or capacity under its owner-configured VIP requirement. The owner has maximum access, and admins and moderators satisfy VIP requirements. Every Showcase type may be gated, although all first-release types launch with no minimum tier.
_Avoid_: Profile Item Entitlement, enabled Showcase

**Showcase Configuration**:
The saved enabled state, order, Showcase Variant, schema version, and type-specific choices for one Showcase on one account. It does not contain the source domain's derived public content.
_Avoid_: Showcase content, ownership record

**Profile Shell**:
The fixed public-profile identity region containing the account's banner, avatar, username, non-user Administrative Role, current Patron Tier, Profile Roles and Emblems, and Account Level. Its presentation may follow the Profile Style, but its identity elements cannot be hidden or reordered.
_Avoid_: Showcase, profile module

**Public Patron Tier**:
The current active NeXusTC Patron Tier badge shown in the Profile Shell. Accounts with no active tier show no badge, and expired tier history, billing state, membership dates, and Patreon identity remain private.
_Avoid_: Patreon identity, membership history

**Showcase**:
A configurable content section beneath the Profile Shell. Every public-profile content section, including Library and Reviews, is represented by a Showcase; disabled, ineligible, or empty Showcases are completely absent for visitors rather than rendered as placeholders.
_Avoid_: Fixed profile section, widget

**Collectible Showcase**:
A Showcase that displays items an authoritative source domain currently confirms the account owns. Losing ownership removes an item from the Effective Profile Configuration without making the profile system authoritative for inventory or necessarily erasing a manual saved selection.
_Avoid_: Eligible-item catalog, unverified collection

**Card Showcase**:
A future Collectible Showcase containing cards the account owner manually selects from their owned collection.
_Avoid_: Rare Card Showcase

**Rare Card Showcase**:
A future Collectible Showcase automatically populated with the account's highest-ranked owned cards according to the selected rarity, edition, or exclusivity rule.
_Avoid_: Card Showcase, manually curated cards

**Unopened Pack Showcase**:
A future Collectible Showcase automatically populated with the account's highest-ranked currently unopened packs according to the selected rarity, edition, or pack-type rule.
_Avoid_: Pack inventory, manually curated packs

**XP Showcase**:
An optional Showcase exposing Account Level, Account XP earned within the current level, the next-level requirement, progress, and XP remaining. It does not expose lifetime Account XP.
_Avoid_: Lifetime XP ledger

**Streak Showcase**:
An optional Showcase exposing the current streak and milestone indicators derived only from that current value. It does not expose streak history, dates, best streak, protected days, or Streak Challenge state.
_Avoid_: Streak history, challenge progress

**Eteris Showcase**:
An optional Showcase exposing only the Eteris Wallet's exact current non-negative balance when the owner has made it public. It never exposes transaction history, debt, wallet status, or administrative metadata.
_Avoid_: Wallet history, economy inspection

**Library Showcase**:
A Showcase derived from the account's public bookmarks and capable of containing both games and comics.
_Avoid_: Favorite Games Showcase, Favorites Showcase

**Favorite Games Showcase**:
A Showcase containing a manually selected and ranked list of currently public games that represent the account owner's personal favorites; game ownership or bookmarking is not required. One selected game uses a featured presentation, while larger entitled capacities use a ranked-list presentation.
_Avoid_: Library Showcase, bookmarks

**Profile Layout**:
A curated, responsive template that determines the arrangement, widths, spacing, and responsive behavior of Showcases beneath the Profile Shell. Users select a template and order their Showcases rather than positioning content on a freeform canvas.
_Avoid_: Freeform layout, profile canvas

**Showcase Variant**:
A code-defined presentation size supported by a particular Showcase, such as compact, standard, or featured. Every Profile Layout accepts the supported variant and determines how and where it is arranged.
_Avoid_: Freeform resize, custom dimensions

**Default Theme**:
The dark App Theme available to every user and used when no eligible custom choice applies.
_Avoid_: Free theme, base theme

**Theme Entitlement**:
Eligibility to use the full App Theme catalog, granted by an active Patron membership at or above one minimum tier or by the admin or owner role. While that Patron threshold is unset, only admins and owners are eligible.
_Avoid_: Per-theme access, staff access

**Selected Theme**:
The App Theme saved to an account, retained even while its Theme Entitlement is inactive.

**Effective Theme**:
The App Theme currently rendered. It is the Selected Theme while entitlement permits it and the Default Theme otherwise.
_Avoid_: Active theme

**Theme Catalog**:
The curated, code-owned collection of App Themes available for account selection. It is not user-authored or managed through an administrative editor.
_Avoid_: Theme marketplace, custom theme builder

**Eteris**:
The indivisible, non-expiring, closed-loop virtual currency used within NeXusTC. It has no cash-out path or promised value outside the platform.
_Avoid_: Real money, cash balance

**Eteris Wallet**:
An account's auditable Eteris holdings. It begins at zero and its balance is private unless the account owner chooses to display it publicly.
_Avoid_: Bank account, public transaction history

**Account XP**:
Non-spendable lifetime progression earned through validated participation. It never decays and is reduced only when an invalid grant is reversed.
_Avoid_: Spendable points, seasonal XP

**Pending XP**:
Provisionally validated Account XP held by integrity checks before release. It does not affect Account Level or progression rewards while pending.
_Avoid_: Earned XP, spendable XP

**Account Level**:
A publicly visible long-term status derived from Account XP. Accounts begin at level 1, with level 1000 as an attainable prestige ceiling intended for roughly five years of highly active legitimate participation.
_Avoid_: Season level, purchasable level

**Verified Comic Reading**:
Server-validated forward reading progress through published comic pages. Each page is eligible for Account XP once per user, including pages added after an earlier completion.
_Avoid_: Page view, repeat reading reward

**Eligible Like**:
A unique endorsement from a verified account that was at least seven days old when the endorsement was created. Self-likes and likes from banned or coordinated accounts are excluded.
_Avoid_: Raw like, reaction count
