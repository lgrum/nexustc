import {
  profileMediaAsset,
  profileMediaDeletion,
  profileSettings,
  user,
} from "@repo/db/schema/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ProfileService from "./profile";
import {
  cleanupProfileMediaDeletions,
  changeManagedProfileMedia,
  finalizeProfileMediaUpload,
  issueProfileMediaUpload,
  removeUserProfileMedia,
} from "./profile-media";
import { InMemoryProfileMediaStorage } from "./profile-media-storage.test-support";

const mocks = vi.hoisted(() => ({
  generateId: vi.fn(() => "canonical-1"),
  getProfileEntitlements: vi.fn(),
  optimizeImageBuffer: vi.fn(),
  validateProfileMediaUpload: vi.fn(),
}));

vi.mock("@repo/db/utils", () => ({ generateId: mocks.generateId }));
vi.mock("../utils/images", () => ({
  optimizeImageBuffer: mocks.optimizeImageBuffer,
}));
vi.mock("./profile", async (importOriginal) => ({
  ...(await importOriginal<typeof ProfileService>()),
  getProfileEntitlements: mocks.getProfileEntitlements,
  validateProfileMediaUpload: mocks.validateProfileMediaUpload,
}));

function createCache(intent: Record<string, unknown> | null) {
  return {
    getDel: vi
      .fn()
      .mockResolvedValue(intent === null ? null : JSON.stringify(intent)),
  };
}

function createIssueCache() {
  return {
    del: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue("OK"),
    ttl: vi.fn().mockResolvedValue(300),
  };
}

function createCleanupDb(
  rows: { objectKey: string; retryCount: number }[] = []
) {
  return {
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
    query: {
      profileMediaDeletion: {
        findMany: vi.fn().mockResolvedValue(rows),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
    })),
  };
}

function createFinalizeDb(oldObjectKey: string) {
  const ledgerValues = vi.fn(() => ({
    onConflictDoNothing: vi.fn().mockResolvedValue(null),
  }));
  const assetValues = vi.fn(() => ({
    returning: vi.fn().mockResolvedValue([
      {
        id: "asset-new",
        isAnimated: false,
        objectKey: "profiles/media/avatar/user-1/canonical-1.webp",
      },
    ]),
  }));
  const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) }));
  const tx = {
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
    insert: vi.fn((table) => ({
      values: table === profileMediaAsset ? assetValues : ledgerValues,
    })),
    query: {
      profileMediaAsset: {
        findFirst: vi.fn().mockResolvedValue({ id: "asset-old" }),
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "asset-old", objectKey: oldObjectKey }]),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi.fn().mockResolvedValue([{ image: oldObjectKey }]),
        })),
      })),
    })),
    update: vi.fn((table) => {
      expect(table).toBe(user);
      return { set };
    }),
  };
  const db = {
    query: {
      profileMediaDeletion: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ objectKey: oldObjectKey, retryCount: 0 }]),
      },
    },
    transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        await callback(tx)
    ),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
    update: vi.fn(),
  };
  return { assetValues, db, ledgerValues, set, tx };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProfileEntitlements.mockResolvedValue({
    canUseAnimatedAvatar: true,
    canUseAnimatedBanner: true,
    canUseUploadedBanner: true,
    overrideSource: "none",
  });
  mocks.optimizeImageBuffer.mockResolvedValue({
    buffer: Buffer.from("canonical"),
    durationMs: null,
    extension: "webp",
    fileSizeBytes: 9,
    height: 512,
    isAnimated: false,
    mimeType: "image/webp",
    width: 512,
  });
});

