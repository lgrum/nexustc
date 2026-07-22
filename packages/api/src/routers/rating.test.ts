import { call } from "@orpc/server";

import type { Context } from "../context";
import type { publicCatalogVisibilityCondition } from "../utils/early-access";

const mocks = vi.hoisted(() => ({
  buildProfileSummaries: vi.fn(),
  canReadPublicProfileActivity: vi.fn(),
  publicCatalogVisibilityCondition: vi.fn(),
}));

vi.mock("@orpc/experimental-pino", () => ({ getLogger: () => {} }));
vi.mock("@repo/auth", () => ({ auth: { api: {} } }));
vi.mock("../services/profile", () => ({
  buildProfileSummaries: mocks.buildProfileSummaries,
  canReadPublicProfileActivity: mocks.canReadPublicProfileActivity,
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
    from: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn(),
    where: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.limit.mockReturnValue(query);
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
    db: { select },
    headers: new Headers(),
    session: { user: { id: "owner-1", role: "user" } },
  } as unknown as Context;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("profile review privacy", () => {
  it("returns the established empty shape when public reviews are hidden", async () => {
    mocks.canReadPublicProfileActivity.mockResolvedValue(false);
    const select = vi.fn();
    const context = createContext(select);

    await expect(
      call(
        ratingRouter.getByUserId,
        { limit: 10, offset: 0, userId: "user-1" },
        { context }
      )
    ).resolves.toEqual({ posts: [], ratings: [] });

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
        { limit: 10, offset: 0, userId: "user-1" },
        { context }
      )
    ).resolves.toEqual({ posts: [linkedPost], ratings: [rating] });

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
      call(ratingRouter.getMyReviews, { limit: 7, offset: 14 }, { context })
    ).resolves.toEqual({ posts: [linkedPost], ratings: [rating] });

    expect(mocks.canReadPublicProfileActivity).not.toHaveBeenCalled();
    expect(ratingsQuery.limit).toHaveBeenCalledWith(7);
    expect(ratingsQuery.offset).toHaveBeenCalledWith(14);
    expect(select.mock.calls[1]?.[0]).toHaveProperty("slug");
  });
});
