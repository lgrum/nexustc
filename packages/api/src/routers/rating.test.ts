import { call } from "@orpc/server";

import type { Context } from "../context";
import type { publicCatalogVisibilityCondition } from "../utils/early-access";

const mocks = vi.hoisted(() => ({
  applyStreakEvidenceInTransaction: vi.fn(),
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
vi.mock("../services/streak", () => ({
  applyStreakEvidenceInTransaction: mocks.applyStreakEvidenceInTransaction,
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

const qualifyingReview =
  "Esta reseña analiza con detalle el ritmo, los personajes y la presentación de la obra sin incluir enlaces externos.";

function createRatingMutationContext(
  previousReview?: string,
  postStatus: "draft" | "publish" = "publish"
) {
  const now = new Date("2026-08-08T12:00:00.000Z");
  let current =
    previousReview === undefined
      ? undefined
      : {
          createdAt: now,
          id: "review-1",
          postId: "post-1",
          rating: 5,
          review: previousReview,
          userId: "owner-1",
        };
  let pendingValues = { rating: 8, review: qualifyingReview };
  const returningInsert = vi.fn(() => {
    if (current) {
      return [];
    }
    current = {
      createdAt: now,
      id: "review-1",
      postId: "post-1",
      rating: pendingValues.rating,
      review: pendingValues.review,
      userId: "owner-1",
    };
    return [current];
  });
  const insert = vi.fn(() => ({
    values: vi.fn((values: typeof pendingValues) => {
      pendingValues = values;
      return {
        onConflictDoNothing: vi.fn(() => ({ returning: returningInsert })),
      };
    }),
  }));
  const selectForUpdate = vi.fn(() => (current ? [current] : []));
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ for: selectForUpdate })),
    })),
  }));
  const returningUpdate = vi.fn(() => (current ? [current] : []));
  const update = vi.fn(() => ({
    set: vi.fn((values: Partial<typeof current>) => {
      current = current ? { ...current, ...values } : current;
      return {
        where: vi.fn(() => ({ returning: returningUpdate })),
      };
    }),
  }));
  const tx = { insert, select, update };
  const db = {
    query: {
      forbiddenContentRule: { findMany: vi.fn().mockResolvedValue([]) },
      patron: { findFirst: vi.fn().mockResolvedValue(null) },
      post: {
        findFirst: vi.fn().mockResolvedValue({
          earlyAccessEnabled: false,
          earlyAccessStartedAt: null,
          releasedAt: null,
          status: postStatus,
          type: "post",
          vip12EarlyAccessHours: 0,
          vip8EarlyAccessHours: 0,
        }),
      },
    },
    transaction: vi.fn((callback: (executor: typeof tx) => Promise<unknown>) =>
      callback(tx)
    ),
  };
  return {
    context: {
      db,
      headers: new Headers(),
      session: { user: { id: "owner-1", role: "user" } },
    } as unknown as Context,
    selectForUpdate,
    tx,
  };
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

