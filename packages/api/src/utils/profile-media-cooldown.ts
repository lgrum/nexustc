import type { RedisClientType } from "redis";
import z from "zod";

export const PROFILE_MEDIA_UPLOAD_COOLDOWN_SECONDS = 60 * 5;

export type ProfileMediaCooldownSlot = "avatar" | "banner";

const profileMediaUploadIntentSchema = z.object({
  contentLength: z.number().int().positive(),
  contentType: z.string().min(1),
  issuedToUserId: z.string().min(1),
  objectKey: z.string().min(1),
  slot: z.enum([
    "avatar",
    "banner",
    "role-icon",
    "role-overlay",
    "emblem-icon",
  ]),
});

export type ProfileMediaUploadIntent = z.infer<
  typeof profileMediaUploadIntentSchema
>;

export function getProfileMediaUploadCooldownKey(
  userId: string,
  slot: ProfileMediaCooldownSlot
) {
  return `profile:media-upload:${slot}:${userId}`;
}

export function getProfileMediaUploadIntentKey(objectKey: string) {
  return `profile:media-upload-intent:${objectKey}`;
}

export async function createProfileMediaUploadIntent(
  cache: RedisClientType,
  intent: ProfileMediaUploadIntent
) {
  return (
    (await cache.set(
      getProfileMediaUploadIntentKey(intent.objectKey),
      JSON.stringify(intent),
      { EX: PROFILE_MEDIA_UPLOAD_COOLDOWN_SECONDS, NX: true }
    )) === "OK"
  );
}

export async function consumeProfileMediaUploadIntent(
  cache: RedisClientType,
  objectKey: string
) {
  const value = await cache.getDel(getProfileMediaUploadIntentKey(objectKey));
  if (!value) {
    return null;
  }

  try {
    const result = profileMediaUploadIntentSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function deleteProfileMediaUploadIntent(
  cache: RedisClientType,
  objectKey: string
) {
  return cache.del(getProfileMediaUploadIntentKey(objectKey));
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
