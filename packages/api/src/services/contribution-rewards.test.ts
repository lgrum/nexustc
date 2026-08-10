import type { db as database } from "@repo/db";
import type { xpRewardSubject } from "@repo/db/schema/app";

import {
  deleteCommentWithRewards,
  deleteReviewWithRewards,
  getContributionContentHash,
  isEligibleLike,
  markParentPostContributionSubjectsRemovedInTransaction,
  reconcileBannedLikerRewards,
  reconcileEditedCommentRewardsInTransaction,
  reconcileEditedReviewRewardsInTransaction,
  reverseUnsupportedContributionMilestonesInTransaction,
  saveCommentRewardSubjectInTransaction,
  saveReviewRewardSubjectInTransaction,
  settleCommentMilestonesInTransaction,
  settleReviewMilestonesInTransaction,
} from "./contribution-rewards";

const flags = vi.hoisted(() => ({ accrual: true }));
const progression = vi.hoisted(() => ({
  assessments: [] as string[],
  assessmentDetails: [] as Record<string, unknown>[],
  cancelledPending: [] as Record<string, unknown>[],
  calls: [] as Record<string, unknown>[],
  fail: false,
  projectionMismatch: false,
  replayed: false,
}));

vi.mock("./integrity-settlement", () => ({
  settleXpWithIntegrityInTransaction: vi.fn(
    (_tx, input, assessment: { disposition: string }) => {
      progression.calls.push(input);
      progression.assessments.push(assessment.disposition);
      progression.assessmentDetails.push(assessment);
      if (progression.fail) {
        return Promise.reject(new Error("atomic progression failure"));
      }
      if (assessment.disposition === "medium") {
        return Promise.resolve({ outcome: "pending", replayed: false });
      }
      return Promise.resolve({
        outcome: "posted",
        settlement: {
          debtCreated: false,
          eventId: `event-${progression.calls.length}`,
          level: 1,
          previousLevel: 1,
          replayed: progression.replayed,
          settledXp: progression.replayed ? 0 : Number(input.amount),
          totalXp: progression.replayed ? 0 : Number(input.amount),
        },
      });
    }
  ),
}));

const activation = vi.hoisted(() => ({ date: null as Date | null }));
vi.mock("./progression-activation", () => ({
  ensureProgressionActivationInTransaction: vi.fn((_tx, now: Date) =>
    Promise.resolve(activation.date ?? now)
  ),
  readProgressionActivationDate: vi.fn(() => Promise.resolve(activation.date)),
}));

vi.mock("@repo/env", () => ({
  env: {
    get XP_ACCRUAL_ENABLED() {
      return flags.accrual;
    },
  },
}));
vi.mock("./progression", () => ({
  cancelPendingXpEventsInTransaction: vi.fn((_tx, input) => {
    progression.cancelledPending.push(input);
    return Promise.resolve([]);
  }),
  notifyXpSettlement: vi.fn(),
  postXpEventInTransaction: vi.fn((_tx, input) => {
    progression.calls.push(input);
    if (progression.fail) {
      return Promise.reject(new Error("atomic progression failure"));
    }
    if (progression.projectionMismatch) {
      return Promise.resolve({
        debtCreated: false,
        eventId: null,
        level: 1,
        previousLevel: 1,
        projectionMismatch: true,
        replayed: false,
        settledXp: 0,
        totalXp: 75,
      });
    }
    return Promise.resolve({
      debtCreated: false,
      eventId: `event-${progression.calls.length}`,
      level: 1,
      previousLevel: 1,
      replayed: progression.replayed,
      settledXp: progression.replayed ? 0 : Number(input.amount),
      totalXp: progression.replayed ? 0 : Number(input.amount),
    });
  }),
}));

type Database = typeof database;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const reviewText =
  "Esta reseña explica con claridad el ritmo, los personajes y la presentación del contenido sin repetir frases ni incluir enlaces externos.";
const review = {
  createdAt: new Date("2026-08-07T12:00:00.000Z"),
  id: "review-1",
  postId: "post-1",
  review: reviewText,
  userId: "author-1",
};
const subject = {
  createdAt: review.createdAt,
  dailyCapEligible: true,
  deletedAt: null,
  deletionReason: null,
  entityId: review.id,
  id: "subject-1",
  kind: "review",
  normalizedContentHash: getContributionContentHash(reviewText),
  parentPostId: review.postId,
  userId: review.userId,
} satisfies typeof xpRewardSubject.$inferSelect;

