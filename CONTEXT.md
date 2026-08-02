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
