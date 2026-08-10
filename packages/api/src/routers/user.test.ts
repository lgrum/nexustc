import { call } from "@orpc/server";

import type { Context } from "../context";

const mocks = vi.hoisted(() => ({
  attachComicCatalogProgress: vi.fn(),
  banUserAndReconcileRewards: vi.fn(),
  canReadPublicProfileActivity: vi.fn(),
  unbanUserAndReconcileRewards: vi.fn(),
}));

vi.mock("@orpc/experimental-pino", () => ({ getLogger: () => {} }));
vi.mock("@repo/auth", () => ({
  auth: {
    api: {
      userHasPermission: vi.fn().mockResolvedValue({ success: true }),
    },
  },
}));
vi.mock("../services/comic-progress", () => ({
  attachComicCatalogProgress: mocks.attachComicCatalogProgress,
}));
vi.mock("../services/profile", () => ({
  canReadPublicProfileActivity: mocks.canReadPublicProfileActivity,
}));
vi.mock("../services/user-administration", () => ({
  banUserAndReconcileRewards: mocks.banUserAndReconcileRewards,
  unbanUserAndReconcileRewards: mocks.unbanUserAndReconcileRewards,
  UserAdministrationError: class extends Error {},
}));

const { default: userRouter } = await import("./user");

function createContext() {
  const db = { select: vi.fn() };
  const context = {
    db,
    headers: new Headers(),
    session: null,
  } as unknown as Context;

  return { context, db };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public bookmark privacy", () => {
  it("returns no items and skips bookmark work when favorites are hidden", async () => {
    mocks.canReadPublicProfileActivity.mockResolvedValue(false);
    const { context, db } = createContext();

    await expect(
      call(
        userRouter.getUserBookmarks,
        { limit: 12, userId: "user-1" },
        { context }
      )
    ).resolves.toEqual({ items: [], nextCursor: null });

    expect(mocks.canReadPublicProfileActivity).toHaveBeenCalledWith(
      context.db,
      "user-1",
      "favorites"
    );
    expect(db.select).not.toHaveBeenCalled();
    expect(mocks.attachComicCatalogProgress).not.toHaveBeenCalled();
  });
});

describe("user administration", () => {
  it("delegates banning and reward reversal to one atomic service", async () => {
    const context = {
      db: {},
      headers: new Headers({ cookie: "session=test" }),
      session: { user: { id: "owner-1", role: "owner" } },
    } as unknown as Context;
    mocks.banUserAndReconcileRewards.mockResolvedValue([]);

    await expect(
      call(userRouter.admin.banUser, { userId: "liker-1" }, { context })
    ).resolves.toEqual({ success: true });

    expect(mocks.banUserAndReconcileRewards).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({
        actorUserId: "owner-1",
        userId: "liker-1",
      })
    );
  });

  it("delegates manual unbanning and reward restoration to one atomic service", async () => {
    const context = {
      db: {},
      headers: new Headers({ cookie: "session=test" }),
      session: { user: { id: "owner-1", role: "owner" } },
    } as unknown as Context;
    mocks.unbanUserAndReconcileRewards.mockResolvedValue([]);

    await expect(
      call(userRouter.admin.unbanUser, { userId: "liker-1" }, { context })
    ).resolves.toEqual({ success: true });

    expect(mocks.unbanUserAndReconcileRewards).toHaveBeenCalledWith(
      context.db,
      { userId: "liker-1" }
    );
  });
});