const commentText =
  "Este comentario aporta una observación concreta sobre la historia.";
const commentSnapshot = {
  createdAt: new Date("2026-08-07T13:00:00.000Z"),
  id: "comment-1",
  postId: "post-1",
  content: commentText,
  userId: "author-1",
};

function createEditedContributionTransaction(
  editedSubject: typeof xpRewardSubject.$inferSelect,
  laterDuplicates: (typeof xpRewardSubject.$inferSelect)[] = []
) {
  const where = vi.fn().mockResolvedValue(null);
  const update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({ where }),
  });
  const select = vi.fn((shape: Record<string, unknown>) => {
    if ("amount" in shape) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              amount: 25,
              id: "xp-posted",
              kind: `${editedSubject.kind}_milestone`,
              milestone: 3,
              reversesEventId: null,
            },
          ]),
        }),
      };
    }
    const chain = {
      for: vi.fn().mockResolvedValue([{ id: editedSubject.id }]),
      from: vi.fn(),
      where: vi.fn(),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  });
  return {
    query: {
      forbiddenContentRule: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findFirst: vi.fn().mockResolvedValue({ banned: false }) },
      xpRewardBlock: { findFirst: vi.fn().mockResolvedValue(null) },
      xpRewardSubject: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(editedSubject)
          .mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue(laterDuplicates),
      },
    },
    select,
    update,
  } as unknown as Transaction;
}

describe("edited contribution eligibility", () => {
  it("reverses a posted review milestone when the edit becomes ineligible", async () => {
    const tx = createEditedContributionTransaction(subject);

    await reconcileEditedReviewRewardsInTransaction(tx, {
      ...review,
      review: "Demasiado corta",
    });

    expect(progression.cancelledPending).toContainEqual(
      expect.objectContaining({ subjectId: subject.id })
    );
    expect(progression.calls).toContainEqual(
      expect.objectContaining({
        amount: -25,
        reasonCode: "review_ineligible",
        reversesEventId: "xp-posted",
      })
    );
  });

  it("reverses a posted comment milestone when the edit becomes ineligible", async () => {
    const tx = createEditedContributionTransaction(commentSubject);

    await reconcileEditedCommentRewardsInTransaction(tx, {
      ...commentSnapshot,
      content: "Muy corto",
    });

    expect(progression.calls).toContainEqual(
      expect.objectContaining({
        amount: -25,
        reasonCode: "comment_ineligible",
        reversesEventId: "xp-posted",
      })
    );
  });

  it("reverses later rewarded duplicates when an earlier edit becomes canonical", async () => {
    const later = {
      ...subject,
      createdAt: new Date("2026-08-08T13:00:00.000Z"),
      entityId: "rating-2",
      id: "subject-2",
    };

    await reconcileEditedReviewRewardsInTransaction(
      createEditedContributionTransaction(subject, [later]),
      review
    );

    expect(progression.calls).toContainEqual(
      expect.objectContaining({
        reasonCode: "review_ineligible",
        subjectId: later.id,
      })
    );
  });
});
const commentSubject = {
  ...subject,
  createdAt: commentSnapshot.createdAt,
  entityId: commentSnapshot.id,
  id: "comment-subject-1",
  kind: "comment",
  normalizedContentHash: getContributionContentHash(commentText),
} satisfies typeof xpRewardSubject.$inferSelect;

