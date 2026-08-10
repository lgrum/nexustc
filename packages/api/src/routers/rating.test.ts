import { call } from "@orpc/server";

import type { Context } from "../context";
import type { publicCatalogVisibilityCondition } from "../utils/early-access";

const mocks = vi.hoisted(() => ({
  buildProfileSummaries: vi.fn(),
  canReadPublicProfileActivity: vi.fn(),
  publicCatalogVisibilityCondition: vi.fn(),
  reconcileEditedReviewRewardsInTransaction: vi.fn(),
  reconcileRemovedContributionLikeInTransaction: vi.fn(),
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
  reconcileEditedReviewRewardsInTransaction:
    mocks.reconcileEditedReviewRewardsInTransaction,
  reconcileRemovedContributionLikeInTransaction:
    mocks.reconcileRemovedContributionLikeInTransaction,
  settleReviewMilestonesInTransaction:
    mocks.settleReviewMilestonesInTransaction,
}));
vi.mock("../services/progression", () => ({
  notifyXpSettlement: vi.fn(),
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
  mocks.settleReviewMilestonesInTransaction.mockResolvedValue({
    settlements: [],
  });
  mocks.reconcileEditedReviewRewardsInTransaction.mockResolvedValue({
    settlements: [],
  });
  mocks.reconcileRemovedContributionLikeInTransaction.mockResolvedValue({
    settlements: [],
  });
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
    expect(ratingQuery.for).toHaveBeenCalledWith("update");
    expect(ratingQuery.for.mock.invocationCallOrder[0]).toBeLessThan(
      values.mock.invocationCallOrder[0]!
    );
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
