import {
  buildManualNewsDuplicateSignature,
  deriveContentUpdateEvent,
  followContent,
  hasVersionChanged,
  unfollowContent,
} from "./notification";

const streak = vi.hoisted(() => ({
  applyStreakEvidenceInTransaction: vi.fn(),
}));

vi.mock("./streak", () => streak);

describe("follow Discovery evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submits evidence only for a successful new follow in its transaction", async () => {
    const { db, transaction, tx } = createFollowDb(true);
    const now = new Date("2026-08-08T12:00:00.000Z");

    await followContent(
      db as never,
      {
        contentId: "comic-1",
        impersonated: false,
        now,
        role: "user",
        timezone: "America/Argentina/Buenos_Aires",
        userId: "user-1",
      },
      streak.applyStreakEvidenceInTransaction
    );

    expect(transaction).toHaveBeenCalledOnce();
    expect(streak.applyStreakEvidenceInTransaction).toHaveBeenCalledWith(
      tx,
      {
        actionKind: "follow",
        contentKey: "comic:comic-1",
        impersonated: false,
        kind: "discovery",
        timezone: "America/Argentina/Buenos_Aires",
        userId: "user-1",
      },
      now
    );
  });

  it("does not submit evidence for a conflict insert", async () => {
    const { db } = createFollowDb(false);

    await followContent(
      db as never,
      {
        contentId: "comic-1",
        impersonated: false,
        now: new Date("2026-08-08T12:00:00.000Z"),
        role: "user",
        userId: "user-1",
      },
      streak.applyStreakEvidenceInTransaction
    );

    expect(streak.applyStreakEvidenceInTransaction).not.toHaveBeenCalled();
  });

  it("does not submit evidence when unfollowing", async () => {
    const { db } = createFollowDb(false);

    await unfollowContent(db as never, {
      contentId: "comic-1",
      userId: "user-1",
    });

    expect(streak.applyStreakEvidenceInTransaction).not.toHaveBeenCalled();
  });

  it("keeps follow and streak writes in the same rollback boundary", async () => {
    const failure = new Error("streak write failed");
    streak.applyStreakEvidenceInTransaction.mockRejectedValueOnce(failure);
    const { db } = createFollowDb(true);

    await expect(
      followContent(
        db as never,
        {
          contentId: "comic-1",
          impersonated: false,
          now: new Date("2026-08-08T12:00:00.000Z"),
          role: "user",
          userId: "user-1",
        },
        streak.applyStreakEvidenceInTransaction
      )
    ).rejects.toBe(failure);
  });
});

function createFollowDb(inserted: boolean) {
  const contentQuery = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn().mockResolvedValue([
      {
        authorBanned: false,
        earlyAccessEnabled: false,
        earlyAccessStartedAt: null,
        id: "comic-1",
        releasedAt: null,
        status: "publish",
        title: "Comic",
        type: "comic",
        vip12EarlyAccessHours: 0,
        vip8EarlyAccessHours: 0,
      },
    ]),
    where: vi.fn(),
  };
  contentQuery.from.mockReturnValue(contentQuery);
  contentQuery.innerJoin.mockReturnValue(contentQuery);
  contentQuery.where.mockReturnValue(contentQuery);
  const countQuery = {
    from: vi.fn(),
    where: vi.fn().mockResolvedValue([{ count: 0 }]),
  };
  countQuery.from.mockReturnValue(countQuery);
  const select = vi
    .fn()
    .mockReturnValueOnce(contentQuery)
    .mockReturnValueOnce(countQuery);
  const returning = vi
    .fn()
    .mockResolvedValue(inserted ? [{ contentId: "comic-1" }] : []);
  const insert = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({ returning })),
    })),
  }));
  const tx = {
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
    insert,
    query: {
      contentFollower: { findFirst: vi.fn().mockResolvedValue(null) },
      patron: { findFirst: vi.fn().mockResolvedValue(null) },
    },
    select,
  };
  const transaction = vi.fn((callback: (executor: typeof tx) => unknown) =>
    callback(tx)
  );
  return { db: { ...tx, transaction }, transaction, tx };
}

