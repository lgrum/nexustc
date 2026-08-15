import { call } from "@orpc/server";

import type { Context } from "../context";
import profileRouter from "./profile";

const env = vi.hoisted(() => ({ PROFILE_CUSTOMIZATION_ENABLED: true }));
const mocks = vi.hoisted(() => ({
  ProfileMediaError: class ProfileMediaError extends Error {
    readonly code: string;
    readonly data?: { retryAfter?: number };

    constructor(code: string, data?: { retryAfter?: number }) {
      super(code);
      this.name = "ProfileMediaError";
      this.code = code;
      this.data = data;
    }
  },
  cache: {
    del: vi.fn(),
    getDel: vi.fn(),
    set: vi.fn(),
    ttl: vi.fn(),
  },
  buildProfileSummaries: vi.fn(),
  getOrCreateProfileSettings: vi.fn(),
  getProfileEntitlements: vi.fn(),
  finalizeProfileMediaUpload: vi.fn(),
  issueProfileMediaUpload: vi.fn(),
  removeUserProfileMedia: vi.fn(),
  resolveProfileVisibility: vi.fn(),
  loadProfileCustomizationEditorState: vi.fn(),
  purchaseProfileCatalogItem: vi.fn(),
  saveProfileCustomization: vi.fn(),
}));

vi.mock("@orpc/experimental-pino", () => ({ getLogger: () => {} }));
vi.mock("@repo/auth", () => ({
  auth: { api: { userHasPermission: vi.fn(() => ({ success: false })) } },
}));
vi.mock("@repo/env", () => ({ env }));
vi.mock("@repo/db", () => ({
  eq: vi.fn(),
  getRedis: vi.fn(() => Promise.resolve(mocks.cache)),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings,
    values,
  }),
}));
vi.mock("@repo/db/schema/app", () => ({
  profileMediaAsset: { id: {} },
  profileSettings: {
    replyNotificationsEnabled: {},
    userId: {},
    visibilityConfig: {},
  },
  user: { id: {} },
}));
vi.mock("../services/profile", () => ({
  buildProfileSummaries: mocks.buildProfileSummaries,
  getOrCreateProfileSettings: mocks.getOrCreateProfileSettings,
  getProfileEntitlements: mocks.getProfileEntitlements,
  getPublicProfile: vi.fn(),
  resolveProfileVisibility: mocks.resolveProfileVisibility,
}));
vi.mock("../services/profile-media", () => ({
  PROFILE_MEDIA_OWNER_SOURCE_MAX_BYTES: 40 * 1024 * 1024,
  ProfileMediaError: mocks.ProfileMediaError,
  finalizeProfileMediaUpload: mocks.finalizeProfileMediaUpload,
  issueProfileMediaUpload: mocks.issueProfileMediaUpload,
  removeUserProfileMedia: mocks.removeUserProfileMedia,
}));
vi.mock("../services/profile-media-storage", () => ({
  r2ProfileMediaStorage: { kind: "test-storage" },
}));
vi.mock("../services/profile-customization", () => ({
  ProfileCustomizationError: mocks.ProfileMediaError,
  loadProfileCustomizationEditorState:
    mocks.loadProfileCustomizationEditorState,
  saveProfileCustomization: mocks.saveProfileCustomization,
}));
vi.mock("../services/profile-catalog-purchase", () => ({
  ProfileCatalogPurchaseError: mocks.ProfileMediaError,
  purchaseProfileCatalogItem: mocks.purchaseProfileCatalogItem,
}));
const input = {
  contentLength: 123,
  contentType: "image/webp" as const,
  objectKey: "profiles/avatar/user-1/upload-1.webp",
  slot: "avatar" as const,
};
function createContext() {
  const db = {
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
    })),
  };

  return {
    db,
    headers: new Headers(),
    session: { user: { id: "user-1", role: "user" } },
  } as unknown as Context;
}

function createSettingsContext(visibilityConfig?: Record<string, unknown>) {
  const storedVisibilityConfig = visibilityConfig ?? {
    favorites: false,
    reserved: { futureFlag: true },
    reviews: false,
  };
  const returning = vi
    .fn()
    .mockResolvedValue([{ visibilityConfig: storedVisibilityConfig }]);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const context = {
    db: {
      query: {
        profileMediaAsset: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      update: vi.fn(() => ({ set })),
    },
    headers: new Headers(),
    session: {
      user: {
        avatarFallbackColor: "#f59e0b",
        id: "user-1",
        role: "user",
      },
    },
  } as unknown as Context;

  return { context, returning, set, where };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cache.set.mockResolvedValue("OK");
  mocks.buildProfileSummaries.mockResolvedValue([]);
  mocks.getOrCreateProfileSettings.mockResolvedValue({
    bannerAssetId: null,
    bannerColor: "#111827",
    bannerMode: "color",
    replyNotificationsEnabled: true,
    visibilityConfig: { reserved: {} },
  });
  mocks.getProfileEntitlements.mockResolvedValue({
    animatedAvatarRequiredTier: "level3",
    animatedBannerRequiredTier: "level8",
    canUseUploadedBanner: true,
    uploadedBannerRequiredTier: "level5",
  });
  mocks.resolveProfileVisibility.mockImplementation((value: unknown) => {
    const config =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : {};
    return {
      favorites:
        typeof config.favorites === "boolean" ? config.favorites : true,
      reserved:
        typeof config.reserved === "object" && config.reserved !== null
          ? config.reserved
          : {},
      reviews: typeof config.reviews === "boolean" ? config.reviews : true,
      streak: typeof config.streak === "boolean" ? config.streak : false,
    };
  });
});