describe("finalizeProfileMediaUpload", () => {
  it("consumes one intent, canonicalizes, activates, and retires the old avatar", async () => {
    const sourceKey = "profiles/temp/avatar/user-1/source.png";
    const oldObjectKey = "profiles/media/avatar/user-1/old.webp";
    const input = {
      contentLength: 6,
      contentType: "image/png",
      objectKey: sourceKey,
      slot: "avatar" as const,
    };
    const cache = createCache({
      ...input,
      issuedToUserId: "user-1",
    });
    const storage = new InMemoryProfileMediaStorage();
    storage.seed(sourceKey, Buffer.from("source"), "image/png");
    storage.seed(oldObjectKey, Buffer.from("old"), "image/webp");
    const { db, ledgerValues, set, tx } = createFinalizeDb(oldObjectKey);

    await expect(
      finalizeProfileMediaUpload({
        actor: { id: "user-1", role: "user" },
        cache: cache as never,
        db: db as never,
        input,
        storage,
      })
    ).resolves.toEqual({
      assetId: "asset-new",
      isAnimated: false,
      objectKey: "profiles/media/avatar/user-1/canonical-1.webp",
    });

    expect(cache.getDel).toHaveBeenCalledOnce();
    expect(set).toHaveBeenCalledWith({
      image: "profiles/media/avatar/user-1/canonical-1.webp",
    });
    expect(ledgerValues).toHaveBeenCalledWith([{ objectKey: oldObjectKey }]);
    expect(tx.delete).toHaveBeenCalledWith(profileMediaAsset);
    expect(storage.has(sourceKey)).toBeFalsy();
    expect(storage.has(oldObjectKey)).toBeFalsy();
  });

  it("rejects replay and source metadata mismatch before activation", async () => {
    const input = {
      contentLength: 7,
      contentType: "image/png",
      objectKey: "profiles/temp/avatar/user-1/source.png",
      slot: "avatar" as const,
    };
    const storage = new InMemoryProfileMediaStorage();

    await expect(
      finalizeProfileMediaUpload({
        actor: { id: "user-1" },
        cache: createCache(null) as never,
        db: {} as never,
        input,
        storage,
      })
    ).rejects.toMatchObject({ code: "INVALID_INTENT" });

    storage.seed(input.objectKey, Buffer.from("short"), "image/png");
    await expect(
      finalizeProfileMediaUpload({
        actor: { id: "user-1" },
        cache: createCache({ ...input, issuedToUserId: "user-1" }) as never,
        db: {} as never,
        input,
        storage,
      })
    ).rejects.toMatchObject({
      code: "SOURCE_METADATA_MISMATCH",
    });
    expect(storage.has(input.objectKey)).toBeFalsy();
  });

  it("rejects another actor's key before consuming its intent", async () => {
    const cache = createCache(null);
    const storage = new InMemoryProfileMediaStorage();
    const objectKey = "profiles/temp/avatar/user-2/source.png";
    storage.seed(objectKey, Buffer.from("source"), "image/png");

    await expect(
      finalizeProfileMediaUpload({
        actor: { id: "user-1" },
        cache: cache as never,
        db: {} as never,
        input: {
          contentLength: 6,
          contentType: "image/png",
          objectKey,
          slot: "avatar",
        },
        storage,
      })
    ).rejects.toMatchObject({ code: "INVALID_OBJECT_KEY" });
    expect(cache.getDel).not.toHaveBeenCalled();
    expect(storage.has(objectKey)).toBeTruthy();
  });
});

describe("issueProfileMediaUpload", () => {
  it("uses temporary keys and permits the bounded owner source allowance", async () => {
    const cache = createIssueCache();
    const storage = new InMemoryProfileMediaStorage();
    const input = {
      contentLength: 11 * 1024 * 1024,
      contentType: "image/gif",
      slot: "avatar" as const,
    };

    await expect(
      issueProfileMediaUpload({
        actor: { id: "user-1", role: "user" },
        cache: cache as never,
        db: createCleanupDb() as never,
        input,
        storage,
      })
    ).rejects.toMatchObject({ code: "SOURCE_TOO_LARGE" });

    await expect(
      issueProfileMediaUpload({
        actor: { id: "owner-1", role: "owner" },
        cache: cache as never,
        db: createCleanupDb() as never,
        input,
        storage,
      })
    ).resolves.toMatchObject({
      objectKey: "profiles/temp/avatar/owner-1/canonical-1.gif",
    });
    expect(cache.set).toHaveBeenCalledWith(
      "profile:media-upload-intent:profiles/temp/avatar/owner-1/canonical-1.gif",
      expect.any(String),
      { EX: 300, NX: true }
    );
  });
});