describe(hasVersionChanged, () => {
  it("only treats normalized version changes as updates", () => {
    expect(hasVersionChanged(null, "")).toBe(false);
    expect(hasVersionChanged(" 1.0 ", "1.0")).toBe(false);
    expect(hasVersionChanged("1.0", "1.1")).toBe(true);
    expect(hasVersionChanged("1.0", null)).toBe(true);
  });
});

describe(deriveContentUpdateEvent, () => {
  it("creates a game update event only when the version changes on a published post", () => {
    const result = deriveContentUpdateEvent({
      next: {
        documentStatus: "publish",
        mediaCount: 1,
        title: "Chronos Nightfall",
        type: "post",
        version: "0.21",
      },
      previous: {
        id: "post-1",
        mediaCount: 1,
        status: "publish",
        title: "Chronos Nightfall",
        type: "post",
        version: "0.20",
      },
    });

    expect(result).toStrictEqual({
      contentId: "post-1",
      contentTitle: "Chronos Nightfall",
      contentType: "post",
      currentVersion: "0.21",
      dedupeKey: "game-version:post-1:0.21",
      metadata: {},
      previousVersion: "0.20",
      updateType: "game_version",
    });
  });

  it("does not create a game update event for non-version edits", () => {
    const result = deriveContentUpdateEvent({
      next: {
        documentStatus: "publish",
        mediaCount: 1,
        title: "Chronos Nightfall Remastered",
        type: "post",
        version: "0.20",
      },
      previous: {
        id: "post-1",
        mediaCount: 1,
        status: "publish",
        title: "Chronos Nightfall",
        type: "post",
        version: "0.20",
      },
    });

    expect(result).toBeNull();
  });

  it("creates a comic update event when new pages are added to a published comic", () => {
    const result = deriveContentUpdateEvent({
      next: {
        documentStatus: "publish",
        mediaCount: 4,
        title: "TheChronos: Eclipse",
        type: "comic",
      },
      previous: {
        id: "comic-1",
        mediaCount: 2,
        status: "publish",
        title: "TheChronos: Eclipse",
        type: "comic",
        version: null,
      },
    });

    expect(result).toStrictEqual({
      contentId: "comic-1",
      contentTitle: "TheChronos: Eclipse",
      contentType: "comic",
      currentPageCount: 4,
      dedupeKey: "comic-pages:comic-1:4",
      metadata: {},
      pagesAdded: 2,
      previousPageCount: 2,
      updateType: "comic_pages",
    });
  });

  it("does not create an update event when a draft becomes published", () => {
    const result = deriveContentUpdateEvent({
      next: {
        documentStatus: "publish",
        mediaCount: 2,
        title: "TheChronos: Prelude",
        type: "comic",
      },
      previous: {
        id: "comic-2",
        mediaCount: 0,
        status: "draft",
        title: "TheChronos: Prelude",
        type: "comic",
        version: null,
      },
    });

    expect(result).toBeNull();
  });
});

describe(buildManualNewsDuplicateSignature, () => {
  it("treats equivalent manual news articles as duplicates", () => {
    const firstSignature = buildManualNewsDuplicateSignature({
      bannerImageObjectKey: " banners/chronos.webp ",
      body: " Se agrego una nueva build al branch publico. ",
      contentId: "post-1",
      summary: " Build nueva disponible ",
      title: " Devlog 12 ",
    });
    const secondSignature = buildManualNewsDuplicateSignature({
      bannerImageObjectKey: "banners/chronos.webp",
      body: "Se agrego una nueva build al branch publico.",
      contentId: "post-1",
      summary: "Build nueva disponible",
      title: "Devlog 12",
    });

    expect(firstSignature).toBe(secondSignature);
  });

  it("changes when the actual article content changes", () => {
    const previousSignature = buildManualNewsDuplicateSignature({
      bannerImageObjectKey: "banners/chronos.webp",
      body: "Se agrego una nueva build al branch publico.",
      contentId: "post-1",
      summary: "Build nueva disponible",
      title: "Devlog 12",
    });
    const nextSignature = buildManualNewsDuplicateSignature({
      bannerImageObjectKey: "banners/chronos.webp",
      body: "Se agrego una nueva build al branch publico con hotfixes.",
      contentId: "post-1",
      summary: "Build nueva disponible",
      title: "Devlog 12",
    });

    expect(previousSignature).not.toBe(nextSignature);
  });
});
