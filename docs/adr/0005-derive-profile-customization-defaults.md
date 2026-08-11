# Derive profile customization defaults without account backfill

Accounts without saved customization use a virtual Default Profile Configuration derived from existing canonical visibility settings; reads do not create customization rows, and the first explicit save materializes the account's complete configuration. This preserves existing public-profile behavior while avoiding a bulk per-account backfill and its rollout, locking, and drift risks.
