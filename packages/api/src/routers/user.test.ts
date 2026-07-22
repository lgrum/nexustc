import { call } from "@orpc/server";

import type { Context } from "../context";

const mocks = vi.hoisted(() => ({
  attachComicCatalogProgress: vi.fn(),
  canReadPublicProfileActivity: vi.fn(),
}));

vi.mock("@orpc/experimental-pino", () => ({ getLogger: () => {} }));
vi.mock("@repo/auth", () => ({ auth: { api: {} } }));
vi.mock("../services/comic-progress", () => ({
  attachComicCatalogProgress: mocks.attachComicCatalogProgress,
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
        { limit: 12, offset: 0, userId: "user-1" },
        { context }
      )
    ).resolves.toEqual([]);

    expect(mocks.canReadPublicProfileActivity).toHaveBeenCalledWith(
      context.db,
      "user-1",
      "favorites"
    );
    expect(db.select).not.toHaveBeenCalled();
    expect(mocks.attachComicCatalogProgress).not.toHaveBeenCalled();
  });
});
