SET lock_timeout = '5s';
SET statement_timeout = '5min';

UPDATE "patreon_webhook_request"
SET
  "headers" = jsonb_strip_nulls(jsonb_build_object(
    'content-length', "headers"->'content-length',
    'content-type', "headers"->'content-type',
    'user-agent', "headers"->'user-agent'
  )),
  "url" = split_part("url", '?', 1);