describe("profile catalog purchase contracts", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
  });

  it("passes stable catalog expectations separately from profile save", async () => {
    mocks.purchaseProfileCatalogItem.mockResolvedValue({
      itemId: "item-grid",
      price: "75",
      revision: 3,
      transactionId: "transaction-1",
    });

    await expect(
      call(
        profileRouter.purchaseCatalogItem,
        {
          expectedPrice: "75",
          expectedRevision: 3,
          idempotencyKey: "purchase-profile-item-1",
          itemId: "item-grid",
        },
        { context: createContext() }
      )
    ).resolves.toMatchObject({ transactionId: "transaction-1" });
    expect(mocks.purchaseProfileCatalogItem).toHaveBeenCalledWith(
      expect.anything(),
      {
        expectedPrice: 75n,
        expectedRevision: 3,
        idempotencyKey: "purchase-profile-item-1",
        itemId: "item-grid",
        userId: "user-1",
      }
    );
    expect(mocks.saveProfileCustomization).not.toHaveBeenCalled();
  });

  it("blocks purchases while impersonating", async () => {
    const context = createContext();
    context.session!.session = { impersonatedBy: "owner-1" } as never;
    await expect(
      call(
        profileRouter.purchaseCatalogItem,
        {
          expectedPrice: "75",
          expectedRevision: 3,
          idempotencyKey: "purchase-profile-item-2",
          itemId: "item-grid",
        },
        { context }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.purchaseProfileCatalogItem).not.toHaveBeenCalled();
  });
});

describe("profile customization contracts", () => {
  it("rejects impersonated publication while preserving the complete draft", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.saveProfileCustomization.mockRejectedValueOnce(
      new mocks.ProfileMediaError("IMPERSONATION")
    );
    const draft = {
      layoutKey: "stack" as const,
      showcases: [
        {
          enabled: true,
          instanceId: "virtual:library",
          order: 0,
          payload: {},
          payloadSchemaVersion: 1,
          type: "library" as const,
          variant: "standard" as const,
        },
        {
          enabled: true,
          instanceId: "virtual:reviews",
          order: 1,
          payload: {},
          payloadSchemaVersion: 1,
          type: "reviews" as const,
          variant: "standard" as const,
        },
      ],
      skinKey: "default",
    };
    const context = {
      ...createContext(),
      session: {
        session: { impersonatedBy: "owner-1" },
        user: { id: "user-1", role: "user" },
      },
    } as unknown as Context;

    await expect(
      call(
        profileRouter.saveCustomization,
        { draft, expectedRevision: 0 },
        { context }
      )
    ).rejects.toThrow();
    expect(mocks.saveProfileCustomization).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ impersonated: true, userId: "user-1" })
    );
    vi.unstubAllEnvs();
  });
});

