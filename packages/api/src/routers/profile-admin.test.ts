import { call } from "@orpc/server";

import type { Context } from "../context";
import profileAdminRouter from "./profile-admin";

const mocks = vi.hoisted(() => ({
  cache: {},
  finalizeProfileMediaUpload: vi.fn(),
  issueProfileMediaUpload: vi.fn(),
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
vi.mock("../services/profile", () => ({
  getOrCreateProfileSystemConfig: vi.fn(),
  inspectProfileMediaAsset: vi.fn(),
  validateProfileMediaUpload: vi.fn(),
}));
vi.mock("../services/profile-media", () => {
  class ProfileMediaError extends Error {
    readonly code: string;

    constructor(code: string) {
      super(code);
      this.name = "ProfileMediaError";
      this.code = code;
    }
  }

  return {
    PROFILE_MEDIA_OWNER_SOURCE_MAX_BYTES: 40 * 1024 * 1024,
    ProfileMediaError,
    changeManagedProfileMedia: vi.fn(),
    finalizeProfileMediaUpload: mocks.finalizeProfileMediaUpload,
    issueProfileMediaUpload: mocks.issueProfileMediaUpload,
  };
});
vi.mock("../services/profile-media-storage", () => ({
  r2ProfileMediaStorage: {},
}));
vi.mock("../utils/deferred-media", () => ({
  optionalSingleDeferredMediaSelectionInputSchema: {
    refine: vi.fn(() => ({
      default: vi.fn(() => ({ _output: undefined })),
    })),
  },
  withDeferredMediaSelection: vi.fn(),
}));

const input = {
  contentLength: 321,
  contentType: "image/webp" as const,
  objectKey: "profiles/temp/role-icon/owner-1/upload-1.webp",
  slot: "role-icon" as const,
};

function createContext(role = "owner") {
  return {
    db: {},
    headers: new Headers(),
    session: { user: { id: "owner-1", role } },
  } as unknown as Context;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.issueProfileMediaUpload.mockResolvedValue({
    objectKey: input.objectKey,
    presignedUrl: "https://uploads.test/object",
  });
  mocks.finalizeProfileMediaUpload.mockResolvedValue({
    id: "asset-1",
    objectKey: "profiles/media/role-icon/owner-1/asset-1.webp",
  });
});

describe("owner Profile Media contracts", () => {
  it("delegates the 40 MiB owner upload contract to Profile Media", async () => {
    const request = {
      contentLength: 40 * 1024 * 1024,
      contentType: input.contentType,
      slot: input.slot,
    };

    await expect(
      call(profileAdminRouter.media.getUploadPolicy, request, {
        context: createContext(),
      })
    ).resolves.toEqual({
      objectKey: input.objectKey,
      presignedUrl: "https://uploads.test/object",
    });
    expect(mocks.issueProfileMediaUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ id: "owner-1", role: "owner" }),
        input: request,
      })
    );
  });

  it("preserves the finalized owner asset response", async () => {
    await expect(
      call(profileAdminRouter.media.finalizeUpload, input, {
        context: createContext(),
      })
    ).resolves.toEqual({
      id: "asset-1",
      objectKey: "profiles/media/role-icon/owner-1/asset-1.webp",
    });
    expect(mocks.finalizeProfileMediaUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ id: "owner-1", role: "owner" }),
        input,
      })
    );
  });

  it("keeps admin users forbidden", async () => {
    await expect(
      call(
        profileAdminRouter.media.getUploadPolicy,
        {
          contentLength: input.contentLength,
          contentType: input.contentType,
          slot: input.slot,
        },
        { context: createContext("admin") }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.issueProfileMediaUpload).not.toHaveBeenCalled();
  });

  it("translates lifecycle errors and leaves infrastructure failures visible", async () => {
    const { ProfileMediaError } = await import("../services/profile-media");
    mocks.finalizeProfileMediaUpload.mockRejectedValueOnce(
      new ProfileMediaError("INVALID_OBJECT_KEY")
    );
    await expect(
      call(profileAdminRouter.media.finalizeUpload, input, {
        context: createContext(),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "Asset inválido." });

    mocks.finalizeProfileMediaUpload.mockRejectedValueOnce(
      new ProfileMediaError("OUTPUT_TOO_LARGE")
    );
    await expect(
      call(profileAdminRouter.media.finalizeUpload, input, {
        context: createContext(),
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "El archivo es demasiado grande.",
    });

    mocks.finalizeProfileMediaUpload.mockRejectedValueOnce(
      new Error("database unavailable")
    );
    await expect(
      call(profileAdminRouter.media.finalizeUpload, input, {
        context: createContext(),
      })
    ).rejects.toThrow("database unavailable");
  });
});
