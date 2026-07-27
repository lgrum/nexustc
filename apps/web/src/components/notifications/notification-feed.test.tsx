import { render, screen } from "@testing-library/react";

import { NotificationFeedList } from "./notification-feed";

describe(NotificationFeedList, () => {
  it("presents comment replies and links to the exact reply", () => {
    render(
      <NotificationFeedList
        emptyCopy=""
        emptyTitle=""
        items={[
          {
            contentType: "post",
            description: "En Publicación de prueba.",
            id: "notification-1",
            imageObjectKey: null,
            isRead: false,
            metadata: {
              category: "comment_reply",
              commentId: "reply-1",
              linkPath: "/post/post-1#comment-reply-1",
              parentCommentId: "parent-1",
            },
            publishedAt: new Date(),
            targetContentId: "post-1",
            title: "Usuario de prueba respondió a tu comentario",
            type: "system",
          },
        ]}
      />
    );

    expect(screen.getByText("Respuesta")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Abrir" }).getAttribute("href")
    ).toBe("/post/post-1#comment-reply-1");
  });

  it("does not offer an unavailable reply destination", () => {
    render(
      <NotificationFeedList
        emptyCopy=""
        emptyTitle=""
        items={[
          {
            contentType: null,
            description: "En una publicación eliminada.",
            id: "notification-1",
            imageObjectKey: null,
            isRead: true,
            metadata: {
              category: "comment_reply",
              commentId: "reply-1",
              linkPath: "/post/post-1#comment-reply-1",
              parentCommentId: "parent-1",
            },
            publishedAt: new Date(),
            targetContentId: null,
            title: "Usuario de prueba respondió a tu comentario",
            type: "system",
          },
        ]}
      />
    );

    expect(screen.queryByRole("button", { name: "Abrir" })).toBeNull();
  });

  it("rejects protocol-relative notification destinations", () => {
    render(
      <NotificationFeedList
        emptyCopy=""
        emptyTitle=""
        items={[
          {
            contentType: "post",
            description: "En Publicación de prueba.",
            id: "notification-1",
            imageObjectKey: null,
            isRead: false,
            metadata: {
              category: "comment_reply",
              linkPath: "//evil.example",
            },
            publishedAt: new Date(),
            targetContentId: "post-1",
            title: "Usuario de prueba respondió a tu comentario",
            type: "system",
          },
        ]}
      />
    );

    expect(
      screen.getByRole("button", { name: "Abrir" }).getAttribute("href")
    ).toBe("/post/post-1");
  });
});
