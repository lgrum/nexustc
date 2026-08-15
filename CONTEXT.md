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

**Card Template**:
An official collectible treatment of one Card Character within one Card Series, with a code-defined rarity, optional edition label, optional Lifetime Supply Ceiling, and code-defined visual effects. After its first mint, its identity and economic attributes are frozen while permitted presentation corrections retroactively change all of its instances.
_Avoid_: Owned card, card inventory row

**Card Character**:
The unique administrator-curated identity for one normalized character name and free-text game name, reusable across any number of Card Templates.
_Avoid_: Card Template, canonical game record

**Card Series**:
A themed collectible release that groups Card Templates.
_Avoid_: Card rarity, edition label

**Card Instance**:
A durable owned copy minted from one Card Template, with a permanent Mint Number and no independent collectible identity or presentation. It may change owner but is never merged, upgraded, crafted, consumed, or reminted after removal.
_Avoid_: Card Template, inventory row

**Mint Number**:
The permanent, publicly displayed sequence number assigned to a Card Instance within its Card Template. Unlimited cards display the sequence alone, such as `#42`, while limited cards include the template ceiling, such as `#42/100`.
_Avoid_: Ownership sequence, inventory position

**Account-Bound Collectible**:
A Card Instance or Unopened Pack visibly designated as non-transferable when acquired. An Account-Bound Pack contains Account-Bound cards, a transferable Pack contains transferable cards, and binding never changes retroactively.
_Avoid_: Reserved collectible, frozen collectible

**Pack Template**:
The stable identity and presentation of a pack across its Pack Revisions. It is not an owned pack or a probability configuration.
_Avoid_: Pack Instance, unopened pack

**Pack Revision**:
An immutable published version of a Pack Template's card pool, outcome rules, guarantees, and card count. Previously issued Pack Instances remain bound to their original revision, while every future acquisition of that Pack Template uses its latest published revision.
_Avoid_: Pack Template, mutable odds table

**Pack Draw Group**:
One repeated outcome rule within a Pack Revision, defining its draw count, rarity weights, eligible Card Templates, optional per-template weights, duplicate policy, and Pack Guarantee. A Pack Revision may combine multiple Pack Draw Groups.
_Avoid_: Gachapon modifier, post-draw upgrade

**Pack Instance**:
A uniquely owned pack bound to one Pack Revision whose hidden Card Instances are minted into its custody when it is issued. It may be transferred while unopened; opening it is irreversible and retains it only as an auditable record.
_Avoid_: Pack Template, card bundle

**Opened Pack**:
The private historical record of an irreversibly opened Pack Instance, including its revision, committed results, source, and opening time. It is not an active inventory item or Showcase collectible.
_Avoid_: Unopened Pack, empty collectible

**Unopened Pack**:
A Pack Instance that has not yet revealed its committed card outcome. Its owner determines whether it may appear through the profile Showcase system.
_Avoid_: Pack Template, card bundle

**Lifetime Supply Ceiling**:
The maximum number of Card Instances that may ever be minted from one Card Template, including instances hidden inside Unopened Packs. Removal of an instance never restores minting capacity; the ceiling appears in limited-card Mint Numbers but no separate aggregate minted-supply counter is public.
_Avoid_: Active supply, replenishing stock

**Pack Guarantee**:
An advertised minimum outcome enforced for one pack opening, such as at least one card of a stated rarity. It is not a pity counter and does not improve future outcomes after an unfavorable opening.
_Avoid_: Bad-luck protection, pity system

**Collectible Custody**:
The exclusive reservation of an owned Card Instance or Unopened Pack by one published Black Market Listing or sent Trade Offer. Custody prevents every competing transfer or opening without changing ownership.
_Avoid_: Ownership transfer, inventory copy

**Trade Offer**:
An immutable proposal to exchange exact Card Instances or Unopened Packs between two accounts. Its proposer confirms it when sent, and accepting that exact offer settles it immediately.
_Avoid_: Black Market Listing, template-level request

**Gift Offer**:
An immutable proposal to transfer exact Card Instances or Unopened Packs without compensation. Ownership changes only after the recipient accepts the explicitly irreversible gift.
_Avoid_: Zero-price Black Market Listing, one-sided Trade Offer

**Black Market**:
The official, platform-operated player marketplace for fixed-price Eteris sales of Card Instances and Unopened Packs. Its playful name does not imply an external, unregulated, or cash market.
_Avoid_: Cash market, auction house

**Black Market Listing**:
A fixed-price offer to transfer one or more exact Card Instances or Unopened Packs for Eteris. Listed collectibles remain owned by the seller under Collectible Custody until sale, cancellation, or expiration.
_Avoid_: Trade Offer, auction, buy order

**Listing Fee**:
A non-refundable Eteris charge paid when a Black Market Listing is published, equal to 5% of its asking price rounded upward to at least one Eteris. It discourages low-intent and spam listings and is the listing's only marketplace charge, except when the platform cancels a compliant listing through no fault of the seller.
_Avoid_: Sale commission, refundable deposit

**Globally Disabled Card Template**:
A Card Template blocked from rendering, minting, listing, and trade because of a legal, security, moderation, or severe quality issue. Existing instances and committed pack outcomes remain preserved behind a safe placeholder pending an owner-directed remedy.
_Avoid_: Retired card, deleted card

