import { call } from "@orpc/server";

import postRouter from ".";
import type { Context } from "../../context";

const rewards = vi.hoisted(() => ({
  isContributionLikerEligibleInTransaction: vi.fn(),
  lockContributionParticipantsInTransaction: vi.fn(),
  notifyXpSettlementInTransaction: vi.fn(),
  reconcileEditedCommentRewardsInTransaction: vi.fn(),
  reconcileRemovedContributionLikeInTransaction: vi.fn(),
  runContributionRewardTransaction: vi.fn(),
  saveCommentRewardSubjectInTransaction: vi.fn(),
  settleCommentMilestonesInTransaction: vi.fn(),
}));
const streak = vi.hoisted(() => ({
  applyStreakEvidenceInTransaction: vi.fn(),
}));
const bans = vi.hoisted(() => ({
  userIsNotActivelyBanned: vi.fn(),
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
vi.mock("../../services/contribution-rewards", () => ({
  deleteCommentWithRewards: vi.fn(),
  getCommentDeletionWarning: vi.fn(),
  isContributionLikerEligibleInTransaction:
    rewards.isContributionLikerEligibleInTransaction,
  lockContributionParticipantsInTransaction:
    rewards.lockContributionParticipantsInTransaction,
  reconcileEditedCommentRewardsInTransaction:
    rewards.reconcileEditedCommentRewardsInTransaction,
  reconcileRemovedContributionLikeInTransaction:
    rewards.reconcileRemovedContributionLikeInTransaction,
  runContributionRewardTransaction: rewards.runContributionRewardTransaction,
  saveCommentRewardSubjectInTransaction:
    rewards.saveCommentRewardSubjectInTransaction,
  settleCommentMilestonesInTransaction:
    rewards.settleCommentMilestonesInTransaction,
}));
vi.mock("../../services/progression", () => ({
  notifyXpSettlement: vi.fn(),
  notifyXpSettlementInTransaction: rewards.notifyXpSettlementInTransaction,
}));
vi.mock("../../services/streak", () => streak);
vi.mock("../../utils/user-ban", () => ({
  userIsNotActivelyBanned: bans.userIsNotActivelyBanned,
}));

function createContext({
  parentAuthorId = "recipient-1",
  replyNotificationsEnabled = true,
}: {
  parentAuthorId?: string;
  replyNotificationsEnabled?: boolean;
} = {}) {
  const insertedValues: Record<string, unknown>[] = [];
  const insert = vi.fn(() => ({
    values: vi.fn((values: Record<string, unknown>) => {
      insertedValues.push(values);

      return {
        returning: vi.fn().mockResolvedValue([
          "type" in values
            ? { id: "notification-1" }
            : {
                content: values.content,
                createdAt: new Date("2026-08-07T12:00:00.000Z"),
                id: "reply-1",
                postId: values.postId,
                userId: values.authorId,
              },
        ]),
      };
    }),
  }));
  const tx = {
    insert,
    query: {
      profileSettings: {
        findFirst: vi.fn().mockResolvedValue({ replyNotificationsEnabled }),
      },
    },
  };
  const limit = vi.fn().mockResolvedValue([
    {
      authorId: parentAuthorId,
      id: "parent-1",
      parentId: null,
      postId: "post-1",
    },
  ]);
  const db = {
    query: {
      forbiddenContentRule: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      patron: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      post: {
        findFirst: vi.fn().mockResolvedValue({
          earlyAccessEnabled: false,
          earlyAccessStartedAt: null,
          releasedAt: new Date("2026-08-01T12:00:00.000Z"),
          status: "publish",
          title: "Publicación de prueba",
          type: "post",
          vip12EarlyAccessHours: 0,
          vip8EarlyAccessHours: 0,
        }),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({ limit })),
        })),
      })),
    })),
    transaction: vi.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
    ),
  };

  return {
    context: {
      db,
      headers: new Headers(),
      session: {
        user: {
          id: "author-1",
          name: "Usuario de prueba",
          role: "user",
        },
      },
    } as unknown as Context,
    db,
    insertedValues,
  };
}

