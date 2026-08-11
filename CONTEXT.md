# NeXusTC Domain

The shared language for content, membership, and public profiles in NeXusTC.

## Language

**Profile Media**:
An image used to personalize public profiles: a user avatar or banner, or a staff-managed role or emblem visual. Once replaced or removed, it is permanently deleted and has no retained history.
_Avoid_: Profile upload, profile asset

**App Theme**:
A private, account-wide visual preference that changes the interface for the selecting user. It does not affect how that user's public profile appears to other users.
_Avoid_: Profile theme, public theme

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