**Retired Card Template**:
A published Card Template deliberately removed from future minting before or after its supply is exhausted. Existing instances and previously committed pack outcomes remain unchanged and transferable.
_Avoid_: Globally Disabled Card Template, deleted card

**Retired Pack Template**:
A Pack Template unavailable for every future acquisition channel. Existing Pack Instances remain openable and transferable unless their Pack Revision is disabled.
_Avoid_: Disabled Pack Revision, deleted pack

**Disabled Pack Revision**:
A Pack Revision blocked from new issuance and from opening or transferring its existing Unopened Packs because of a confirmed or suspected defect. Ownership and committed outcomes remain preserved pending an audited owner remedy.
_Avoid_: Retired Pack Revision, rerolled pack

**Official Shop Offer**:
The current Eteris price, remaining-sales quota, availability, and per-account limits through which the platform sells a Pack Template. It always issues from that template's latest published Pack Revision.
_Avoid_: Pack Revision, Black Market Listing

**Gachapon Machine**:
An Eteris-priced acquisition source that selects exactly one Pack Template from a weighted pool and issues its latest published Pack Revision. It may have availability windows, global and per-account activation limits, and operational enabled or exhausted states.
_Avoid_: Pack Template, direct-card dispenser

**Public Collection**:
The searchable and filterable view of an account's currently owned cards and Unopened Packs, exposed only when that account enables collection visibility. It is independent of the account's individually configured Showcases.
_Avoid_: Private inventory, Card Showcase

**Rendered Card**:
The platform-controlled composition of a Card Template's source artwork, frame, labels, rarity treatment, visual effects, and domain watermark. Permitted template corrections update every instance's rendered presentation.
_Avoid_: Source artwork, user-authored card image

**Collectible Grant Campaign**:
An approved, bounded rule for granting a specified Card Template or Pack Template, including its quantity ceiling, Account-Bound policy, availability, and reason. It is the ordinary administrative path for promotional and reward grants.
_Avoid_: Unbounded manual mint, corrective grant

**Collectible Acquisition Source**:
The private provenance of a Card Instance or Pack Instance, identifying the shop, gachapon, pack opening, promotion, trade, gift, Black Market transaction, or correction through which its owner received it.
_Avoid_: Public ownership history, current owner

**Collectibles Gate**:
The single global operational switch that permits collectible mutations. Disabling it preserves inventory and profile reads while stopping issuance, opening, acquisition, listing, settlement, trade, gift, and administrative publication.
_Avoid_: Content deletion, per-subsystem gate

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

**Streak Reading**:
A server-validated comic page checkpoint used toward a Streak Day. The same page may contribute once on a later Streak Day without becoming eligible for repeat Account XP.
_Avoid_: Page view, repeat reading XP

**Streak Contribution**:
A newly published comment or review that satisfies the Account XP content rules when created. Ordinary later edits or deletion do not change its completed Streak Day.
_Avoid_: Edited contribution, draft

**Eligible Like**:
A unique endorsement from a verified account that was at least seven days old when the endorsement was created. Self-likes and likes from banned or coordinated accounts are excluded.
_Avoid_: Raw like, reaction count

**Streak Day**:
A calendar day in an account's Streak Timezone for which it satisfies an approved pattern of validated content participation.
_Avoid_: Login day, active day

**Streak Timezone**:
The account-selected IANA timezone that determines its Streak Day boundaries.
_Avoid_: Browser timezone, UTC day

**Timezone Transition**:
The controlled switch between Streak Timezones. A partial destination day neither qualifies for rewards nor breaks streak continuity.
_Avoid_: Timezone reset, free Streak Day

**Discovery Action**:
A qualifying new bookmark, follow, or rating of one content item. Once consumed by Mixed Discovery, removing and recreating the relationship does not restore its eligibility.
_Avoid_: Click, toggle

**Mixed Discovery**:
A Streak Day path combining Streak Reading with two Discovery Actions on distinct content items.
_Avoid_: Activity score, browsing time

**Streak Break**:
The reset of an account's current streak after an incomplete Streak Day. It does not revoke prior rewards or the account's best streak.
_Avoid_: XP reversal, streak deletion

**Streak Challenge**:
An account's one-time commitment to reach a selected current-streak target. A Streak Break resets its progress but does not replace or cancel the selected target.
_Avoid_: Recurring quest, daily goal

**Streak Reward**:
Bounded Account XP awarded automatically for completing a Streak Day or Streak Challenge.
_Avoid_: Claimable reward, compounding reward

**Streak Visibility**:
A private-by-default account preference that may expose only the current streak on the public profile.
_Avoid_: Public streak history, public challenge progress

**Invalidated Streak Day**:
A formerly qualifying Streak Day removed after human-confirmed integrity abuse. Its linked rewards and derived streak records are corrected.
_Avoid_: Missed day, automatic penalty

**Step-Up Verification**:
An adaptive Turnstile check required before otherwise qualifying evidence with medium automation risk may complete a Streak Day. It does not block the underlying content action.
_Avoid_: Streak Challenge, blanket CAPTCHA

**Protected Streak Day**:
A Streak Day covered by an owner-declared platform outage or deliberate global streak pause. It preserves continuity without increasing the streak or granting rewards.
_Avoid_: Completed day, free Streak Day

**Streak-Eligible Account**:
An authenticated, email-verified, non-banned account acting outside staff impersonation.
_Avoid_: Anonymous visitor, impersonated account
