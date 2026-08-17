INSERT INTO "profile_showcase_type" ("key", "is_active", "published_config_revision", "required_tier", "created_at", "updated_at")
VALUES
  ('card', true, 1, 'none', now(), now()),
  ('rare-card', true, 1, 'none', now(), now()),
  ('unopened-pack', true, 1, 'none', now(), now())
ON CONFLICT ("key") DO NOTHING;
