# Keep Profile Media state correct while deletion retries

Postgres is authoritative for active Profile Media state. Replacement or removal commits there first; if deleting the obsolete R2 object fails, the object remains inaccessible as profile history and durable cleanup metadata is retained until deletion succeeds. This accepts brief physical retention during an R2 outage rather than restoring the old media or risking a broken active profile.
