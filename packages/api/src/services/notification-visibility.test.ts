import { beforeEach, describe, expect, it, vi } from "vitest";

import type { publicCatalogVisibilityCondition } from "../utils/early-access";

const publicVisibilityMock = vi.hoisted(() => vi.fn());

vi.mock("../utils/early-access", async (importOriginal) => {
  const original = await importOriginal<{
    publicCatalogVisibilityCondition: typeof publicCatalogVisibilityCondition;
  }>();
  publicVisibilityMock.mockImplementation(
    original.publicCatalogVisibilityCondition
  );
  return {
    ...original,
    publicCatalogVisibilityCondition: publicVisibilityMock,
  };
});

const {
  getPublishedNewsArticleById,
  listPublishedNewsArticles,
  NEWS_ARTICLE_TARGET_NOT_PUBLIC,
  publishContentNewsArticle,
} = await import("./notification");

function containsReference(
  value: unknown,
  target: unknown,
  seen = new Set<object>()
): boolean {
  if (value === target) {
    return true;
  }
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return false;
  }

  seen.add(value);
  return Reflect.ownKeys(value).some((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      descriptor !== undefined &&
      "value" in descriptor &&
      containsReference(descriptor.value, target, seen)
    );
  });
}

function createReadDatabase(rows: unknown[]) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn(),
    where: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.where.mockReturnValue(query);

  return {
    database: { select: vi.fn().mockReturnValue(query) },
    query,
  };
}

const articleParams = {
  authorUserId: "user-1",
  body: "Body",
  contentId: "post-1",
  summary: "Summary",
  title: "Title",
};

describe("public news visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds the canonical predicate to the public list query", async () => {
    const { database, query } = createReadDatabase([]);

    await listPublishedNewsArticles(database as never, { limit: 10 });

    expect(publicVisibilityMock).toHaveBeenCalledOnce();
    expect(publicVisibilityMock).toHaveBeenCalledWith(expect.any(Date));
    const predicate = publicVisibilityMock.mock.results[0]?.value;
    expect(containsReference(query.where.mock.calls[0]?.[0], predicate)).toBe(
      true
    );
  });

  it("adds the canonical predicate to detail queries and returns null when filtered", async () => {
    const { database, query } = createReadDatabase([]);

    await expect(
      getPublishedNewsArticleById(database as never, "article-1")
    ).resolves.toBeNull();

    expect(publicVisibilityMock).toHaveBeenCalledOnce();
    expect(publicVisibilityMock).toHaveBeenCalledWith(expect.any(Date));
    const predicate = publicVisibilityMock.mock.results[0]?.value;
    expect(containsReference(query.where.mock.calls[0]?.[0], predicate)).toBe(
      true
    );
  });

  it("rejects a target that is not public before inserting", async () => {
    const insert = vi.fn();
    const database = {
      insert,
      query: {
        post: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    };

    await expect(
      publishContentNewsArticle(database as never, articleParams)
    ).rejects.toThrow(NEWS_ARTICLE_TARGET_NOT_PUBLIC);

    expect(publicVisibilityMock).toHaveBeenCalledOnce();
    expect(publicVisibilityMock).toHaveBeenCalledWith(expect.any(Date));
    expect(insert).not.toHaveBeenCalled();
  });

  it("uses one scheduled timestamp for visibility and both inserts", async () => {
    const scheduledAt = new Date("2026-08-01T12:00:00.000Z");
    const notificationValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: "notification-1" }]),
    });
    const targetValues = vi.fn(() => Promise.resolve());
    const articleValues = vi.fn().mockReturnValue({
      returning: vi
        .fn()
        .mockResolvedValue([
          { id: "article-1", notificationId: "notification-1" },
        ]),
    });
    const duplicateQuery = {
      from: vi.fn(),
      where: vi.fn().mockResolvedValue([]),
    };
    duplicateQuery.from.mockReturnValue(duplicateQuery);
    const database = {
      insert: vi
        .fn()
        .mockReturnValueOnce({ values: notificationValues })
        .mockReturnValueOnce({ values: targetValues })
        .mockReturnValueOnce({ values: articleValues }),
      query: {
        post: {
          findFirst: vi.fn().mockResolvedValue({
            coverMedia: null,
            id: "post-1",
            imageObjectKeys: null,
            status: "publish",
            title: "Post",
            type: "post",
          }),
        },
      },
      select: vi.fn().mockReturnValue(duplicateQuery),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn(() => Promise.resolve()),
        }),
      }),
    };

    await publishContentNewsArticle(database as never, {
      ...articleParams,
      publishedAt: scheduledAt,
    });

    expect(publicVisibilityMock).toHaveBeenCalledOnce();
    expect(publicVisibilityMock).toHaveBeenCalledWith(scheduledAt);
    expect(notificationValues).toHaveBeenCalledWith(
      expect.objectContaining({ publishedAt: scheduledAt })
    );
    expect(articleValues).toHaveBeenCalledWith(
      expect.objectContaining({ publishedAt: scheduledAt })
    );
  });
});
