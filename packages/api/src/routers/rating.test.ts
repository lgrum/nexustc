import { call } from "@orpc/server";

import type { Context } from "../context";
import type { publicCatalogVisibilityCondition } from "../utils/early-access";

const mocks = vi.hoisted(() => ({
  buildProfileSummaries: vi.fn(),
  canReadPublicProfileActivity: vi.fn(),
  isContributionLikerEligibleInTransaction: vi.fn(),
  lockContributionParticipantsInTransaction: vi.fn(),
  notifyXpSettlement: vi.fn(),
  notifyXpSettlementInTransaction: vi.fn(),
  userIsNotActivelyBanned: vi.fn(),
  publicCatalogVisibilityCondition: vi.fn(),
  reconcileEditedReviewRewardsInTransaction: vi.fn(),
  reconcileRemovedContributionLikeInTransaction: vi.fn(),
  runContributionRewardTransaction: vi.fn(),
  settleReviewMilestonesInTransaction: vi.fn(),
}));

vi.mock("@orpc/experimental-pino", () => ({ getLogger: () => {} }));
vi.mock("@repo/env", () => ({ env: { XP_ACCRUAL_ENABLED: false } }));
vi.mock("@repo/auth", () => ({
  auth: {
    api: {
      userHasPermission: vi.fn().mockResolvedValue({ success: true }),
    },
  },
}));
vi.mock("../services/profile", () => ({
  buildProfileSummaries: mocks.buildProfileSummaries,
  canReadPublicProfileActivity: mocks.canReadPublicProfileActivity,
}));
vi.mock("../services/contribution-rewards", () => ({
  deleteReviewWithRewards: vi.fn(),
  getReviewDeletionWarning: vi.fn(),
  isContributionLikerEligibleInTransaction:
    mocks.isContributionLikerEligibleInTransaction,
  lockContributionParticipantsInTransaction:
    mocks.lockContributionParticipantsInTransaction,
  reconcileEditedReviewRewardsInTransaction:
    mocks.reconcileEditedReviewRewardsInTransaction,
  reconcileRemovedContributionLikeInTransaction:
    mocks.reconcileRemovedContributionLikeInTransaction,
  runContributionRewardTransaction: mocks.runContributionRewardTransaction,
  settleReviewMilestonesInTransaction:
    mocks.settleReviewMilestonesInTransaction,
}));
vi.mock("../utils/user-ban", () => ({
  userIsNotActivelyBanned: mocks.userIsNotActivelyBanned,
}));
vi.mock("../services/progression", () => ({
  notifyXpSettlement: mocks.notifyXpSettlement,
  notifyXpSettlementInTransaction: mocks.notifyXpSettlementInTransaction,
}));
vi.mock("../utils/early-access", async (importOriginal) => {
  const original = await importOriginal<{
    publicCatalogVisibilityCondition: typeof publicCatalogVisibilityCondition;
  }>();
  mocks.publicCatalogVisibilityCondition.mockImplementation(
    original.publicCatalogVisibilityCondition
  );
  return {
    ...original,
    publicCatalogVisibilityCondition: mocks.publicCatalogVisibilityCondition,
  };
});

const { default: ratingRouter } = await import("./rating");

function createPaginatedQuery(rows: unknown[]) {
  const query = {
    for: vi.fn(),
    from: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn(),
    where: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.for.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return query;
}

function createPostQuery(rows: unknown[]) {
  const query = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue(rows),
  };
  query.from.mockReturnValue(query);
  return query;
}

function createContext(select = vi.fn()) {
  return {
    db: {
      query: { patron: { findFirst: vi.fn().mockResolvedValue(null) } },
      select,
    },
    headers: new Headers(),
    session: {
      user: { emailVerified: true, id: "owner-1", role: "user" },
    },
  } as unknown as Context;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.runContributionRewardTransaction.mockImplementation((db, callback) =>
    db.transaction(callback)
  );
  mocks.settleReviewMilestonesInTransaction.mockResolvedValue({
    settlements: [],
  });
  mocks.reconcileEditedReviewRewardsInTransaction.mockResolvedValue({
    settlements: [],
  });
  mocks.reconcileRemovedContributionLikeInTransaction.mockResolvedValue({
    settlements: [],
  });
  mocks.lockContributionParticipantsInTransaction.mockImplementation(() =>
    Promise.resolve()
  );
  mocks.isContributionLikerEligibleInTransaction.mockResolvedValue(true);
});