describe("comment reply notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rewards.runContributionRewardTransaction.mockImplementation(
      (db, callback) => db.transaction(callback)
    );
    rewards.settleCommentMilestonesInTransaction.mockResolvedValue({
      settlements: [],
    });
  });

  it("delivers a direct notification with an exact reply destination", async () => {
    const { context, insertedValues } = createContext();

    await call(
      postRouter.createComment,
      {
        content: "Una respuesta válida",
        parentId: "parent-1",
        postId: "post-1",
      },
      { context }
    );

    expect(insertedValues).toContainEqual(
      expect.objectContaining({
        metadata: {
          category: "comment_reply",
          commentId: "reply-1",
          linkPath: "/post/post-1#comment-reply-1",
          parentCommentId: "parent-1",
        },
        sourceUserId: "author-1",
        targetContentId: "post-1",
        title: "Usuario de prueba respondió a tu comentario",
        type: "system",
      })
    );
    expect(insertedValues).toContainEqual({
      audienceType: "user",
      notificationId: "notification-1",
      targetContentId: undefined,
      targetUserId: "recipient-1",
    });
  });

  it("does not notify users about their own replies", async () => {
    const { context, insertedValues } = createContext({
      parentAuthorId: "author-1",
    });

    await call(
      postRouter.createComment,
      {
        content: "Una respuesta propia",
        parentId: "parent-1",
        postId: "post-1",
      },
      { context }
    );

    expect(insertedValues).toHaveLength(1);
  });

  it("does not deliver replies received while the preference is disabled", async () => {
    const { context, insertedValues } = createContext({
      replyNotificationsEnabled: false,
    });

    await call(
      postRouter.createComment,
      {
        content: "Una respuesta válida",
        parentId: "parent-1",
        postId: "post-1",
      },
      { context }
    );

    expect(insertedValues).toHaveLength(1);
  });

  it("records top-level comments and replies through the same reward seam", async () => {
    const { context } = createContext();

    await call(
      postRouter.createComment,
      {
        content: "Una respuesta suficientemente sustantiva para recompensas",
        parentId: "parent-1",
        postId: "post-1",
      },
      { context }
    );

    expect(rewards.saveCommentRewardSubjectInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: "Una respuesta suficientemente sustantiva para recompensas",
        id: "reply-1",
        postId: "post-1",
        userId: "author-1",
      })
    );
    expect(streak.applyStreakEvidenceInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "contribution",
        source: { id: "reply-1", kind: "comment" },
        userId: "author-1",
      }),
      expect.any(Date)
    );
  });

  it("rejects comments on unpublished content before creating streak evidence", async () => {
    const { context, db } = createContext();
    db.query.post.findFirst.mockResolvedValueOnce({
      earlyAccessEnabled: false,
      earlyAccessStartedAt: null,
      releasedAt: new Date("2026-08-01T12:00:00.000Z"),
      status: "draft",
      title: "Borrador privado",
      type: "post",
      vip12EarlyAccessHours: 0,
      vip8EarlyAccessHours: 0,
    });

    await expect(
      call(
        postRouter.createComment,
        {
          content: "Un comentario suficientemente largo para una Racha.",
          postId: "post-1",
        },
        { context }
      )
    ).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(streak.applyStreakEvidenceInTransaction).not.toHaveBeenCalled();
  });
});

