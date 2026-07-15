import { beforeEach, describe, expect, it, vi } from "vitest";

const publishContentNewsArticleMock = vi.hoisted(() => vi.fn());

vi.mock("../../index", () => ({
  permissionProcedure: () => {
    const procedure: {
      handler: (handler: unknown) => unknown;
      input: (input: unknown) => unknown;
    } = {
      handler: (handler) => handler,
      input: () => procedure,
    };
    return procedure;
  },
}));

vi.mock("../../services/notification", () => ({
  archiveNotification: vi.fn(),
  createGlobalAnnouncement: vi.fn(),
  NEWS_ARTICLE_TARGET_NOT_PUBLIC: "NEWS_ARTICLE_TARGET_NOT_PUBLIC",
  publishContentNewsArticle: publishContentNewsArticleMock,
}));

vi.mock("../../utils/deferred-media", () => ({
  globalAnnouncementCreateInputSchema: {},
  newsArticleCreateInputSchema: {},
  withDeferredMediaSelection: vi.fn(
    async ({
      db,
      onComplete,
    }: {
      db: unknown;
      onComplete: (options: {
        orderedMedia: unknown[];
        tx: unknown;
      }) => Promise<unknown> | unknown;
    }) => await onComplete({ orderedMedia: [], tx: db })
  ),
}));

const { default: notificationAdmin } = await import("./admin");

type CreateNewsArticleHandler = (options: {
  context: { db: unknown; session: { user: { id: string } } };
  errors: { BAD_REQUEST: (options: { message: string }) => Error };
  input: {
    bannerImageSelection?: unknown;
    body: string;
    contentId: string;
    summary: string;
    title: string;
  };
}) => Promise<unknown>;

const createNewsArticle =
  notificationAdmin.createNewsArticle as unknown as CreateNewsArticleHandler;
const input = {
  body: "Body",
  contentId: "post-1",
  summary: "Summary",
  title: "Title",
};

describe("notification admin news errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps only a non-public target to BAD_REQUEST", async () => {
    const badRequest = new Error("bad request");
    publishContentNewsArticleMock.mockRejectedValue(
      new Error("NEWS_ARTICLE_TARGET_NOT_PUBLIC")
    );

    await expect(
      createNewsArticle({
        context: { db: {}, session: { user: { id: "user-1" } } },
        errors: { BAD_REQUEST: vi.fn().mockReturnValue(badRequest) },
        input,
      })
    ).rejects.toBe(badRequest);
  });

  it("rethrows unrelated service errors unchanged", async () => {
    const serviceError = new Error("database unavailable");
    publishContentNewsArticleMock.mockRejectedValue(serviceError);

    await expect(
      createNewsArticle({
        context: { db: {}, session: { user: { id: "user-1" } } },
        errors: { BAD_REQUEST: vi.fn() },
        input,
      })
    ).rejects.toBe(serviceError);
  });
});