describe("profile review privacy", () => {
  it("returns the established empty shape when public reviews are hidden", async () => {
    mocks.canReadPublicProfileActivity.mockResolvedValue(false);
    const select = vi.fn();
    const context = createContext(select);

    await expect(
      call(
        ratingRouter.getByUserId,
        { limit: 10, userId: "user-1" },
        { context }
      )
    ).resolves.toEqual({ nextCursor: null, posts: [], ratings: [] });

    expect(mocks.canReadPublicProfileActivity).toHaveBeenCalledWith(
      context.db,
      "user-1",
      "reviews"
    );
    expect(select).not.toHaveBeenCalled();
  });

  it("keeps canonical public filtering and includes post slugs when reviews are visible", async () => {
    mocks.canReadPublicProfileActivity.mockResolvedValue(true);
    const rating = {
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      postId: "post-1",
      rating: 4,
      review: "Muy bueno",
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    };
    const linkedPost = {
      id: "post-1",
      slug: "post-publicado",
      title: "Post publicado",
      type: "post",
    };
    const ratingsQuery = createPaginatedQuery([rating]);
    const postsQuery = createPostQuery([linkedPost]);
    const select = vi
      .fn()
      .mockReturnValueOnce(ratingsQuery)
      .mockReturnValueOnce(postsQuery);
    const context = createContext(select);

    await expect(
      call(
        ratingRouter.getByUserId,
        { limit: 10, userId: "user-1" },
        { context }
      )
    ).resolves.toEqual({
      nextCursor: null,
      posts: [linkedPost],
      ratings: [rating],
    });

    expect(mocks.publicCatalogVisibilityCondition).toHaveBeenCalledOnce();
    expect(mocks.userIsNotActivelyBanned).toHaveBeenCalledOnce();
    expect(select.mock.calls[1]?.[0]).toHaveProperty("slug");
  });

  it("returns all owner reviews with slug projection regardless of public visibility", async () => {
    mocks.canReadPublicProfileActivity.mockResolvedValue(false);
    const rating = {
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      postId: "post-1",
      rating: 5,
      review: "Excelente",
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    };
    const linkedPost = {
      id: "post-1",
      slug: "post-publicado",
      title: "Post publicado",
      type: "post",
    };
    const ratingsQuery = createPaginatedQuery([rating]);
    const postsQuery = createPostQuery([linkedPost]);
    const select = vi
      .fn()
      .mockReturnValueOnce(ratingsQuery)
      .mockReturnValueOnce(postsQuery);
    const context = createContext(select);

    await expect(
      call(ratingRouter.getMyReviews, { limit: 7 }, { context })
    ).resolves.toEqual({
      nextCursor: null,
      posts: [linkedPost],
      ratings: [rating],
    });

    expect(mocks.canReadPublicProfileActivity).not.toHaveBeenCalled();
    expect(ratingsQuery.limit).toHaveBeenCalledWith(7);
    expect(select.mock.calls[1]?.[0]).toHaveProperty("slug");
  });
});