function createSettlementTransaction(options?: {
  duplicate?: boolean;
  events?: Record<string, unknown>[];
}) {
  const subjectFindFirst = vi
    .fn()
    .mockResolvedValueOnce(subject)
    .mockResolvedValueOnce(options?.duplicate ? { id: "older" } : null);
  const lock = vi.fn().mockResolvedValue([{ id: subject.id }]);
  const select = vi.fn((shape: Record<string, unknown>) => {
    if ("amount" in shape && options?.events) {
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(options.events),
        }),
      };
    }
    if ("authorBanned" in shape) {
      const chain = {
        from: vi.fn(),
        innerJoin: vi.fn(),
        limit: vi.fn().mockResolvedValue([{ authorBanned: false, ...review }]),
        where: vi.fn(),
      };
      chain.from.mockReturnValue(chain);
      chain.innerJoin.mockReturnValue(chain);
      chain.where.mockReturnValue(chain);
      return chain;
    }
    if (Object.keys(shape).length === 1 && "id" in shape) {
      const chain = { for: lock, from: vi.fn(), where: vi.fn() };
      chain.from.mockReturnValue(chain);
      chain.where.mockReturnValue(chain);
      return chain;
    }
    if (Object.keys(shape).length === 1 && "createdAt" in shape) {
      const chain = {
        from: vi.fn(),
        limit: vi
          .fn()
          .mockResolvedValue(
            Array.from({ length: 10 }, () => ({ createdAt: new Date() }))
          ),
        where: vi.fn(),
      };
      chain.from.mockReturnValue(chain);
      chain.where.mockReturnValue(chain);
      return chain;
    }
    const chain = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn().mockImplementation(() =>
        Promise.resolve([
          {
            count:
              activation.date?.getTime() ===
              new Date("2026-08-15T00:00:00.000Z").getTime()
                ? 50
                : 100,
          },
        ])
      ),
    };
    chain.from.mockReturnValue(chain);
    chain.innerJoin.mockReturnValue(chain);
    return chain;
  });
  const tx = {
    query: {
      forbiddenContentRule: { findMany: vi.fn().mockResolvedValue([]) },
      xpRewardBlock: { findFirst: vi.fn().mockResolvedValue(null) },
      xpRewardSubject: { findFirst: subjectFindFirst },
    },
    select,
    update: vi.fn(),
  } as unknown as Transaction;
  return { lock, tx };
}

beforeEach(() => {
  activation.date = null;
  flags.accrual = true;
  progression.assessments = [];
  progression.assessmentDetails = [];
  progression.cancelledPending = [];
  progression.calls = [];
  progression.fail = false;
  progression.projectionMismatch = false;
  progression.replayed = false;
});

describe("Eligible Like", () => {
  const eligible = {
    authorUserId: "author-1",
    likeCreatedAt: new Date("2026-08-08T00:00:00.000Z"),
    likerBanned: false,
    likerCreatedAt: new Date("2026-08-01T00:00:00.000Z"),
    likerEmailVerified: true,
    likerUserId: "liker-1",
    xpAccrualEnabledAtCreation: true,
  };

  it("requires a distinct, currently verified and non-banned seven-day account", () => {
    expect(isEligibleLike(eligible)).toBe(true);
    expect(isEligibleLike({ ...eligible, likerUserId: "author-1" })).toBe(
      false
    );
    expect(isEligibleLike({ ...eligible, likerEmailVerified: false })).toBe(
      false
    );
    expect(isEligibleLike({ ...eligible, likerBanned: true })).toBe(false);
    expect(
      isEligibleLike({ ...eligible, xpAccrualEnabledAtCreation: false })
    ).toBe(false);
    expect(
      isEligibleLike({
        ...eligible,
        likerCreatedAt: new Date("2026-08-01T00:00:00.001Z"),
      })
    ).toBe(false);
  });

  it("requires the newly inserted like before creating a legacy subject", async () => {
    const ineligibleLike = {
      likeCreatedAt: new Date("2026-08-08T00:00:00.000Z"),
      likerBanned: false,
      likerCreatedAt: new Date("2026-07-01T00:00:00.000Z"),
      likerEmailVerified: false,
      likerUserId: "new-liker",
    };
    const createTx = () => {
      const query = {
        from: vi.fn(),
        innerJoin: vi.fn(),
        limit: vi.fn().mockResolvedValue([ineligibleLike]),
        where: vi.fn(),
      };
      query.from.mockReturnValue(query);
      query.innerJoin.mockReturnValue(query);
      query.where.mockReturnValue(query);
      return {
        insert: vi.fn(),
        query: {
          xpRewardSubject: { findFirst: vi.fn().mockResolvedValue(null) },
        },
        select: vi.fn().mockReturnValue(query),
      } as unknown as Transaction;
    };

    const reviewTx = createTx();
    await expect(
      saveReviewRewardSubjectInTransaction(reviewTx, review, "new-liker")
    ).resolves.toBeNull();
    expect(reviewTx.insert).not.toHaveBeenCalled();

    const commentTx = createTx();
    await expect(
      saveCommentRewardSubjectInTransaction(
        commentTx,
        commentSnapshot,
        "new-liker"
      )
    ).resolves.toBeNull();
    expect(commentTx.insert).not.toHaveBeenCalled();
  });

  it("requires an Eligible trigger for subjects created before activation", async () => {
    const ineligibleLike = {
      likeCreatedAt: new Date("2026-08-08T00:00:00.000Z"),
      likerBanned: false,
      likerCreatedAt: new Date("2026-07-01T00:00:00.000Z"),
      likerEmailVerified: false,
      likerUserId: "ineligible-liker",
    };
    const query = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      limit: vi.fn().mockResolvedValue([ineligibleLike]),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.where.mockReturnValue(query);
    const legacyTx = {
      query: {
        xpRewardSubject: { findFirst: vi.fn().mockResolvedValue(subject) },
      },
      select: vi.fn().mockReturnValue(query),
    } as unknown as Transaction;

    await expect(
      saveReviewRewardSubjectInTransaction(legacyTx, review, "ineligible-liker")
    ).resolves.toBeNull();

    activation.date = subject.createdAt;
    await expect(
      saveReviewRewardSubjectInTransaction(legacyTx, review, "ineligible-liker")
    ).resolves.toBeNull();

    activation.date = new Date("2026-08-01T00:00:00.000Z");
    const activeTx = {
      query: {
        xpRewardSubject: { findFirst: vi.fn().mockResolvedValue(subject) },
      },
      select: vi.fn(),
    } as unknown as Transaction;
    await expect(
      saveReviewRewardSubjectInTransaction(activeTx, review, "ineligible-liker")
    ).resolves.toEqual(subject);
    expect(activeTx.select).not.toHaveBeenCalled();
  });
});

