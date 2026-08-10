import { call } from "@orpc/server";

import type { Context } from "../context";

const mocks = vi.hoisted(() => ({
  attachComicCatalogProgress: vi.fn(),
  banUser: vi.fn(),
  canReadPublicProfileActivity: vi.fn(),
  reconcileBannedLikerRewards: vi.fn(),
}));

vi.mock("@orpc/experimental-pino", () => ({ getLogger: () => {} }));
vi.mock("@repo/auth", () => ({
  auth: {
    api: {
      banUser: mocks.banUser,
      userHasPermission: vi.fn().mockResolvedValue({ success: true }),
    },
  },
}));
vi.mock("../services/comic-progress", () => ({
  attachComicCatalogProgress: mocks.attachComicCatalogProgress,
}));
vi.mock("../services/contribution-rewards", () => ({
  reconcileBannedLikerRewards: mocks.reconcileBannedLikerRewards,
}));
vi.mock("../services/profile", () => ({
  canReadPublicProfileActivity: mocks.canReadPublicProfileActivity,
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
  it("reconciles contribution rewards after Better Auth bans a liker", async () => {
    const headers = new Headers({ cookie: "session=test" });
    const context = {
      db: {},
      headers,
      session: { user: { id: "owner-1", role: "owner" } },
    } as unknown as Context;
    mocks.banUser.mockResolvedValue({ user: { id: "liker-1" } });
    mocks.reconcileBannedLikerRewards.mockResolvedValue({ settlements: [] });

    await expect(
      call(userRouter.admin.banUser, { userId: "liker-1" }, { context })
    ).resolves.toEqual({ success: true });

    expect(mocks.banUser).toHaveBeenCalledWith({
      body: { userId: "liker-1" },
      headers,
    });
    expect(mocks.reconcileBannedLikerRewards).toHaveBeenCalledWith(
      context.db,
      expect.objectContaining({
        actorUserId: "owner-1",
        likerUserId: "liker-1",
      })
    );
  });
});
