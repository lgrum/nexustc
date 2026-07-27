import { call } from "@orpc/server";

import postRouter from ".";
import type { Context } from "../../context";

vi.mock("@orpc/experimental-pino", () => ({ getLogger: () => {} }));
vi.mock("@repo/auth", () => ({
  auth: {
    api: {
      userHasPermission: vi.fn().mockResolvedValue({ success: true }),
    },
  },
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
          {
            id: "type" in values ? "notification-1" : "reply-1",
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
});
