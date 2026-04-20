import type { RedisClientType } from "redis";

export const PROFILE_MEDIA_UPLOAD_COOLDOWN_SECONDS = 60 * 5;

export type ProfileMediaCooldownSlot = "avatar" | "banner";

export function getProfileMediaUploadCooldownKey(
  userId: string,
  slot: ProfileMediaCooldownSlot
) {
  return `profile:media-upload:${slot}:${userId}`;
}

export async function getProfileMediaUploadRetryAfter(
  cache: RedisClientType,
  key: string
) {
  const ttl = await cache.ttl(key);

  return ttl > 0 ? ttl : null;
}

export async function reserveProfileMediaUploadCooldown(
  cache: RedisClientType,
  key: string
) {
  const result = await cache.set(key, "1", {
    EX: PROFILE_MEDIA_UPLOAD_COOLDOWN_SECONDS,
    NX: true,
  });

  if (result === "OK") {
    return { reserved: true, retryAfter: 0 };
  }

  return {
    reserved: false,
    retryAfter:
      (await getProfileMediaUploadRetryAfter(cache, key)) ??
      PROFILE_MEDIA_UPLOAD_COOLDOWN_SECONDS,
  };
}
