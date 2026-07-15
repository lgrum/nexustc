import { call } from "@orpc/server";

import type { Context } from "../context";
import profileAdminRouter from "./profile-admin";

const mocks = vi.hoisted(() => ({
  cache: {
    del: vi.fn(),
    getDel: vi.fn(),
    set: vi.fn(),
  },
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
  inArray: vi.fn(),
}));
vi.mock("@repo/db/schema/app", () => ({
  media: { objectKey: {} },
  profileEmblemAssignment: { userId: {} },
  profileEmblemDefinition: { id: {} },
  profileMediaAsset: { id: {}, objectKey: {} },
  profileRoleAssignment: { userId: {} },
  profileRoleDefinition: { id: {} },
  profileSystemConfig: { id: {} },
}));
vi.mock("@repo/db/utils", () => ({ generateId: () => "upload-1" }));
vi.mock("@repo/env", () => ({
  env: { R2_ASSETS_BUCKET_NAME: "assets" },
}));
vi.mock("../services/profile", () => ({
  PROFILE_MEDIA_MAX_BYTES: 5_000_000,
  getObjectExtension: () => "webp",
  getOrCreateProfileSystemConfig: vi.fn(),
  inspectProfileMediaAsset: mocks.inspectProfileMediaAsset,
  validateProfileMediaUpload: mocks.validateProfileMediaUpload,
}));
vi.mock("../utils/deferred-media", () => ({
  optionalSingleDeferredMediaSelectionInputSchema: {
    default: vi.fn(() => ({ _output: undefined })),
  },
  withDeferredMediaSelection: vi.fn(),
}));
vi.mock("../utils/s3", () => ({
  getS3Client: () => ({ send: mocks.s3Send }),
}));

const input = {
  contentLength: 321,
  contentType: "image/webp" as const,
  objectKey: "profiles/role-icon/owner-1/upload-1.webp",
  slot: "role-icon" as const,
};
const intent = { ...input, issuedToUserId: "owner-1" };

function createContext() {
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          {
            id: "asset-1",
            objectKey: input.objectKey,
          },
        ]),
      })),
    })),
  };

  return {
    db,
    headers: new Headers(),
    session: { user: { id: "owner-1", role: "owner" } },
  } as unknown as Context;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cache.set.mockResolvedValue("OK");
  mocks.getSignedUrl.mockResolvedValue("https://uploads.test/object");
  mocks.inspectProfileMediaAsset.mockResolvedValue({
    durationMs: null,
    fileSizeBytes: input.contentLength,
    height: 64,
    isAnimated: false,
    width: 64,
  });
});

describe("admin profile upload intents", () => {
  it("binds the owner and signs a five-minute create-only policy", async () => {
    await call(
      profileAdminRouter.media.getUploadPolicy,
      {
        contentLength: input.contentLength,
        contentType: input.contentType,
        slot: input.slot,
      },
      { context: createContext() }
    );

    expect(mocks.cache.set).toHaveBeenCalledWith(
      `profile:media-upload-intent:${input.objectKey}`,
      expect.any(String),
      { EX: 300, NX: true }
    );
    const [, storedIntent] = mocks.cache.set.mock.calls[0]!;
    expect(JSON.parse(storedIntent)).toStrictEqual(intent);
    const [, command] = mocks.getSignedUrl.mock.calls[0]!;
    expect(command.input).toMatchObject({
      IfNoneMatch: "*",
      Key: input.objectKey,
    });
    expect(mocks.getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { expiresIn: 300 }
    );
  });

  it("removes only the unique intent when signing fails", async () => {
    mocks.getSignedUrl.mockRejectedValue(new Error("signing failed"));

    await expect(
      call(
        profileAdminRouter.media.getUploadPolicy,
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
  });

  it("accepts a matching owner intent once and rejects replay without cleanup", async () => {
    mocks.cache.getDel
      .mockResolvedValueOnce(JSON.stringify(intent))
      .mockResolvedValueOnce(null);

    await expect(
      call(profileAdminRouter.media.finalizeUpload, input, {
        context: createContext(),
      })
    ).resolves.toMatchObject({ id: "asset-1", objectKey: input.objectKey });
    await expect(
      call(profileAdminRouter.media.finalizeUpload, input, {
        context: createContext(),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mocks.inspectProfileMediaAsset).toHaveBeenCalledWith(
      input.objectKey,
      {
        contentLength: input.contentLength,
        contentType: input.contentType,
      }
    );
    expect(mocks.s3Send).not.toHaveBeenCalled();
  });

  it("deletes a mismatched owner's rejected object before inspection", async () => {
    mocks.cache.getDel.mockResolvedValue(
      JSON.stringify({ ...intent, issuedToUserId: "owner-2" })
    );

    await expect(
      call(profileAdminRouter.media.finalizeUpload, input, {
        context: createContext(),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.inspectProfileMediaAsset).not.toHaveBeenCalled();
    expect(mocks.s3Send).toHaveBeenCalledTimes(1);
  });
});