describe("banned liker reconciliation", () => {
  it("reverses milestones that no longer have enough eligible likes", async () => {
    const select = vi.fn((shape: Record<string, unknown>) => {
      if (Object.keys(shape).length === 1 && "id" in shape) {
        const chain = {
          for: vi.fn().mockResolvedValue([{ id: subject.id }]),
          from: vi.fn(),
          where: vi.fn(),
        };
        chain.from.mockReturnValue(chain);
        chain.where.mockReturnValue(chain);
        return chain;
      }
      return {
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(
              "count" in shape
                ? [{ count: 2 }]
                : [
                    {
                      amount: 25,
                      id: "milestone-3",
                      kind: "review_milestone",
                      milestone: 3,
                      reversesEventId: null,
                    },
                  ]
            ),
          }),
          where: vi.fn().mockResolvedValue(
            "count" in shape
              ? [{ count: 2 }]
              : [
                  {
                    amount: 25,
                    id: "milestone-3",
                    kind: "review_milestone",
                    milestone: 3,
                    reversesEventId: null,
                  },
                ]
          ),
        }),
      };
    });
    const tx = {
      execute: vi.fn().mockResolvedValue({ rows: [subject] }),
      select,
    } as unknown as Transaction;
    const db = {
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Database;

    await reconcileBannedLikerRewards(db, {
      actorUserId: "owner-1",
      likerUserId: "banned-liker",
      now: new Date("2026-08-10T00:00:00.000Z"),
    });

    expect(progression.calls).toContainEqual(
      expect.objectContaining({
        amount: -25,
        reasonCode: "eligible_liker_banned",
        reversesEventId: "milestone-3",
      })
    );
  });
});