describe("profile visibility settings", () => {
  beforeEach(() => {
    env.PROFILE_CUSTOMIZATION_ENABLED = false;
  });

  afterEach(() => {
    env.PROFILE_CUSTOMIZATION_ENABLED = true;
  });

  it("returns public defaults for legacy settings rows", async () => {
    const { context } = createSettingsContext();

    await expect(
      call(profileRouter.getMySettings, undefined, { context })
    ).resolves.toMatchObject({
      settings: {
        visibility: {
          favorites: true,
          reserved: {},
          reviews: true,
          streak: false,
        },
      },
    });
  });

  it("updates only visibility while preserving omitted and reserved values", async () => {
    mocks.getOrCreateProfileSettings.mockResolvedValueOnce({
      visibilityConfig: {
        favorites: false,
        reserved: { futureFlag: true },
      },
    });
    const { context, returning, set } = createSettingsContext();

    await expect(
      call(profileRouter.updateVisibility, { reviews: false }, { context })
    ).resolves.toEqual({
      visibility: {
        favorites: false,
        reserved: { futureFlag: true },
        reviews: false,
        streak: false,
      },
    });
    expect(set).toHaveBeenCalledWith({
      visibilityConfig: expect.any(Object),
    });
    expect(returning).toHaveBeenCalledWith({ visibilityConfig: {} });
  });

  it("updates the authenticated account's explicit streak visibility", async () => {
    const { context } = createSettingsContext({
      favorites: true,
      reserved: {},
      reviews: true,
      streak: true,
    });

    await expect(
      call(profileRouter.updateVisibility, { streak: true }, { context })
    ).resolves.toMatchObject({ visibility: { streak: true } });
  });

  it("repairs a malformed root visibility value before updating it", async () => {
    const { context, set } = createSettingsContext({ streak: true });

    await call(profileRouter.updateVisibility, { streak: true }, { context });

    expect(set).toHaveBeenCalledWith({
      visibilityConfig: expect.objectContaining({
        values: expect.arrayContaining([
          expect.objectContaining({
            strings: expect.arrayContaining([
              expect.stringContaining("jsonb_typeof"),
            ]),
          }),
        ]),
      }),
    });
  });

  it("requires authentication before changing visibility", async () => {
    const { context } = createSettingsContext();
    const anonymousContext = {
      ...context,
      session: null,
    } as unknown as Context;

    await expect(
      call(
        profileRouter.updateVisibility,
        { favorites: false },
        { context: anonymousContext }
      )
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects visibility changes while impersonating an account", async () => {
    const { context, set } = createSettingsContext();
    context.session!.session = { impersonatedBy: "owner-1" } as never;

    await expect(
      call(profileRouter.updateVisibility, { favorites: false }, { context })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(set).not.toHaveBeenCalled();
  });

  it("rejects legacy visibility writes while customization owns visibility", async () => {
    env.PROFILE_CUSTOMIZATION_ENABLED = true;
    const { context, set } = createSettingsContext();

    await expect(
      call(profileRouter.updateVisibility, { favorites: false }, { context })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(set).not.toHaveBeenCalled();
  });
});

describe("profile notification settings", () => {
  it("enables comment reply notifications for existing users by default", async () => {
    const { context } = createSettingsContext();

    await expect(
      call(profileRouter.getMySettings, undefined, { context })
    ).resolves.toMatchObject({
      settings: {
        notifications: {
          commentReplies: true,
        },
      },
    });
  });

  it("updates the authenticated user's comment reply preference", async () => {
    const returning = vi
      .fn()
      .mockResolvedValue([{ replyNotificationsEnabled: false }]);
    const set = vi.fn(() => ({
      where: vi.fn(() => ({ returning })),
    }));
    const context = {
      db: {
        update: vi.fn(() => ({ set })),
      },
      headers: new Headers(),
      session: { user: { id: "user-1", role: "user" } },
    } as unknown as Context;

    await expect(
      call(
        profileRouter.updateNotificationPreferences,
        { commentReplies: false },
        { context }
      )
    ).resolves.toEqual({ commentReplies: false });
    expect(set).toHaveBeenCalledWith({ replyNotificationsEnabled: false });
  });
});

describe("profile media contracts", () => {
  it("preserves the upload policy response contract", async () => {
    mocks.issueProfileMediaUpload.mockResolvedValue({
      objectKey: "profiles/temp/avatar/user-1/upload-1.webp",
      presignedUrl: "https://uploads.test/object",
    });

    await expect(
      call(
        profileRouter.getUploadPolicy,
        {
          contentLength: input.contentLength,
          contentType: input.contentType,
          slot: input.slot,
        },
        { context: createContext() }
      )
    ).resolves.toEqual({
      objectKey: "profiles/temp/avatar/user-1/upload-1.webp",
      presignedUrl: "https://uploads.test/object",
    });
    expect(mocks.issueProfileMediaUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ id: "user-1" }),
        input: expect.objectContaining({ slot: "avatar" }),
      })
    );
  });

  it("translates stable lifecycle errors without relabeling infrastructure failures", async () => {
    mocks.finalizeProfileMediaUpload.mockRejectedValueOnce(
      new mocks.ProfileMediaError("INVALID_INTENT")
    );
    await expect(
      call(profileRouter.finalizeUpload, input, { context: createContext() })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    mocks.finalizeProfileMediaUpload.mockRejectedValueOnce(
      new Error("database unavailable")
    );
    await expect(
      call(profileRouter.finalizeUpload, input, { context: createContext() })
    ).rejects.toThrow("database unavailable");
  });

  it("preserves finalize and removal response bodies", async () => {
    mocks.finalizeProfileMediaUpload.mockResolvedValue({
      id: "asset-1",
      isAnimated: false,
      objectKey: "profiles/media/avatar/user-1/asset-1.webp",
    });

    await expect(
      call(profileRouter.finalizeUpload, input, { context: createContext() })
    ).resolves.toEqual({
      assetId: "asset-1",
      isAnimated: false,
      objectKey: "profiles/media/avatar/user-1/asset-1.webp",
    });
    await expect(
      call(profileRouter.removeAvatar, undefined, {
        context: createContext(),
      })
    ).resolves.toEqual({ success: true });
    expect(mocks.removeUserProfileMedia).toHaveBeenCalledWith(
      expect.objectContaining({ slot: "avatar" })
    );
  });

  it("retires the active banner when appearance switches to color", async () => {
    mocks.getOrCreateProfileSettings.mockResolvedValueOnce({
      bannerAssetId: "banner-1",
    });

    await expect(
      call(
        profileRouter.updateAppearance,
        {
          avatarFallbackColor: "#f59e0b",
          bannerColor: "#111827",
          bannerMode: "color",
        },
        { context: createContext() }
      )
    ).resolves.toEqual({ success: true });
    expect(mocks.removeUserProfileMedia).toHaveBeenCalledWith(
      expect.objectContaining({ slot: "banner" })
    );
  });
});