describe("cleanupProfileMediaDeletions", () => {
  it("advances a failure so it cannot starve the bounded fair batch", async () => {
    const storage = new InMemoryProfileMediaStorage();
    for (const key of ["old-a", "old-b", "old-c"]) {
      storage.seed(key, Buffer.from(key), "image/webp");
    }
    storage.failDeletionFor("old-a");
    const set = vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) }));
    const db = {
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
      query: {
        profileMediaDeletion: {
          findMany: vi.fn().mockResolvedValue([
            { objectKey: "old-a", retryCount: 0 },
            { objectKey: "old-b", retryCount: 0 },
          ]),
        },
      },
      update: vi.fn((table) => {
        expect(table).toBe(profileMediaDeletion);
        return { set };
      }),
    };

    await cleanupProfileMediaDeletions({
      db: db as never,
      now: new Date("2026-01-01T00:00:00Z"),
      storage,
    });

    expect(set).toHaveBeenCalledWith({
      retryAfter: new Date("2026-01-01T00:02:00Z"),
      retryCount: 1,
    });
    expect(storage.has("old-a")).toBeTruthy();
    expect(storage.has("old-b")).toBeFalsy();
    expect(storage.has("old-c")).toBeTruthy();
  });
});

describe("Profile Media reference changes", () => {
  it("removes a banner and records its object key in the same transaction", async () => {
    const objectKey = "profiles/media/banner/user-1/old.webp";
    const storage = new InMemoryProfileMediaStorage();
    storage.seed(objectKey, Buffer.from("old"), "image/webp");
    const settingsSet = vi.fn(() => ({
      where: vi.fn().mockResolvedValue(null),
    }));
    const userSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) }));
    const ledgerValues = vi.fn(() => ({
      onConflictDoNothing: vi.fn().mockResolvedValue(null),
    }));
    const tx = {
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
      insert: vi.fn((table) => ({
        values:
          table === profileSettings
            ? vi.fn(() => ({
                onConflictDoNothing: vi.fn().mockResolvedValue(null),
              }))
            : ledgerValues,
      })),
      query: {
        profileMediaAsset: {
          findMany: vi.fn().mockResolvedValue([{ id: "asset-old", objectKey }]),
        },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn().mockResolvedValue([{ bannerAssetId: "asset-old" }]),
          })),
        })),
      })),
      update: vi.fn((table) => ({
        set: table === profileSettings ? settingsSet : userSet,
      })),
    };
    const db = {
      ...createCleanupDb([{ objectKey, retryCount: 0 }]),
      transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          await callback(tx)
      ),
    };

    await removeUserProfileMedia({
      actor: { id: "user-1" },
      avatarFallbackColor: "#abcdef",
      bannerColor: "#123456",
      db: db as never,
      slot: "banner",
      storage,
    });

    expect(settingsSet).toHaveBeenCalledWith({
      bannerAssetId: null,
      bannerColor: "#123456",
      bannerMode: "color",
    });
    expect(userSet).toHaveBeenCalledWith({
      avatarFallbackColor: "#abcdef",
    });
    expect(ledgerValues).toHaveBeenCalledWith([{ objectKey }]);
    expect(storage.has(objectKey)).toBeFalsy();
  });

  it("retires only unreferenced assets after a managed reference change", async () => {
    const objectKey = "profiles/media/role-icon/owner-1/old.webp";
    const storage = new InMemoryProfileMediaStorage();
    storage.seed(objectKey, Buffer.from("old"), "image/webp");
    const ledgerValues = vi.fn(() => ({
      onConflictDoNothing: vi.fn().mockResolvedValue(null),
    }));
    const tx = {
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
      insert: vi.fn(() => ({ values: ledgerValues })),
      query: {
        profileEmblemDefinition: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        profileMediaAsset: {
          findMany: vi.fn().mockResolvedValue([{ id: "asset-old", objectKey }]),
        },
        profileRoleDefinition: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        profileSettings: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    };
    const db = {
      ...createCleanupDb([{ objectKey, retryCount: 0 }]),
      transaction: vi.fn(
        async (callback: (transaction: typeof tx) => Promise<unknown>) =>
          await callback(tx)
      ),
    };

    await expect(
      changeManagedProfileMedia({
        db: db as never,
        mutate: vi.fn().mockResolvedValue({
          retiredAssetIds: ["asset-old"],
          value: "updated",
        }),
        storage,
      })
    ).resolves.toBe("updated");
    expect(ledgerValues).toHaveBeenCalledWith([{ objectKey }]);
    expect(storage.has(objectKey)).toBeFalsy();
  });
});