describe("review milestone settlement", () => {
  beforeEach(() => {
    activation.date = new Date("2026-08-01T00:00:00.000Z");
  });

  it("locks the subject and grants every reached milestone once", async () => {
    const { lock, tx } = createSettlementTransaction();

    await expect(
      settleReviewMilestonesInTransaction(tx, review.id)
    ).resolves.toMatchObject({ eligibleLikes: 100, grantedXp: 775 });
    expect(lock).toHaveBeenCalledWith("update");
    expect(
      progression.calls.map(({ amount, idempotencyKey, milestone }) => ({
        amount,
        idempotencyKey,
        milestone,
      }))
    ).toEqual([
      {
        amount: 25,
        idempotencyKey: "review-milestone:subject-1:3",
        milestone: 3,
      },
      {
        amount: 50,
        idempotencyKey: "review-milestone:subject-1:10",
        milestone: 10,
      },
      {
        amount: 100,
        idempotencyKey: "review-milestone:subject-1:25",
        milestone: 25,
      },
      {
        amount: 200,
        idempotencyKey: "review-milestone:subject-1:50",
        milestone: 50,
      },
      {
        amount: 400,
        idempotencyKey: "review-milestone:subject-1:100",
        milestone: 100,
      },
    ]);
    expect(progression.assessments).toEqual([
      "low",
      "low",
      "low",
      "low",
      "low",
    ]);
  });

  it("holds milestone awards when the triggering liker has burst activity", async () => {
    await expect(
      settleReviewMilestonesInTransaction(
        createSettlementTransaction().tx,
        review.id,
        new Date("2026-08-10T12:00:00.000Z"),
        "liker-1",
        { deviceHash: "device-hash", ipPrefixHash: "ip-hash" }
      )
    ).resolves.toMatchObject({ grantedXp: 0 });

    expect(progression.assessments).toEqual([
      "medium",
      "medium",
      "medium",
      "medium",
      "medium",
    ]);
    expect(progression.assessmentDetails[0]).toMatchObject({
      correlation: { deviceHash: "device-hash", ipPrefixHash: "ip-hash" },
      signals: [{ kind: "like_toggle_velocity" }],
    });
  });

  it("pauses duplicate content and treats replayed milestones as settled", async () => {
    await expect(
      settleReviewMilestonesInTransaction(
        createSettlementTransaction({ duplicate: true }).tx,
        review.id
      )
    ).resolves.toMatchObject({ grantedXp: 0 });
    expect(progression.calls).toHaveLength(0);

    progression.replayed = true;
    await expect(
      settleReviewMilestonesInTransaction(
        createSettlementTransaction().tx,
        review.id
      )
    ).resolves.toMatchObject({ eligibleLikes: 100, grantedXp: 0 });
  });

  it("does not scan legacy likes while accrual is disabled", async () => {
    flags.accrual = false;
    await expect(
      settleReviewMilestonesInTransaction(
        createSettlementTransaction().tx,
        review.id
      )
    ).resolves.toMatchObject({ eligibleLikes: 0, grantedXp: 0 });
    expect(progression.calls).toHaveLength(0);
  });

  it("counts only likes received on or after progression activation", async () => {
    activation.date = new Date("2026-08-15T00:00:00.000Z");

    await expect(
      settleReviewMilestonesInTransaction(
        createSettlementTransaction().tx,
        review.id,
        new Date("2026-08-20T00:00:00.000Z")
      )
    ).resolves.toMatchObject({ eligibleLikes: 50, grantedXp: 375 });
    expect(progression.calls.map(({ milestone }) => milestone)).toEqual([
      3, 10, 25, 50,
    ]);
  });

  it("excludes pre-activation likes when integrity recomputes milestones", async () => {
    activation.date = new Date("2026-08-15T00:00:00.000Z");
    const { tx } = createSettlementTransaction({
      events: [
        {
          amount: 400,
          id: "milestone-100",
          kind: "review_milestone",
          milestone: 100,
          reversesEventId: null,
        },
      ],
    });
    tx.query.xpRewardSubject.findFirst = vi.fn().mockResolvedValue(subject);

    await reverseUnsupportedContributionMilestonesInTransaction(tx, {
      actorUserId: "owner-1",
      integrityCaseId: "case-1",
      now: new Date("2026-08-20T00:00:00.000Z"),
      subjectId: subject.id,
    });

    expect(progression.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idempotencyKey: expect.stringContaining("integrity-like-reversal"),
        }),
      ])
    );
  });
});

function createCommentSettlementTransaction(
  content = commentText,
  duplicate = false
) {
  const subjectFindFirst = vi
    .fn()
    .mockResolvedValueOnce({
      ...commentSubject,
      normalizedContentHash: getContributionContentHash(content),
    })
    .mockResolvedValueOnce(duplicate ? { id: "older-comment" } : null);
  const lock = vi.fn().mockResolvedValue([{ id: commentSubject.id }]);
  const select = vi.fn((shape: Record<string, unknown>) => {
    if ("authorBanned" in shape) {
      const chain = {
        from: vi.fn(),
        innerJoin: vi.fn(),
        limit: vi
          .fn()
          .mockResolvedValue([
            { authorBanned: false, ...commentSnapshot, content },
          ]),
        where: vi.fn(),
      };
      chain.from.mockReturnValue(chain);
      chain.innerJoin.mockReturnValue(chain);
      chain.where.mockReturnValue(chain);
      return chain;
    }
    if (Object.keys(shape).length === 1 && "id" in shape) {
      const chain = { for: lock, from: vi.fn(), where: vi.fn() };
      chain.from.mockReturnValue(chain);
      chain.where.mockReturnValue(chain);
      return chain;
    }
    const chain = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      where: vi.fn().mockResolvedValue([{ count: 100 }]),
    };
    chain.from.mockReturnValue(chain);
    chain.innerJoin.mockReturnValue(chain);
    return chain;
  });
  return {
    lock,
    tx: {
      query: {
        forbiddenContentRule: { findMany: vi.fn().mockResolvedValue([]) },
        xpRewardBlock: { findFirst: vi.fn().mockResolvedValue(null) },
        xpRewardSubject: { findFirst: subjectFindFirst },
      },
      select,
      update: vi.fn(),
    } as unknown as Transaction,
  };
}

