import { call } from "@orpc/server";
import type * as RepoDbModule from "@repo/db";
import { PROFILE_DEFAULT_SKIN_TOKENS } from "@repo/shared/profile-customization";

import type { Context } from "../context";
import profileCatalogAdminRouter from "./profile-catalog-admin";

const mocks = vi.hoisted(() => {
  class CatalogError extends Error {
    readonly code: string;
    override readonly name = "CatalogError";

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    CatalogError,
    correctPurchase: vi.fn(),
    grant: vi.fn(),
    revoke: vi.fn(),
  };
});

const decorationDraft = {
  catalogOrder: 0,
  description: "",
  effectKey: null,
  eterisPrice: null,
  fontKey: null,
  isFree: true,
  itemId: "item-1",
  mediaAssetId: null,
  name: "Decoration",
  reducedMotion: null,
  requiredTier: null,
  slot: "avatar-frame" as const,
};
const skinDraft = {
  backgroundAssetId: null,
  catalogOrder: 0,
  description: "",
  eterisPrice: null,
  isFree: true,
  itemId: "item-1",
  name: "Skin",
  requiredTier: null,
  tokens: PROFILE_DEFAULT_SKIN_TOKENS,
};

vi.mock("../services/profile-catalog-purchase-correction", () => ({
  correctProfileCatalogPurchase: mocks.correctPurchase,
  ProfileCatalogPurchaseCorrectionError: mocks.CatalogError,
}));

vi.mock("@repo/auth", () => ({ auth: { api: {} } }));
vi.mock("@repo/db", async (importOriginal) => ({
  ...(await importOriginal<typeof RepoDbModule>()),
  getRedis: vi.fn().mockResolvedValue({}),
}));

vi.mock("../services/profile-catalog-grant", () => ({
  grantProfileCatalogItem: mocks.grant,
  ProfileCatalogGrantError: mocks.CatalogError,
  revokeProfileCatalogGrant: mocks.revoke,
}));

function createContext(role: string, impersonatedBy?: string) {
  return {
    db: {},
    headers: new Headers(),
    session: {
      session: impersonatedBy ? { impersonatedBy } : {},
      user: { id: "owner-1", role },
    },
  } as unknown as Context;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.correctPurchase.mockResolvedValue({
    reversalTransactionId: "transaction-reversal-1",
  });
  mocks.grant.mockResolvedValue({ grantId: "grant-1" });
  mocks.revoke.mockResolvedValue({ grantId: "grant-1" });
});

it("allows only a non-impersonated owner to correct a purchase with a reason", async () => {
  const input = {
    purchaseTransactionId: "transaction-purchase-1",
    reason: "Compra duplicada confirmada",
  };
  await call(profileCatalogAdminRouter.purchases.correct, input, {
    context: createContext("owner"),
  });
  expect(mocks.correctPurchase).toHaveBeenCalledWith(expect.anything(), {
    ...input,
    actorUserId: "owner-1",
  });

  await expect(
    call(profileCatalogAdminRouter.purchases.correct, input, {
      context: createContext("admin"),
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    call(profileCatalogAdminRouter.purchases.correct, input, {
      context: createContext("owner", "real-owner"),
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    call(
      profileCatalogAdminRouter.purchases.correct,
      { ...input, reason: " " },
      { context: createContext("owner") }
    )
  ).rejects.toThrow("Input validation failed");
});

it("rejects impersonation across every privileged catalog mutation family", async () => {
  const context = createContext("owner", "real-owner");
  const attempts = [
    () =>
      call(
        profileCatalogAdminRouter.lifecycle.archive,
        { itemId: "item-1", reason: "Cambio confirmado" },
        { context }
      ),
    () =>
      call(
        profileCatalogAdminRouter.lifecycle.deleteDraft,
        { itemId: "item-1", reason: "Cambio confirmado" },
        { context }
      ),
    () =>
      call(
        profileCatalogAdminRouter.lifecycle.disable,
        { itemId: "item-1", reason: "Cambio confirmado" },
        { context }
      ),
    () =>
      call(
        profileCatalogAdminRouter.lifecycle.restore,
        { itemId: "item-1", reason: "Cambio confirmado" },
        { context }
      ),
    () =>
      call(
        profileCatalogAdminRouter.lifecycle.rollback,
        {
          itemId: "item-1",
          reason: "Cambio confirmado",
          revisionId: "revision-1",
        },
        { context }
      ),
    () =>
      call(
        profileCatalogAdminRouter.entitlements.publishLayoutRequirement,
        {
          expectedRevision: 1,
          key: "grid",
          reason: "Cambio confirmado",
          requiredTier: "none",
        },
        { context }
      ),
    () =>
      call(
        profileCatalogAdminRouter.entitlements.publishShowcaseRequirement,
        {
          expectedRevision: 1,
          key: "xp",
          reason: "Cambio confirmado",
          requiredTier: "none",
        },
        { context }
      ),
    () =>
      call(
        profileCatalogAdminRouter.decorations.publish,
        { itemId: "item-1" },
        { context }
      ),
    () =>
      call(
        profileCatalogAdminRouter.decorations.saveDraft,
        { draft: decorationDraft },
        { context }
      ),
    () =>
      call(
        profileCatalogAdminRouter.skins.publish,
        { itemId: "item-1" },
        { context }
      ),
    () =>
      call(
        profileCatalogAdminRouter.skins.saveDraft,
        { draft: skinDraft },
        { context }
      ),
  ];
  for (const attempt of attempts) {
    await expect(attempt()).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
});

it("allows only a non-impersonated owner to grant permanent access", async () => {
  const input = {
    itemId: "item-grid",
    reason: "Caso de soporte",
    sourceReference: "support-123",
    userId: "user-1",
  };
  await call(profileCatalogAdminRouter.grants.grant, input, {
    context: createContext("owner"),
  });
  expect(mocks.grant).toHaveBeenCalledWith(expect.anything(), {
    ...input,
    actorUserId: "owner-1",
  });

  for (const role of ["admin", "moderator", "user"]) {
    await expect(
      call(profileCatalogAdminRouter.grants.grant, input, {
        context: createContext(role),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
  await expect(
    call(profileCatalogAdminRouter.grants.grant, input, {
      context: createContext("owner", "real-owner"),
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("allows only a non-impersonated owner to revoke one grant with a reason", async () => {
  const input = { grantId: "grant-1", reason: "Corrección confirmada" };
  await call(profileCatalogAdminRouter.grants.revoke, input, {
    context: createContext("owner"),
  });
  expect(mocks.revoke).toHaveBeenCalledWith(expect.anything(), {
    ...input,
    actorUserId: "owner-1",
  });

  await expect(
    call(profileCatalogAdminRouter.grants.revoke, input, {
      context: createContext("admin"),
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    call(profileCatalogAdminRouter.grants.revoke, input, {
      context: createContext("owner", "real-owner"),
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    call(
      profileCatalogAdminRouter.grants.revoke,
      { ...input, reason: " " },
      { context: createContext("owner") }
    )
  ).rejects.toThrow("Input validation failed");
});
