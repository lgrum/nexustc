import { call } from "@orpc/server";

import postRouter from ".";
import type { Context } from "../../context";

const rewards = vi.hoisted(() => ({
  saveCommentRewardSubjectInTransaction: vi.fn(),
  settleCommentMilestonesInTransaction: vi.fn(),
}));

vi.mock("@orpc/experimental-pino", () => ({ getLogger: () => {} }));
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
  saveCommentRewardSubjectInTransaction:
    rewards.saveCommentRewardSubjectInTransaction,
  settleCommentMilestonesInTransaction:
    rewards.settleCommentMilestonesInTransaction,
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
    insertedValues,
  };
}

describe("comment reply notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});

describe("comment reward likes", () => {
  it("settles milestones only when a like row is newly inserted", async () => {
    const query = {
      from: vi.fn(),
      innerJoin: vi.fn(),
      limit: vi
        .fn()
        .mockResolvedValue([{ authorId: "comment-author", id: "comment-1" }]),
      where: vi.fn(),
    };
    query.from.mockReturnValue(query);
    query.innerJoin.mockReturnValue(query);
    query.where.mockReturnValue(query);
    const returning = vi
      .fn()
      .mockResolvedValueOnce([{ commentId: "comment-1" }])
      .mockResolvedValueOnce([]);
    const tx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({ returning }),
        }),
      }),
      select: vi.fn().mockReturnValue(query),
    };
    const context = {
      db: {
        ...tx,
        transaction: vi.fn((callback) => callback(tx)),
      },
      headers: new Headers(),
      session: { user: { id: "liker-1", role: "user" } },
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
      "liker-1"
    );
    expect(rewards.settleCommentMilestonesInTransaction).toHaveBeenCalledOnce();
  });
});