describe("comment milestone settlement", () => {
  beforeEach(() => {
    activation.date = new Date("2026-08-01T00:00:00.000Z");
  });

  it("requires 40 normalized characters and grants each milestone once", async () => {
    const thresholdText = "Comentario aporta detalles concretos hoy";
    await expect(
      settleCommentMilestonesInTransaction(
        createCommentSettlementTransaction(thresholdText.slice(0, 39)).tx,
        commentSnapshot.id
      )
    ).resolves.toMatchObject({ grantedXp: 0 });

    const { lock, tx } = createCommentSettlementTransaction(thresholdText);
    await expect(
      settleCommentMilestonesInTransaction(tx, commentSnapshot.id)
    ).resolves.toMatchObject({ eligibleLikes: 100, grantedXp: 310 });
    expect(lock).toHaveBeenCalledWith("update");
    expect(
      progression.calls.map(({ amount, idempotencyKey, milestone }) => ({
        amount,
        idempotencyKey,
        milestone,
      }))
    ).toEqual([
      {
        amount: 10,
        idempotencyKey: "comment-milestone:comment-subject-1:2",
        milestone: 2,
      },
      {
        amount: 20,
        idempotencyKey: "comment-milestone:comment-subject-1:10",
        milestone: 10,
      },
      {
        amount: 40,
        idempotencyKey: "comment-milestone:comment-subject-1:25",
        milestone: 25,
      },
      {
        amount: 80,
        idempotencyKey: "comment-milestone:comment-subject-1:50",
        milestone: 50,
      },
      {
        amount: 160,
        idempotencyKey: "comment-milestone:comment-subject-1:100",
        milestone: 100,
      },
    ]);
    expect(progression.assessments).toEqual([
      "low",
      "low",
      "low",
      "low",
      "low",
    ]);
  });

  it("pauses duplicates and does not replay previously crossed milestones", async () => {
    await expect(
      settleCommentMilestonesInTransaction(
        createCommentSettlementTransaction(commentText, true).tx,
        commentSnapshot.id
      )
    ).resolves.toMatchObject({ grantedXp: 0 });
    expect(progression.calls).toHaveLength(0);

    progression.replayed = true;
    await expect(
      settleCommentMilestonesInTransaction(
        createCommentSettlementTransaction().tx,
        commentSnapshot.id
      )
    ).resolves.toMatchObject({ eligibleLikes: 100, grantedXp: 0 });
  });

  it("does not activate legacy likes while accrual is disabled", async () => {
    flags.accrual = false;
    await expect(
      settleCommentMilestonesInTransaction(
        createCommentSettlementTransaction().tx,
        commentSnapshot.id
      )
    ).resolves.toMatchObject({ eligibleLikes: 0, grantedXp: 0 });
    expect(progression.calls).toHaveLength(0);
  });
});

describe("review daily cap", () => {
  it.each([
    [0, true],
    [1, true],
    [2, false],
  ])("marks subject %i with eligibility %s", async (count, expected) => {
    const returning = vi.fn();
    const values = vi.fn((input: Record<string, unknown>) => {
      returning.mockResolvedValue([{ ...subject, ...input }]);
      return { returning };
    });
    const select = vi
      .fn()
      .mockReturnValueOnce({
        for: vi.fn().mockResolvedValue([{ id: review.userId }]),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count }]),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ count: 0 }]),
      });
    const tx = {
      insert: vi.fn().mockReturnValue({ values }),
      query: {
        xpRewardBlock: { findFirst: vi.fn().mockResolvedValue(null) },
        xpRewardSubject: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      select,
    } as unknown as Transaction;

    await saveReviewRewardSubjectInTransaction(tx, review);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ dailyCapEligible: expected })
    );
  });
});

