import type { RedisClientType } from "redis";

import {
  getProfileMediaUploadCooldownKey,
  getProfileMediaUploadRetryAfter,
  PROFILE_MEDIA_UPLOAD_COOLDOWN_SECONDS,
  reserveProfileMediaUploadCooldown,
} from "./profile-media-cooldown";

function createMockCache() {
  return {
    set: vi.fn(),
    ttl: vi.fn(),
  } as unknown as RedisClientType & {
    set: ReturnType<typeof vi.fn>;
    ttl: ReturnType<typeof vi.fn>;
  };
}

describe(getProfileMediaUploadCooldownKey, () => {
  it("scopes cooldowns by media slot and user", () => {
    expect(getProfileMediaUploadCooldownKey("user_123", "avatar")).toBe(
      "profile:media-upload:avatar:user_123"
    );
    expect(getProfileMediaUploadCooldownKey("user_123", "banner")).toBe(
      "profile:media-upload:banner:user_123"
    );
  });
});

describe(getProfileMediaUploadRetryAfter, () => {
  it("returns the active ttl", async () => {
    const cache = createMockCache();
    cache.ttl.mockResolvedValue(180);

    await expect(
      getProfileMediaUploadRetryAfter(cache, "profile:media-upload:avatar:user")
    ).resolves.toBe(180);
  });

  it("returns null when the cooldown is not active", async () => {
    const cache = createMockCache();
    cache.ttl.mockResolvedValue(-2);

    await expect(
      getProfileMediaUploadRetryAfter(cache, "profile:media-upload:avatar:user")
    ).resolves.toBeNull();
  });
});

describe(reserveProfileMediaUploadCooldown, () => {
  it("reserves a fresh cooldown", async () => {
    const cache = createMockCache();
    cache.set.mockResolvedValue("OK");

    const result = await reserveProfileMediaUploadCooldown(
      cache,
      "profile:media-upload:avatar:user"
    );

    expect(result).toStrictEqual({ reserved: true, retryAfter: 0 });
    expect(cache.set).toHaveBeenCalledWith(
      "profile:media-upload:avatar:user",
      "1",
      { EX: PROFILE_MEDIA_UPLOAD_COOLDOWN_SECONDS, NX: true }
    );
  });

  it("returns the retry-after when a cooldown is already active", async () => {
    const cache = createMockCache();
    cache.set.mockResolvedValue(null);
    cache.ttl.mockResolvedValue(120);

    const result = await reserveProfileMediaUploadCooldown(
      cache,
      "profile:media-upload:avatar:user"
    );

    expect(result).toStrictEqual({ reserved: false, retryAfter: 120 });
  });

  it("falls back to the full cooldown when ttl is unavailable", async () => {
    const cache = createMockCache();
    cache.set.mockResolvedValue(null);
    cache.ttl.mockResolvedValue(-1);

    const result = await reserveProfileMediaUploadCooldown(
      cache,
      "profile:media-upload:avatar:user"
    );

    expect(result).toStrictEqual({
      reserved: false,
      retryAfter: PROFILE_MEDIA_UPLOAD_COOLDOWN_SECONDS,
    });
  });
});
