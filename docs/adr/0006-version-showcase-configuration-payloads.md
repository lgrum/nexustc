# Version showcase configuration payloads

Each account may store one configuration row per code-registered Showcase type, with relational enabled, order, and variant fields plus a versioned JSONB payload validated and migrated by that type's Zod schema. This keeps core ordering and lifecycle data queryable while allowing future Showcase types to add configuration without repeatedly changing the central profile schema; type-specific services remain responsible for entitlement, visibility, and ownership validation on save and render.