describe("comment daily cap", () => {
  it.each([
    [4, true],
    [5, false],
  ])(
    "marks comment after %i earlier contributions as %s",
    async (count, expected) => {
      const returning = vi.fn();
      const values = vi.fn((input: Record<string, unknown>) => {
        returning.mockResolvedValue([{ ...commentSubject, ...input }]);
        return { returning };
      });
      const select = vi
        .fn()
        .mockReturnValueOnce({
          for: vi.fn().mockResolvedValue([{ id: commentSnapshot.userId }]),
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockReturnThis(),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([{ count }]),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnThis(),
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        });
      const tx = {
        insert: vi.fn().mockReturnValue({ values }),
        query: {
          xpRewardBlock: { findFirst: vi.fn().mockResolvedValue(null) },
          xpRewardSubject: { findFirst: vi.fn().mockResolvedValue(null) },
        },
        select,
      } as unknown as Transaction;

      await saveCommentRewardSubjectInTransaction(tx, commentSnapshot);
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ dailyCapEligible: expected, kind: "comment" })
      );
    }
  );

  it("reuses a legacy subject created while waiting for the author lock", async () => {
    const tx = {
      insert: vi.fn(),
      query: {
        xpRewardSubject: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(commentSubject),
        },
      },
      select: vi.fn().mockReturnValue({
        for: vi.fn().mockResolvedValue([{ id: commentSnapshot.userId }]),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
      }),
    } as unknown as Transaction;

    await expect(
      saveCommentRewardSubjectInTransaction(tx, commentSnapshot)
    ).resolves.toMatchObject({ id: commentSubject.id });
    expect(tx.insert).not.toHaveBeenCalled();
  });
});

function createDeletionDatabase(reason: "guideline_abuse" | "voluntary") {
  const subjectUpdateValues: Record<string, unknown>[] = [];
  const deletedReview = vi.fn().mockResolvedValue(null);
  const insertedBlock = vi.fn().mockResolvedValue(null);
  const tx = {
    delete: vi.fn().mockReturnValue({ where: deletedReview }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoNothing: insertedBlock }),
    }),
    query: {
      xpRewardSubject: { findFirst: vi.fn().mockResolvedValue(subject) },
    },
    select: vi.fn((shape: Record<string, unknown>) => {
      if (Object.keys(shape).length === 1) {
        const chain = {
          for: vi.fn().mockResolvedValue([{ id: review.id }]),
          from: vi.fn(),
          where: vi.fn(),
        };
        chain.from.mockReturnValue(chain);
        chain.where.mockReturnValue(chain);
        return chain;
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              amount: 25,
              id: "xp-3",
              kind: "review_milestone",
              milestone: 3,
              reversesEventId: null,
            },
            {
              amount: 50,
              id: "xp-10",
              kind: "review_milestone",
              milestone: 10,
              reversesEventId: null,
            },
          ]),
        }),
      };
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn((values: Record<string, unknown>) => {
        subjectUpdateValues.push(values);
        return { where: vi.fn().mockResolvedValue(null) };
      }),
    }),
  };
  const db = {
    transaction: vi.fn((callback) => callback(tx)),
  } as unknown as Database;
  return { db, deletedReview, insertedBlock, reason, subjectUpdateValues };
}