describe("stable review likes", () => {
  it("persists level notifications in the like settlement transaction", async () => {
    const ratingQuery = createPaginatedQuery([
      {
        earlyAccessEnabled: false,
        earlyAccessStartedAt: null,
        id: "review-current",
        releasedAt: null,
        status: "publish",
        type: "post",
        vip12EarlyAccessHours: 0,
        vip8EarlyAccessHours: 0,
      },
    ]);
    const settlement = {
      level: 2,
      previousLevel: 1,
      replayed: false,
      settledXp: 25,
    };
    mocks.settleReviewMilestonesInTransaction.mockResolvedValue({
      settlements: [settlement],
    });
    const executor = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([{ ratingId: "review-current" }]),
          }),
        }),
      }),
      query: { patron: { findFirst: vi.fn().mockResolvedValue(null) } },
      select: vi.fn().mockReturnValue(ratingQuery),
    };
    const context = {
      ...createContext(executor.select),
      db: {
        ...executor,
        transaction: vi.fn((callback) => callback(executor)),
      },
    } as unknown as Context;

    await call(
      ratingRouter.toggleReviewLike,
      { liked: true, postId: "post-1", ratingUserId: "author-1" },
      { context }
    );

    expect(mocks.notifyXpSettlementInTransaction).toHaveBeenCalledWith(
      executor,
      "author-1",
      settlement
    );
    expect(mocks.notifyXpSettlement).not.toHaveBeenCalled();
  });

  it("attaches a new like to the current review incarnation", async () => {
    const ratingQuery = createPaginatedQuery([
      {
        earlyAccessEnabled: false,
        earlyAccessStartedAt: null,
        id: "review-current",
        releasedAt: null,
        status: "publish",
        type: "post",
        vip12EarlyAccessHours: 0,
        vip8EarlyAccessHours: 0,
      },
    ]);
    const returning = vi
      .fn()
      .mockResolvedValue([{ ratingId: "review-current" }]);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });
    const select = vi.fn().mockReturnValue(ratingQuery);
    const executor = {
      insert,
      query: { patron: { findFirst: vi.fn().mockResolvedValue(null) } },
      select,
    };
    const context = {
      ...createContext(select),
      db: {
        ...executor,
        transaction: vi.fn((callback) => callback(executor)),
      },
    } as unknown as Context;

    await expect(
      call(
        ratingRouter.toggleReviewLike,
        { liked: true, postId: "post-1", ratingUserId: "author-1" },
        { context }
      )
    ).resolves.toMatchObject({ success: true });

    expect(select.mock.calls[0]?.[0]).toHaveProperty("id");
    expect(values).toHaveBeenCalledWith({
      createdAt: expect.any(Date),
      emailVerifiedAtCreation: true,
      ratingId: "review-current",
      userId: "owner-1",
      xpAccrualEnabledAtCreation: false,
    });
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
    expect(returning).toHaveBeenCalledOnce();
    expect(
      mocks.lockContributionParticipantsInTransaction
    ).toHaveBeenCalledWith(executor, ["owner-1", "author-1"]);
    expect(
      mocks.lockContributionParticipantsInTransaction.mock
        .invocationCallOrder[0]
    ).toBeLessThan(values.mock.invocationCallOrder[0]!);
    expect(mocks.isContributionLikerEligibleInTransaction).toHaveBeenCalledWith(
      executor,
      "owner-1",
      expect.any(Date)
    );
    expect(
      mocks.lockContributionParticipantsInTransaction.mock
        .invocationCallOrder[0]
    ).toBeLessThan(
      mocks.isContributionLikerEligibleInTransaction.mock
        .invocationCallOrder[0]!
    );
    expect(
      mocks.isContributionLikerEligibleInTransaction.mock.invocationCallOrder[0]
    ).toBeLessThan(values.mock.invocationCallOrder[0]!);
    expect(mocks.settleReviewMilestonesInTransaction).toHaveBeenCalledWith(
      executor,
      "review-current",
      expect.any(Date),
      "owner-1",
      { deviceHash: null, ipPrefixHash: null }
    );
  });

  it("does not replay milestone work when the like already exists", async () => {
    const ratingQuery = createPaginatedQuery([
      {
        earlyAccessEnabled: false,
        earlyAccessStartedAt: null,
        id: "review-current",
        releasedAt: null,
        status: "publish",
        type: "post",
        vip12EarlyAccessHours: 0,
        vip8EarlyAccessHours: 0,
      },
    ]);
    const returning = vi.fn().mockResolvedValue([]);
    const executor = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
        }),
      }),
      query: { patron: { findFirst: vi.fn().mockResolvedValue(null) } },
      select: vi.fn().mockReturnValue(ratingQuery),
    };
    const context = {
      ...createContext(executor.select),
      db: {
        ...executor,
        transaction: vi.fn((callback) => callback(executor)),
      },
    } as unknown as Context;

    await call(
      ratingRouter.toggleReviewLike,
      { liked: true, postId: "post-1", ratingUserId: "author-1" },
      { context }
    );

    expect(mocks.settleReviewMilestonesInTransaction).not.toHaveBeenCalled();
  });

  it("reconciles unsupported milestones after removing a like", async () => {
    const ratingQuery = createPaginatedQuery([
      {
        earlyAccessEnabled: false,
        earlyAccessStartedAt: null,
        id: "review-current",
        releasedAt: null,
        status: "publish",
        type: "post",
        vip12EarlyAccessHours: 0,
        vip8EarlyAccessHours: 0,
      },
    ]);
    const returning = vi
      .fn()
      .mockResolvedValue([{ ratingId: "review-current" }]);
    const where = vi.fn().mockReturnValue({ returning });
    const executor = {
      delete: vi.fn().mockReturnValue({ where }),
      query: { patron: { findFirst: vi.fn().mockResolvedValue(null) } },
      select: vi.fn().mockReturnValue(ratingQuery),
    };
    const context = {
      ...createContext(executor.select),
      db: {
        ...executor,
        transaction: vi.fn((callback) => callback(executor)),
      },
    } as unknown as Context;

    await call(
      ratingRouter.toggleReviewLike,
      { liked: false, postId: "post-1", ratingUserId: "author-1" },
      { context }
    );

    expect(returning).toHaveBeenCalledOnce();
    expect(
      mocks.reconcileRemovedContributionLikeInTransaction
    ).toHaveBeenCalledWith(executor, {
      actorUserId: "owner-1",
      entityId: "review-current",
      kind: "review",
      now: expect.any(Date),
    });
  });

  it("rejects a like when the parent post is not viewable", async () => {
    const ratingQuery = createPaginatedQuery([
      {
        earlyAccessEnabled: false,
        earlyAccessStartedAt: null,
        id: "review-hidden",
        releasedAt: null,
        status: "draft",
        type: "post",
        vip12EarlyAccessHours: 0,
        vip8EarlyAccessHours: 0,
      },
    ]);
    const insert = vi.fn();
    const executor = {
      insert,
      query: { patron: { findFirst: vi.fn().mockResolvedValue(null) } },
      select: vi.fn().mockReturnValue(ratingQuery),
    };
    const context = {
      ...createContext(executor.select),
      db: {
        ...executor,
        transaction: vi.fn((callback) => callback(executor)),
      },
    } as unknown as Context;

    await expect(
      call(
        ratingRouter.toggleReviewLike,
        { liked: true, postId: "post-1", ratingUserId: "author-1" },
        { context }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("review edit locking", () => {
  it("locks the author before updating the review source", async () => {
    const settlement = {
      level: 2,
      previousLevel: 1,
      replayed: false,
      settledXp: 25,
    };
    mocks.reconcileEditedReviewRewardsInTransaction.mockResolvedValueOnce({
      settlements: [settlement],
    });
    const returning = vi.fn().mockResolvedValue([
      {
        createdAt: new Date("2026-08-10T12:00:00.000Z"),
        id: "review-1",
        postId: "post-1",
        review:
          "Resena actualizada con suficiente detalle para conservarse y asegurar que supera el minimo requerido por el contrato compartido.",
        userId: "owner-1",
      },
    ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const tx = { update: vi.fn().mockReturnValue({ set }) };
    const context = {
      db: {
        query: {
          forbiddenContentRule: { findMany: vi.fn().mockResolvedValue([]) },
          patron: { findFirst: vi.fn().mockResolvedValue(null) },
          post: {
            findFirst: vi.fn().mockResolvedValue({
              earlyAccessEnabled: false,
              earlyAccessStartedAt: null,
              type: "post",
              vip12EarlyAccessHours: 0,
              vip8EarlyAccessHours: 0,
            }),
          },
        },
        transaction: vi.fn((callback) => callback(tx)),
      },
      headers: new Headers(),
      session: {
        user: { emailVerified: true, id: "owner-1", role: "user" },
      },
    } as unknown as Context;

    await call(
      ratingRouter.update,
      {
        postId: "post-1",
        rating: 4,
        review:
          "Resena actualizada con suficiente detalle para conservarse y asegurar que supera el minimo requerido por el contrato compartido.",
      },
      { context }
    );

    expect(
      mocks.lockContributionParticipantsInTransaction
    ).toHaveBeenCalledWith(tx, ["owner-1"]);
    expect(
      mocks.lockContributionParticipantsInTransaction.mock
        .invocationCallOrder[0]
    ).toBeLessThan(set.mock.invocationCallOrder[0]!);
    expect(mocks.notifyXpSettlementInTransaction).toHaveBeenCalledWith(
      tx,
      "owner-1",
      settlement
    );
    expect(mocks.notifyXpSettlement).not.toHaveBeenCalled();
  });
});

describe("post review visibility", () => {
  it("uses the active-ban predicate for review authors and likers", async () => {
    const ratingsQuery = createPaginatedQuery([
      {
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        id: "review-1",
        pinnedAt: null,
        postId: "post-1",
        rating: 5,
        review: "Excelente",
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
        userId: "author-1",
      },
    ]);
    ratingsQuery.orderBy.mockResolvedValue([
      {
        createdAt: new Date("2026-08-10T00:00:00.000Z"),
        id: "review-1",
        pinnedAt: null,
        postId: "post-1",
        rating: 5,
        review: "Excelente",
        updatedAt: new Date("2026-08-10T00:00:00.000Z"),
        userId: "author-1",
      },
    ]);
    const likesQuery = {
      from: vi.fn(),
      groupBy: vi.fn().mockResolvedValue([]),
      innerJoin: vi.fn(),
      where: vi.fn(),
    };
    likesQuery.from.mockReturnValue(likesQuery);
    likesQuery.innerJoin.mockReturnValue(likesQuery);
    likesQuery.where.mockReturnValue(likesQuery);
    const select = vi
      .fn()
      .mockReturnValueOnce(ratingsQuery)
      .mockReturnValueOnce(likesQuery);
    const context = {
      ...createContext(select),
      db: {
        query: {
          patron: { findFirst: vi.fn().mockResolvedValue(null) },
          post: {
            findFirst: vi.fn().mockResolvedValue({
              earlyAccessEnabled: false,
              earlyAccessStartedAt: null,
              type: "post",
              vip12EarlyAccessHours: 0,
              vip8EarlyAccessHours: 0,
            }),
          },
        },
        select,
      },
    } as unknown as Context;
    mocks.buildProfileSummaries.mockResolvedValue([]);

    await call(ratingRouter.getByPostId, { postId: "post-1" }, { context });

    expect(mocks.userIsNotActivelyBanned).toHaveBeenCalledTimes(2);
  });
});