describe("qualifying review streak evidence", () => {
  it("submits a newly inserted review as Contribution evidence", async () => {
    const settlement = {
      level: 2,
      previousLevel: 1,
      replayed: false,
      settledXp: 25,
    };
    mocks.reconcileEditedReviewRewardsInTransaction.mockResolvedValueOnce({
      settlements: [settlement],
    });
    const { context, tx } = createRatingMutationContext();

    await expect(
      call(
        ratingRouter.create,
        {
          postId: "post-1",
          rating: 8,
          review: qualifyingReview,
          timezone: "America/Argentina/Buenos_Aires",
        },
        { context }
      )
    ).resolves.toMatchObject({ success: true });

    expect(mocks.applyStreakEvidenceInTransaction).toHaveBeenCalledWith(
      tx,
      {
        impersonated: false,
        integrity: {
          correlation: { deviceHash: null, ipPrefixHash: null },
        },
        kind: "contribution",
        source: { id: "review-1", kind: "review" },
        text: qualifyingReview,
        timezone: "America/Argentina/Buenos_Aires",
        userId: "owner-1",
      },
      expect.any(Date)
    );
    expect(mocks.notifyXpSettlementInTransaction).toHaveBeenCalledWith(
      tx,
      "owner-1",
      settlement
    );
    expect(mocks.notifyXpSettlement).not.toHaveBeenCalled();
  });

  it("submits only the first non-qualifying-to-qualifying transition", async () => {
    const { context, selectForUpdate } = createRatingMutationContext("");

    await call(
      ratingRouter.create,
      { postId: "post-1", rating: 8, review: qualifyingReview },
      { context }
    );
    await call(
      ratingRouter.create,
      { postId: "post-1", rating: 9, review: `${qualifyingReview} Editada.` },
      { context }
    );

    expect(mocks.applyStreakEvidenceInTransaction).toHaveBeenCalledOnce();
    expect(selectForUpdate).toHaveBeenCalledWith("update");
  });

  it("does not submit an edit to an already-qualifying review", async () => {
    const { context } = createRatingMutationContext(qualifyingReview);

    await call(
      ratingRouter.update,
      { postId: "post-1", rating: 9, review: `${qualifyingReview} Editada.` },
      { context }
    );

    expect(mocks.applyStreakEvidenceInTransaction).not.toHaveBeenCalled();
  });

  it("submits only Discovery evidence for a newly inserted bare rating", async () => {
    const { context, tx } = createRatingMutationContext();

    await expect(
      call(
        ratingRouter.create,
        { postId: "post-1", rating: 8, review: "" },
        { context }
      )
    ).resolves.toMatchObject({ success: true });

    expect(mocks.applyStreakEvidenceInTransaction).toHaveBeenCalledWith(
      tx,
      {
        actionKind: "rating",
        contentKey: "post:post-1",
        impersonated: false,
        integrity: {
          correlation: { deviceHash: null, ipPrefixHash: null },
        },
        kind: "discovery",
        timezone: undefined,
        userId: "owner-1",
      },
      expect.any(Date)
    );
  });

  it("does not submit Discovery evidence for a bare rating update", async () => {
    const { context } = createRatingMutationContext("");

    await call(
      ratingRouter.create,
      { postId: "post-1", rating: 9, review: "" },
      { context }
    );

    expect(mocks.applyStreakEvidenceInTransaction).not.toHaveBeenCalled();
  });

  it("does not publish review evidence for hidden content", async () => {
    const { context } = createRatingMutationContext(undefined, "draft");

    await expect(
      call(
        ratingRouter.create,
        { postId: "post-1", rating: 8, review: qualifyingReview },
        { context }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mocks.applyStreakEvidenceInTransaction).not.toHaveBeenCalled();
  });

  it("keeps a qualifying rating successful when streak evidence is ineligible", async () => {
    mocks.applyStreakEvidenceInTransaction.mockResolvedValueOnce({
      available: true,
      completed: false,
    });
    const { context } = createRatingMutationContext();

    await expect(
      call(
        ratingRouter.create,
        { postId: "post-1", rating: 8, review: qualifyingReview },
        { context }
      )
    ).resolves.toMatchObject({
      streak: { available: true, completed: false },
      success: true,
    });
  });

  it("keeps rating and streak writes in the same rollback boundary", async () => {
    const failure = new Error("streak write failed");
    mocks.applyStreakEvidenceInTransaction.mockRejectedValueOnce(failure);
    const { context } = createRatingMutationContext();

    await expect(
      call(
        ratingRouter.create,
        { postId: "post-1", rating: 8, review: qualifyingReview },
        { context }
      )
    ).rejects.toBe(failure);
  });
});

describe("stable review likes", () => {
  it("persists level notifications in the like settlement transaction", async () => {
    const ratingQuery = createPaginatedQuery([
      {
        earlyAccessEnabled: false,
        earlyAccessStartedAt: null,
        id: "review-current",
        review: qualifyingReview,
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
        review: qualifyingReview,
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
        review: qualifyingReview,
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
        review: qualifyingReview,
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

  it("rejects likes on rating-only rows", async () => {
    const ratingQuery = createPaginatedQuery([
      {
        earlyAccessEnabled: false,
        earlyAccessStartedAt: null,
        id: "rating-only",
        releasedAt: null,
        review: "",
        status: "publish",
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

  it("rejects a like when the parent post is not viewable", async () => {
    const ratingQuery = createPaginatedQuery([
      {
        earlyAccessEnabled: false,
        earlyAccessStartedAt: null,
        id: "review-hidden",
        review: qualifyingReview,
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
              releasedAt: null,
              status: "publish",
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