describe("review removal lifecycle", () => {
  it.each(["voluntary", "guideline_abuse"] as const)(
    "atomically reverses %s removal and permanently blocks abuse",
    async (reason) => {
      const store = createDeletionDatabase(reason);
      await expect(
        deleteReviewWithRewards(store.db, {
          actorUserId: reason === "guideline_abuse" ? "moderator-1" : undefined,
          postId: review.postId,
          reason,
          userId: review.userId,
        })
      ).resolves.toEqual({ reversedXp: 75 });

      expect(
        progression.calls.map(({ amount, reversesEventId }) => ({
          amount,
          reversesEventId,
        }))
      ).toEqual([
        { amount: -25, reversesEventId: "xp-3" },
        { amount: -50, reversesEventId: "xp-10" },
      ]);
      expect(store.subjectUpdateValues).toContainEqual(
        expect.objectContaining({ deletionReason: reason })
      );
      expect(store.deletedReview).toHaveBeenCalledOnce();
      expect(store.insertedBlock).toHaveBeenCalledTimes(
        reason === "guideline_abuse" ? 1 : 0
      );
    }
  );

  it("does not delete the review when downstream reward reversal fails", async () => {
    progression.fail = true;
    const store = createDeletionDatabase("voluntary");

    await expect(
      deleteReviewWithRewards(store.db, {
        postId: review.postId,
        reason: "voluntary",
        userId: review.userId,
      })
    ).rejects.toThrow("atomic progression failure");
    expect(store.deletedReview).not.toHaveBeenCalled();
  });

  it("does not delete the review when reward reversal finds a projection mismatch", async () => {
    progression.projectionMismatch = true;
    const store = createDeletionDatabase("voluntary");

    await expect(
      deleteReviewWithRewards(store.db, {
        postId: review.postId,
        reason: "voluntary",
        userId: review.userId,
      })
    ).rejects.toThrow("XP_PROJECTION_MISMATCH");
    expect(store.deletedReview).not.toHaveBeenCalled();
    expect(store.subjectUpdateValues).toHaveLength(0);
  });

  it("cancels pending milestone XP before deleting its reward subject", async () => {
    const store = createDeletionDatabase("voluntary");

    await deleteReviewWithRewards(store.db, {
      postId: review.postId,
      reason: "voluntary",
      userId: review.userId,
    });

    expect(progression.cancelledPending).toEqual([
      expect.objectContaining({ subjectId: subject.id }),
    ]);
    expect(store.deletedReview).toHaveBeenCalledOnce();
  });

  it("marks parent removals, cancels Pending XP, and preserves posted XP", async () => {
    const affected = [{ id: "subject-1" }, { id: "subject-2" }];
    const select = vi.fn(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(affected),
      }),
    }));
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(null),
    });
    const tx = {
      select,
      update: vi.fn().mockReturnValue({ set }),
    } as unknown as Transaction;

    await markParentPostContributionSubjectsRemovedInTransaction(
      tx,
      review.postId,
      new Date("2026-08-08T00:00:00.000Z")
    );
    expect(set).toHaveBeenCalledWith({
      deletedAt: new Date("2026-08-08T00:00:00.000Z"),
      deletionReason: "parent_removed",
    });
    expect(progression.cancelledPending).toEqual(
      affected.map(({ id }) =>
        expect.objectContaining({ closeEmptyCases: true, subjectId: id })
      )
    );
    expect(progression.calls).toHaveLength(0);
  });
});

describe("comment removal lifecycle", () => {
  it("reverses the target, preserves replies, and blocks guideline abuse", async () => {
    const deletedComment = vi.fn().mockResolvedValue(null);
    const insertedBlock = vi.fn().mockResolvedValue(null);
    const subjectUpdates: Record<string, unknown>[] = [];
    const select = vi.fn((shape: Record<string, unknown>) => {
      if ("userId" in shape) {
        const chain = {
          for: vi
            .fn()
            .mockResolvedValue([
              { id: commentSnapshot.id, userId: commentSnapshot.userId },
            ]),
          from: vi.fn(),
          where: vi.fn(),
        };
        chain.from.mockReturnValue(chain);
        chain.where.mockReturnValue(chain);
        return chain;
      }
      if ("amount" in shape) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                amount: 10,
                id: "comment-xp-2",
                kind: "comment_milestone",
                milestone: 2,
                reversesEventId: null,
              },
            ]),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: "reply-1" }]),
        }),
      };
    });
    const tx = {
      delete: vi.fn().mockReturnValue({ where: deletedComment }),
      execute: vi.fn().mockResolvedValue({
        rows: [{ id: "reply-subject" }, { id: "nested-subject" }],
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({ onConflictDoNothing: insertedBlock }),
      }),
      query: {
        xpRewardSubject: {
          findFirst: vi.fn().mockResolvedValue(commentSubject),
        },
      },
      select,
      update: vi.fn().mockReturnValue({
        set: vi.fn((values: Record<string, unknown>) => {
          subjectUpdates.push(values);
          return { where: vi.fn().mockResolvedValue(null) };
        }),
      }),
    };
    const db = {
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Database;

    await expect(
      deleteCommentWithRewards(db, {
        actorUserId: "moderator-1",
        commentId: commentSnapshot.id,
        reason: "guideline_abuse",
      })
    ).resolves.toEqual({ reversedXp: 10 });
    expect(progression.calls).toContainEqual(
      expect.objectContaining({
        amount: -10,
        reversesEventId: "comment-xp-2",
      })
    );
    expect(subjectUpdates).toContainEqual(
      expect.objectContaining({ deletionReason: "parent_removed" })
    );
    expect(subjectUpdates).toContainEqual(
      expect.objectContaining({ deletionReason: "guideline_abuse" })
    );
    expect(insertedBlock).toHaveBeenCalledOnce();
    expect(deletedComment).toHaveBeenCalledOnce();
    expect(progression.cancelledPending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subjectId: "reply-subject" }),
        expect.objectContaining({ subjectId: "nested-subject" }),
      ])
    );
  });
});
