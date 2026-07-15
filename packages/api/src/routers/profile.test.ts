import { call } from "@orpc/server";

import type { Context } from "../context";
import profileRouter from "./profile";

const mocks = vi.hoisted(() => ({
  cache: {
    del: vi.fn(),
    getDel: vi.fn(),
    set: vi.fn(),
    ttl: vi.fn(),
  },
  generateId: vi.fn(() => "upload-1"),
  getProfileEntitlements: vi.fn(),
  getSignedUrl: vi.fn(),
  inspectProfileMediaAsset: vi.fn(),
  s3Send: vi.fn(),
  validateProfileMediaUpload: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));
vi.mock("@orpc/experimental-pino", () => ({ getLogger: () => {} }));
vi.mock("@repo/auth", () => ({ auth: { api: {} } }));
vi.mock("@repo/db", () => ({
  eq: vi.fn(),
  getRedis: vi.fn(() => Promise.resolve(mocks.cache)),
}));
vi.mock("@repo/db/schema/app", () => ({
  profileMediaAsset: {},
  profileSettings: { userId: {} },
  user: { id: {} },
}));
vi.mock("@repo/db/utils", () => ({ generateId: mocks.generateId }));
vi.mock("@repo/env", () => ({
  env: { R2_ASSETS_BUCKET_NAME: "assets" },
}));
vi.mock("../services/profile", () => ({
  PROFILE_MEDIA_MAX_BYTES: 5_000_000,
  buildProfileSummaries: vi.fn(),
  getObjectExtension: () => "webp",
  getOrCreateProfileSettings: vi.fn(),
  getProfileEntitlements: mocks.getProfileEntitlements,
  getPublicProfile: vi.fn(),
  inspectProfileMediaAsset: mocks.inspectProfileMediaAsset,
  validateProfileMediaUpload: mocks.validateProfileMediaUpload,
}));
vi.mock("../utils/s3", () => ({
  getS3Client: () => ({ send: mocks.s3Send }),
}));

const input = {
  contentLength: 123,
  contentType: "image/webp" as const,
  objectKey: "profiles/avatar/user-1/upload-1.webp",
  slot: "avatar" as const,
};
const intent = {
  ...input,
  issuedToUserId: "user-1",
};

function createContext() {
  const returning = vi.fn().mockResolvedValue([
    {
      id: "asset-1",
      isAnimated: false,
      objectKey: input.objectKey,
    },
  ]);
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning })),
    })),
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cache.set.mockResolvedValue("OK");
  mocks.getProfileEntitlements.mockResolvedValue({
    canUseUploadedBanner: true,
  });
  mocks.getSignedUrl.mockResolvedValue("https://uploads.test/object");
  mocks.inspectProfileMediaAsset.mockResolvedValue({
    durationMs: null,
    fileSizeBytes: input.contentLength,
    height: 512,
    isAnimated: false,
    width: 512,
  });
});

describe("profile upload intents", () => {
  it("reserves cooldown and intent before signing a create-only policy", async () => {
    await call(
      profileRouter.getUploadPolicy,
      {
        contentLength: input.contentLength,
        contentType: input.contentType,
        slot: input.slot,
      },
      { context: createContext() }
    );

    expect(mocks.cache.set).toHaveBeenCalledTimes(2);
    expect(mocks.cache.set.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.getSignedUrl.mock.invocationCallOrder[0]!
    );
    const [, command] = mocks.getSignedUrl.mock.calls[0]!;
    expect(command.input).toMatchObject({
      ContentLength: input.contentLength,
      ContentType: input.contentType,
      IfNoneMatch: "*",
      Key: input.objectKey,
    });
    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 300 }
    );
  });

  it("removes only its intent when signing fails", async () => {
    mocks.getSignedUrl.mockRejectedValue(new Error("signing failed"));

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
    ).rejects.toThrow("signing failed");

    expect(mocks.cache.del).toHaveBeenCalledWith(
      `profile:media-upload-intent:${input.objectKey}`
    );
    expect(mocks.cache.del).not.toHaveBeenCalledWith(
      "profile:media-upload:avatar:user-1"
    );
  });

  it("rejects missing, replayed, or mismatched intents before inspection", async () => {
    mocks.cache.getDel
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        JSON.stringify({ ...intent, issuedToUserId: "other" })
      );

    await expect(
      call(profileRouter.finalizeUpload, input, { context: createContext() })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      call(profileRouter.finalizeUpload, input, { context: createContext() })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mocks.inspectProfileMediaAsset).not.toHaveBeenCalled();
    expect(mocks.s3Send).toHaveBeenCalledTimes(1);
    expect(mocks.cache.del).not.toHaveBeenCalled();
  });

  it("deletes rejected metadata but accepts one matching intent without clearing cooldown", async () => {
    mocks.cache.getDel.mockResolvedValue(JSON.stringify(intent));
    mocks.inspectProfileMediaAsset.mockRejectedValueOnce(
      new Error("UPLOAD_METADATA_MISMATCH")
    );

    await expect(
      call(profileRouter.finalizeUpload, input, { context: createContext() })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.s3Send).toHaveBeenCalledTimes(1);
    expect(mocks.cache.del).not.toHaveBeenCalled();

    mocks.inspectProfileMediaAsset.mockResolvedValue({
      durationMs: null,
      fileSizeBytes: input.contentLength,
      height: 512,
      isAnimated: false,
      width: 512,
    });
    await expect(
      call(profileRouter.finalizeUpload, input, { context: createContext() })
    ).resolves.toMatchObject({
      assetId: "asset-1",
      objectKey: input.objectKey,
    });
    expect(mocks.inspectProfileMediaAsset).toHaveBeenLastCalledWith(
      input.objectKey,
      {
        contentLength: input.contentLength,
        contentType: input.contentType,
      }
    );
    expect(mocks.cache.del).not.toHaveBeenCalled();
  });
});