describe("comment edit reward reconciliation", () => {
  it("signals a public profile change when the edit lowers Account Level", async () => {
    rewards.reconcileEditedCommentRewardsInTransaction.mockResolvedValueOnce({
      settlements: [{ level: 1, previousLevel: 2, replayed: false }],
    });
    const returning = vi.fn().mockResolvedValue([
      {
        content: "Contenido editado válido",
        createdAt: new Date("2026-08-07T12:00:00.000Z"),
        id: "comment-1",
        postId: "post-1",
        userId: "author-1",
      },
    ]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const tx = { update: vi.fn().mockReturnValue({ set }) };
    const context = {
      db: {
        query: {
          comment: {
            findFirst: vi.fn().mockResolvedValue({
              authorId: "author-1",
              id: "comment-1",
            }),
          },
          forbiddenContentRule: { findMany: vi.fn().mockResolvedValue([]) },
          patron: { findFirst: vi.fn().mockResolvedValue(null) },
        },
        transaction: vi.fn((callback) => callback(tx)),
      },
      headers: new Headers(),
      session: { user: { id: "author-1", role: "user" } },
    } as unknown as Context;

    await expect(
      call(
        postRouter.editOwnComment,
        { commentId: "comment-1", content: "Contenido editado válido" },
        { context }
      )
    ).resolves.toEqual({
      profileUserId: "author-1",
      publicProfileChanged: true,
      success: true,
    });
    expect(
      rewards.lockContributionParticipantsInTransaction
    ).toHaveBeenCalledWith(tx, ["author-1"]);
    expect(
      rewards.lockContributionParticipantsInTransaction.mock
        .invocationCallOrder[0]
    ).toBeLessThan(set.mock.invocationCallOrder[0]!);
    expect(rewards.notifyXpSettlementInTransaction).toHaveBeenCalledWith(
      tx,
      "author-1",
      expect.objectContaining({ level: 1, previousLevel: 2, replayed: false })
    );
  });
});

describe("comment reward likes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rewards.runContributionRewardTransaction.mockImplementation(
      (db, callback) => db.transaction(callback)
    );
    rewards.lockContributionParticipantsInTransaction.mockImplementation(() =>
      Promise.resolve()
    );
    rewards.isContributionLikerEligibleInTransaction.mockResolvedValue(true);
    rewards.reconcileRemovedContributionLikeInTransaction.mockResolvedValue({
      settlements: [],
    });
    rewards.settleCommentMilestonesInTransaction.mockResolvedValue({
      settlements: [],
    });
  });

  it("settles milestones only when a like row is newly inserted", async () => {
    const settlement = {
      level: 2,
      previousLevel: 1,
      replayed: false,
      settledXp: 20,
    };
    rewards.settleCommentMilestonesInTransaction.mockResolvedValue({
      settlements: [settlement],
    });
    const query = {
      for: vi.fn(),
      from: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      limit: vi.fn().mockResolvedValue([
        {
          authorId: "comment-author",
          earlyAccessEnabled: false,
          earlyAccessStartedAt: null,
          id: "comment-1",
          postId: "post-1",
          releasedAt: null,
          status: "publish",
          type: "post",
          vip12EarlyAccessHours: 0,
          vip8EarlyAccessHours: 0,
        },
      ]),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.for.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.leftJoin.mockReturnValue(query);
    query.where.mockReturnValue(query);
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ commentId: "comment-1" }])
      .mockResolvedValueOnce([]);
    const values = vi.fn().mockReturnValue({
      onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
    });
    const tx = {
      insert: vi.fn().mockReturnValue({
        values,
      }),
      select: vi.fn().mockReturnValue(query),
    };
    const context = {
      db: {
        ...tx,
        query: { patron: { findFirst: vi.fn().mockResolvedValue(null) } },
        transaction: vi.fn((callback) => callback(tx)),
      },
      headers: new Headers(),
      session: {
        user: { emailVerified: true, id: "liker-1", role: "user" },
      },
    } as unknown as Context;

    await call(
      postRouter.toggleCommentLike,
      { commentId: "comment-1", liked: true },
      { context }
    );
    await call(
      postRouter.toggleCommentLike,
      { commentId: "comment-1", liked: true },
      { context }
    );

    expect(rewards.settleCommentMilestonesInTransaction).toHaveBeenCalledWith(
      tx,
      "comment-1",
      expect.any(Date),
      "liker-1",
      { deviceHash: null, ipPrefixHash: null }
    );
    expect(rewards.settleCommentMilestonesInTransaction).toHaveBeenCalledOnce();
    expect(rewards.notifyXpSettlementInTransaction).toHaveBeenCalledOnce();
    expect(rewards.notifyXpSettlementInTransaction).toHaveBeenCalledWith(
      tx,
      "comment-author",
      settlement
    );
    expect(
      rewards.lockContributionParticipantsInTransaction
    ).toHaveBeenCalledWith(tx, ["liker-1", "comment-author"]);
    expect(
      rewards.lockContributionParticipantsInTransaction.mock
        .invocationCallOrder[0]
    ).toBeLessThan(values.mock.invocationCallOrder[0]!);
    expect(
      rewards.isContributionLikerEligibleInTransaction
    ).toHaveBeenCalledWith(tx, "liker-1", expect.any(Date));
    expect(
      rewards.lockContributionParticipantsInTransaction.mock
        .invocationCallOrder[0]
    ).toBeLessThan(
      rewards.isContributionLikerEligibleInTransaction.mock
        .invocationCallOrder[0]!
    );
    expect(
      rewards.isContributionLikerEligibleInTransaction.mock
        .invocationCallOrder[0]
    ).toBeLessThan(values.mock.invocationCallOrder[0]!);
    expect(values).toHaveBeenCalledWith({
      commentId: "comment-1",
      createdAt: expect.any(Date),
      emailVerifiedAtCreation: true,
      userId: "liker-1",
      xpAccrualEnabledAtCreation: false,
    });
    expect(bans.userIsNotActivelyBanned).toHaveBeenCalledWith(expect.any(Date));
  });

  it("reconciles unsupported milestones after removing a like", async () => {
    const query = {
      for: vi.fn(),
      from: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      limit: vi.fn().mockResolvedValue([
        {
          authorId: "comment-author",
          earlyAccessEnabled: false,
          earlyAccessStartedAt: null,
          id: "comment-1",
          postId: "post-1",
          releasedAt: null,
          status: "publish",
          type: "post",
          vip12EarlyAccessHours: 0,
          vip8EarlyAccessHours: 0,
        },
      ]),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.for.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.leftJoin.mockReturnValue(query);
    query.where.mockReturnValue(query);
    const returning = vi.fn().mockResolvedValue([{ commentId: "comment-1" }]);
    const deleteWhere = vi.fn().mockReturnValue({ returning });
    const tx = {
      delete: vi.fn().mockReturnValue({ where: deleteWhere }),
      select: vi.fn().mockReturnValue(query),
    };
    const context = {
      db: {
        ...tx,
        query: { patron: { findFirst: vi.fn().mockResolvedValue(null) } },
        transaction: vi.fn((callback) => callback(tx)),
      },
      headers: new Headers(),
      session: {
        user: { emailVerified: true, id: "liker-1", role: "user" },
      },
    } as unknown as Context;

    await call(
      postRouter.toggleCommentLike,
      { commentId: "comment-1", liked: false },
      { context }
    );

    expect(returning).toHaveBeenCalledOnce();
    expect(
      rewards.reconcileRemovedContributionLikeInTransaction
    ).toHaveBeenCalledWith(tx, {
      actorUserId: "liker-1",
      entityId: "comment-1",
      kind: "comment",
      now: expect.any(Date),
    });
  });

  it("rejects a like when the comment's parent post is not viewable", async () => {
    const query = {
      for: vi.fn(),
      from: vi.fn(),
      innerJoin: vi.fn(),
      leftJoin: vi.fn(),
      limit: vi.fn().mockResolvedValue([
        {
          authorId: "comment-author",
          earlyAccessEnabled: false,
          earlyAccessStartedAt: null,
          id: "comment-1",
          postId: "post-1",
          releasedAt: null,
          status: "draft",
          type: "post",
          vip12EarlyAccessHours: 0,
          vip8EarlyAccessHours: 0,
        },
      ]),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.for.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.leftJoin.mockReturnValue(query);
    query.where.mockReturnValue(query);
    const insert = vi.fn();
    const tx = { insert, select: vi.fn().mockReturnValue(query) };
    const context = {
      db: {
        ...tx,
        query: { patron: { findFirst: vi.fn().mockResolvedValue(null) } },
        transaction: vi.fn((callback) => callback(tx)),
      },
      headers: new Headers(),
      session: {
        user: { emailVerified: true, id: "liker-1", role: "user" },
      },
    } as unknown as Context;

    await expect(
      call(
        postRouter.toggleCommentLike,
        { commentId: "comment-1", liked: true },
        { context }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(insert).not.toHaveBeenCalled();
  });
});
