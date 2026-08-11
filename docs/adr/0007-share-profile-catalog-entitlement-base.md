# Share one entitlement base across Profile Catalog item kinds

Profile Layouts, Profile Skins, and Profile Decorations share a stable Profile Catalog Item record for kind, lifecycle, VIP requirement, Eteris price, ordering, grants, and purchased ownership, while kind-specific versioned records hold layout renderer keys, skin tokens/assets, or decoration slot/effect data. This centralizes acquisition and entitlement invariants without weakening the typed validation needed by each visual kind.
