import { call } from "@orpc/server";
import type * as DbExports from "@repo/db";

import type { Context } from "../context";
import type * as RedisOperationExports from "../utils/redis-operations";

const mocks = vi.hoisted(() => ({
  applyStreakEvidenceInTransaction: vi.fn(),
  attachComicCatalogProgress: vi.fn(),
  banUserAndReconcileRewards: vi.fn(),
  canReadPublicProfileActivity: vi.fn(),
  checkFixedWindowRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
  getRedis: vi.fn().mockResolvedValue({}),
  unbanUserAndReconcileRewards: vi.fn(),
  userHasPermission: vi.fn().mockResolvedValue({ success: true }),
  userIsNotActivelyBanned: vi.fn(),
}));

vi.mock("@repo/db", async (importOriginal) => ({
  ...(await importOriginal<typeof DbExports>()),
  getRedis: mocks.getRedis,
}));
vi.mock("../utils/redis-operations", async (importOriginal) => ({
  ...(await importOriginal<typeof RedisOperationExports>()),
  checkFixedWindowRateLimit: mocks.checkFixedWindowRateLimit,
}));

vi.mock("@orpc/experimental-pino", () => ({ getLogger: () => {} }));
vi.mock("@repo/auth", () => ({
  auth: {
    api: {
      userHasPermission: mocks.userHasPermission,
    },
  },
}));
vi.mock("../services/comic-progress", () => ({
  attachComicCatalogProgress: mocks.attachComicCatalogProgress,
}));
vi.mock("../services/profile", () => ({
  canReadPublicProfileActivity: mocks.canReadPublicProfileActivity,
}));
vi.mock("../services/streak", () => ({
  applyStreakEvidenceInTransaction: mocks.applyStreakEvidenceInTransaction,
}));
vi.mock("../services/user-administration", () => ({
  banUserAndReconcileRewards: mocks.banUserAndReconcileRewards,
  unbanUserAndReconcileRewards: mocks.unbanUserAndReconcileRewards,
  UserAdministrationError: class extends Error {},
}));
vi.mock("../utils/user-ban", () => ({
  userIsNotActivelyBanned: mocks.userIsNotActivelyBanned,
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

  it("uses the active-ban predicate when public favorites are visible", async () => {
    mocks.canReadPublicProfileActivity.mockResolvedValue(true);
    mocks.attachComicCatalogProgress.mockResolvedValue([]);
    const query = {
      from: vi.fn(),
      groupBy: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      limit: vi.fn().mockResolvedValue([]),
      orderBy: vi.fn(),
      where: vi.fn(),
    };
    for (const method of [
      "from",
      "groupBy",
      "innerJoin",
      "leftJoin",
      "orderBy",
      "where",
    ] as const) {
      query[method].mockReturnValue(query);
    }
    Object.assign(query, { as: vi.fn(() => query) });
    const context = {
      db: { select: vi.fn(() => query) },
      headers: new Headers(),
      session: null,
    } as unknown as Context;

    await call(
      userRouter.getUserBookmarks,
      { limit: 12, userId: "user-1" },
      { context }
    );

    expect(mocks.userIsNotActivelyBanned).toHaveBeenCalledOnce();
  });
});

describe("bookmark Discovery evidence", () => {
  it("submits evidence only for a successful new bookmark in its transaction", async () => {
    const { context, transaction, tx } = createBookmarkMutationContext(true);

    await call(
      userRouter.toggleBookmark,
      {
        bookmarked: true,
        postId: "post-1",
        timezone: "America/Argentina/Buenos_Aires",
      },
      { context }
    );

    expect(transaction).toHaveBeenCalledOnce();
    expect(mocks.applyStreakEvidenceInTransaction).toHaveBeenCalledWith(
      tx,
      {
        actionKind: "bookmark",
        contentKey: "post:post-1",
        impersonated: false,
        integrity: {
          correlation: { deviceHash: null, ipPrefixHash: null },
        },
        kind: "discovery",
        timezone: "America/Argentina/Buenos_Aires",
        userId: "user-1",
      },
      expect.any(Date)
    );
  });

  it("does not submit evidence for a conflict insert", async () => {
    const { context } = createBookmarkMutationContext(false);

    await call(
      userRouter.toggleBookmark,
      { bookmarked: true, postId: "post-1" },
      { context }
    );

    expect(mocks.applyStreakEvidenceInTransaction).not.toHaveBeenCalled();
  });

  it("does not submit evidence when removing a bookmark", async () => {
    const { context, transaction } = createBookmarkMutationContext(false);

    await call(
      userRouter.toggleBookmark,
      { bookmarked: false, postId: "post-1" },
      { context }
    );

    expect(transaction).not.toHaveBeenCalled();
    expect(mocks.applyStreakEvidenceInTransaction).not.toHaveBeenCalled();
  });

  it("rolls a new bookmark through the same boundary when streak work fails", async () => {
    const failure = new Error("streak write failed");
    mocks.applyStreakEvidenceInTransaction.mockRejectedValueOnce(failure);
    const { context } = createBookmarkMutationContext(true);

    await expect(
      call(
        userRouter.toggleBookmark,
        { bookmarked: true, postId: "post-1" },
        { context }
      )
    ).rejects.toBe(failure);
  });
});

function createBookmarkMutationContext(inserted: boolean) {
  const returning = vi
    .fn()
    .mockResolvedValue(inserted ? [{ postId: "post-1" }] : []);
  const insert = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({ returning })),
    })),
  }));
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([{ count: 0 }]),
    })),
  }));
  const remove = vi.fn().mockResolvedValue(null);
  const deleteRow = vi.fn(() => ({ where: remove }));
  const tx = { delete: deleteRow, insert, select };
  const transaction = vi.fn((callback: (executor: typeof tx) => unknown) =>
    callback(tx)
  );
  const db = {
    delete: deleteRow,
    insert,
    query: {
      patron: { findFirst: vi.fn().mockResolvedValue(null) },
      post: {
        findFirst: vi.fn().mockResolvedValue({
          earlyAccessEnabled: false,
          earlyAccessStartedAt: null,
          releasedAt: null,
          status: "publish",
          type: "post",
          vip12EarlyAccessHours: 0,
          vip8EarlyAccessHours: 0,
        }),
      },
    },
    select,
    transaction,
  };
  return {
    context: {
      db,
      headers: new Headers(),
      session: { user: { id: "user-1", role: "user" } },
    } as unknown as Context,
    transaction,
    tx,
  };
}
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
    expect(mocks.checkFixedWindowRateLimit).toHaveBeenCalledOnce();
    expect(mocks.userHasPermission).not.toHaveBeenCalledWith({
      body: expect.objectContaining({ permissions: { ratelimit: ["bypass"] } }),
    });
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
    expect(mocks.checkFixedWindowRateLimit).toHaveBeenCalledOnce();
    expect(mocks.userHasPermission).not.toHaveBeenCalledWith({
      body: expect.objectContaining({ permissions: { ratelimit: ["bypass"] } }),
    });
  });
});
