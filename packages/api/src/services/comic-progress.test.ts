import {
  COMIC_READING_CAP_STATES,
  addProcessedPage,
  applyCheckpoint,
  applyRewardCheckpoint,
  getComicReadingRewardCount,
  getPersistedProcessedPageRanges,
  getPersistedProgressStatus,
  normalizeProcessedPageRanges,
  trackComicPageView,
} from "./comic-progress";

const testEnv = vi.hoisted(() => ({ XP_ACCRUAL_ENABLED: false }));
const progression = vi.hoisted(() => ({
  lockUserProgressionInTransaction: vi.fn(),
  notifyXpSettlement: vi.fn(),
  notifyXpSettlementInTransaction: vi.fn(),
}));
const streak = vi.hoisted(() => ({
  applyStreakEvidenceInTransaction: vi.fn(),
}));
const integrity = vi.hoisted(() => ({
  settle: vi.fn(),
}));

vi.mock("./integrity-settlement", () => ({
  assessXpSourceCapPressure: vi.fn(() => ({ disposition: "low" })),
  settleXpWithIntegrityInTransaction: integrity.settle,
}));

vi.mock("@repo/env", () => ({ env: testEnv }));
vi.mock("./progression", () => progression);
vi.mock("./streak", () => streak);

function createState(
  overrides?: Partial<Parameters<typeof applyCheckpoint>[0]["state"]>
) {
  return {
    canUseResume: false,
    comicId: "comic-1",
    completedAtIso: null,
    completedSnapshot: false,
    consecutiveValidRewardCheckpoints: 0,
    fastRewardCheckpoints: false,
    lastAcceptedAtMs: null,
    lastAcceptedPage: null,
    lastPageRead: 0,
    lastPersistedAtMs: null,
    lastPersistedPage: 0,
    lastRewardCheckpointAtMs: null,
    pendingRewardCheckpoints: [],
    startedAtMs: 0,
    totalPages: 4,
    totalPagesAtLastReadSnapshot: 4,
    userId: "user-1",
    verifiedThroughPage: 0,
    ...overrides,
  };
}

function createAccessQueries(post: Record<string, unknown> | null = {}) {
  return {
    patron: { findFirst: vi.fn().mockResolvedValue(null) },
    post: {
      findFirst: vi.fn().mockResolvedValue(
        post && {
          comicLastUpdateAt: null,
          comicPageCount: 4,
          earlyAccessEnabled: false,
          earlyAccessStartedAt: null,
          id: "comic-1",
          imageObjectKeys: null,
          releasedAt: null,
          vip12EarlyAccessHours: 0,
          vip8EarlyAccessHours: 0,
          ...post,
        }
      ),
    },
  };
}

function createProgressSelect(
  overrides: Partial<{
    completed: boolean;
    completedAt: Date | null;
    lastPageRead: number;
    lastReadTimestamp: Date;
    ranges: [number, number][];
    totalPagesAtLastRead: number;
    verifiedThroughPage: number;
  }> = {}
) {
  const query = {
    for: vi.fn().mockResolvedValue([
      {
        completed: false,
        completedAt: null,
        lastPageRead: 0,
        lastReadTimestamp: new Date(0),
        ranges: [],
        totalPagesAtLastRead: 4,
        verifiedThroughPage: 0,
        ...overrides,
      },
    ]),
    from: vi.fn(),
    where: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return { query, select: vi.fn().mockReturnValue(query) };
}

describe("getPersistedProgressStatus", () => {
  it("returns updated when a completed comic receives new pages", () => {
    expect(
      getPersistedProgressStatus(12, {
        completed: true,
        lastPageRead: 10,
        totalPagesAtLastRead: 10,
      })
    ).toBe("updated");
  });

  it("returns reading for incomplete progress", () => {
    expect(
      getPersistedProgressStatus(12, {
        completed: false,
        lastPageRead: 5,
        totalPagesAtLastRead: 12,
      })
    ).toBe("reading");
  });
});

describe("verified comic reading rewards", () => {
  const evidence = {
    documentVisible: true,
    visibleDurationMs: 2000,
    visiblePercentage: 60,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    testEnv.XP_ACCRUAL_ENABLED = false;
    progression.lockUserProgressionInTransaction.mockResolvedValue({});
    progression.notifyXpSettlementInTransaction.mockImplementation(() =>
      Promise.resolve()
    );
    integrity.settle.mockReset().mockResolvedValue({
      outcome: "posted",
      settlement: {
        level: 1,
        previousLevel: 1,
        replayed: false,
        settledXp: 1,
      },
    });
  });

  it("normalizes sparse processed positions without creating a page row", () => {
    expect(
      normalizeProcessedPageRanges([
        [5, 5],
        [1, 2],
        [4, 4],
        [8, 9],
        [2, 3],
      ])
    ).toEqual([
      [1, 5],
      [8, 9],
    ]);
    expect(addProcessedPage([[1, 2]], 4)).toEqual({
      added: true,
      ranges: [
        [1, 2],
        [4, 4],
      ],
    });
    expect(addProcessedPage([[1, 4]], 3)).toEqual({
      added: false,
      ranges: [[1, 4]],
    });
    expect(addProcessedPage([[1, 4]], 5)).toEqual({
      added: true,
      ranges: [[1, 5]],
    });
  });

  it("rewards only the first 200 newly processed positions per UTC day", () => {
    expect(COMIC_READING_CAP_STATES).toEqual(["pending", "posted"]);
    expect(getComicReadingRewardCount(3, 198)).toBe(2);
    expect(getComicReadingRewardCount(3, 200)).toBe(0);
  });

  it("keeps rewardable pages retryable after a projection mismatch", () => {
    expect(
      getPersistedProcessedPageRanges({
        currentRanges: [[1, 2]],
        processedPages: [3, 4, 5],
        projectionMismatch: true,
        rewardCount: 2,
      })
    ).toEqual([
      [1, 2],
      [5, 5],
    ]);
    expect(
      getPersistedProcessedPageRanges({
        currentRanges: [[1, 2]],
        processedPages: [3, 4, 5],
        projectionMismatch: false,
        rewardCount: 2,
      })
    ).toEqual([[1, 5]]);
  });

  it("keeps every current page retryable when settlement is deferred", () => {
    expect(
      getPersistedProcessedPageRanges({
        currentRanges: [[1, 2]],
        processedPages: [3, 4, 5],
        projectionMismatch: false,
        rewardCount: 2,
        settlementDeferred: true,
      })
    ).toEqual([[1, 2]]);
  });

  it("requires visible evidence and plausible server time", () => {
    const hidden = applyRewardCheckpoint({
      evidence: { ...evidence, documentVisible: false },
      nowMs: 2000,
      page: 1,
      state: createState({ verifiedThroughPage: 1 }),
    });
    const short = applyRewardCheckpoint({
      evidence: { ...evidence, visibleDurationMs: 1999 },
      nowMs: 2000,
      page: 1,
      state: createState({ verifiedThroughPage: 1 }),
    });
    const fast = applyRewardCheckpoint({
      evidence,
      nowMs: 1000,
      page: 1,
      state: createState({ verifiedThroughPage: 1 }),
    });

    expect(hidden.reason).toBe("invalid_evidence");
    expect(short.reason).toBe("invalid_evidence");
    expect(fast.reason).toBe("fast_checkpoint");
    expect(fast.nextState.fastRewardCheckpoints).toBe(true);
  });

  it("rejects reward checkpoints beyond contiguous verified progress", () => {
    const result = applyRewardCheckpoint({
      evidence,
      nowMs: 2000,
      page: 3,
      state: createState({ verifiedThroughPage: 1 }),
    });

    expect(result).toMatchObject({
      reason: "invalid_page",
      rewardValid: false,
    });
    expect(result.nextState.pendingRewardCheckpoints).toEqual([]);
  });

  it("restores eligibility only after three consecutive plausible checkpoints", () => {
    const fast = applyRewardCheckpoint({
      evidence,
      nowMs: 1000,
      page: 4,
      state: createState({ verifiedThroughPage: 4 }),
    });
    const first = applyRewardCheckpoint({
      evidence,
      nowMs: 3000,
      page: 1,
      state: fast.nextState,
    });
    const interrupted = applyRewardCheckpoint({
      evidence: { ...evidence, documentVisible: false },
      nowMs: 4000,
      page: 2,
      state: first.nextState,
    });
    const second = applyRewardCheckpoint({
      evidence,
      nowMs: 5000,
      page: 3,
      state: interrupted.nextState,
    });
    const third = applyRewardCheckpoint({
      evidence,
      nowMs: 7000,
      page: 2,
      state: second.nextState,
    });
    const restored = applyRewardCheckpoint({
      evidence,
      nowMs: 9000,
      page: 4,
      state: third.nextState,
    });
    const eligible = applyRewardCheckpoint({
      evidence,
      nowMs: 11_000,
      page: 3,
      state: restored.nextState,
    });

    expect([
      first.rewardValid,
      second.rewardValid,
      third.rewardValid,
      restored.rewardValid,
    ]).toEqual([false, false, false, false]);
    expect(interrupted.nextState.consecutiveValidRewardCheckpoints).toBe(0);
    expect(restored.nextState.fastRewardCheckpoints).toBe(false);
    expect(eligible.rewardValid).toBe(true);
  });

  it("fails reward validation closed when Redis is unavailable", async () => {
    const cache = {
      get: vi.fn().mockRejectedValue(new Error("redis unavailable")),
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];
    const db = {} as Parameters<typeof trackComicPageView>[0]["db"];

    await expect(
      trackComicPageView({
        cache,
        correlation: { deviceHash: null, ipPrefixHash: null },
        comicId: "comic-1",
        db,
        evidence,
        impersonated: false,
        now: new Date(),
        page: 1,
        readingSessionId: "session-1",
        userId: "user-1",
      })
    ).resolves.toMatchObject({
      accepted: false,
      reason: "tracking_unavailable",
      rewardedXp: 0,
      trackingAvailable: false,
    });
  });

  it("rejects malformed stored session data before using it", async () => {
    const cache = {
      get: vi.fn().mockResolvedValue(
        JSON.stringify({
          ...createState(),
          pendingRewardCheckpoints: [{ page: "1", receivedAtMs: 1000 }],
        })
      ),
      set: vi.fn().mockResolvedValue("OK"),
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];

    await expect(
      trackComicPageView({
        cache,
        correlation: { deviceHash: null, ipPrefixHash: null },
        comicId: "comic-1",
        db: {} as Parameters<typeof trackComicPageView>[0]["db"],
        evidence,
        impersonated: false,
        now: new Date(),
        page: 1,
        readingSessionId: "session-1",
        userId: "user-1",
      })
    ).resolves.toMatchObject({ reason: "session_mismatch" });
    expect(cache.set).toHaveBeenCalledOnce();
  });

  it("keeps checkpoint notifications in the progress transaction", async () => {
    testEnv.XP_ACCRUAL_ENABLED = true;
    progression.notifyXpSettlementInTransaction.mockRejectedValueOnce(
      new Error("notification failure")
    );
    const cache = {
      eval: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(
        JSON.stringify(
          createState({
            lastPageRead: 1,
            lastPersistedAtMs: 0,
            lastPersistedPage: 1,
            pendingRewardCheckpoints: [
              { page: 1, receivedAtMs: Date.now() - 2000 },
            ],
            startedAtMs: Date.now() - 10_000,
            verifiedThroughPage: 1,
          })
        )
      ),
      set: vi.fn().mockResolvedValue("OK"),
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];
    let selectCall = 0;
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
      query: {
        xpRewardBlock: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      select: vi.fn(() => {
        selectCall += 1;
        const chain = {
          for: vi.fn().mockResolvedValue([
            {
              completed: false,
              completedAt: null,
              lastPageRead: 1,
              lastReadTimestamp: new Date(0),
              ranges: [],
              totalPagesAtLastRead: 4,
              verifiedThroughPage: 1,
            },
          ]),
          from: vi.fn(),
          where: vi.fn(),
        };
        chain.from.mockReturnValue(chain);
        chain.where.mockReturnValue(
          selectCall === 1 ? chain : Promise.resolve([{ total: 0 }])
        );
        return chain;
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
      })),
    };
    let committed = false;
    const db = {
      query: createAccessQueries(),
      transaction: vi.fn(async (callback) => {
        const result = await callback(tx);
        committed = true;
        return result;
      }),
    } as unknown as Parameters<typeof trackComicPageView>[0]["db"];

    await expect(
      trackComicPageView({
        cache,
        comicId: "comic-1",
        correlation: { deviceHash: null, ipPrefixHash: null },
        db,
        evidence,
        impersonated: false,
        now: new Date(),
        page: 2,
        readingSessionId: "session-1",
        userId: "user-1",
      })
    ).rejects.toThrow("notification failure");

    expect(committed).toBe(false);
    expect(progression.notifyXpSettlementInTransaction).toHaveBeenCalledWith(
      tx,
      "user-1",
      expect.objectContaining({ replayed: false, settledXp: 1 })
    );
    expect(progression.notifyXpSettlement).not.toHaveBeenCalled();
  });

  it("keeps the latest page while retaining monotonic verified progress", async () => {
    const state = createState({
      canUseResume: true,
      lastPageRead: 1,
      startedAtMs: Date.now() - 10_000,
      verifiedThroughPage: 1,
    });
    const cache = {
      eval: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(JSON.stringify(state)),
      set: vi.fn().mockResolvedValue("OK"),
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];
    const stored = {
      completed: true,
      completedAt: new Date("2026-08-09T00:00:00.000Z"),
      lastPageRead: 4,
      lastReadTimestamp: new Date("2026-08-09T00:00:00.000Z"),
      ranges: [],
      totalPagesAtLastRead: 4,
      verifiedThroughPage: 4,
    };
    let updateValues: Record<string, unknown> | undefined;
    const selectChain = {
      for: vi.fn().mockResolvedValue([stored]),
      from: vi.fn(),
      where: vi.fn(),
    };
    selectChain.from.mockReturnValue(selectChain);
    selectChain.where.mockReturnValue(selectChain);
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          updateValues = values;
          return { where: vi.fn().mockResolvedValue(null) };
        }),
      })),
    };
    const db = {
      query: createAccessQueries(),
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Parameters<typeof trackComicPageView>[0]["db"];

    await trackComicPageView({
      cache,
      comicId: "comic-1",
      correlation: { deviceHash: null, ipPrefixHash: null },
      db,
      evidence: { ...evidence, documentVisible: false },
      impersonated: false,
      now: new Date("2026-08-10T00:00:00.000Z"),
      page: 2,
      readingSessionId: "session-1",
      userId: "user-1",
    });

    expect(selectChain.for).toHaveBeenCalledWith("update");
    expect(updateValues).toMatchObject({
      completed: true,
      lastPageRead: 2,
      totalPagesAtLastRead: 4,
      verifiedThroughPage: 4,
    });
  });

  it("serializes concurrent updates for the same reading session", async () => {
    let locked = false;
    let storedState = JSON.stringify(
      createState({
        lastPersistedAtMs: Date.now(),
        startedAtMs: Date.now() - 10_000,
      })
    );
    let releaseFirstRead: (() => void) | undefined;
    const firstRead = new Promise<void>((resolve) => {
      releaseFirstRead = resolve;
    });
    let reads = 0;
    const get = vi.fn(async () => {
      reads += 1;
      if (reads === 1) {
        await firstRead;
      }
      return storedState;
    });
    const set = vi.fn(
      (_key: string, value: string, options?: { NX?: boolean }) => {
        if (options?.NX) {
          if (locked) {
            return null;
          }
          locked = true;
          return "OK";
        }
        storedState = value;
        return "OK";
      }
    );
    const cache = {
      eval: vi.fn(() => {
        locked = false;
        return 1;
      }),
      get,
      set,
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];
    const input = {
      cache,
      correlation: { deviceHash: null, ipPrefixHash: null },
      comicId: "comic-1",
      db: { query: createAccessQueries() } as unknown as Parameters<
        typeof trackComicPageView
      >[0]["db"],
      evidence: { ...evidence, documentVisible: false },
      impersonated: false,
      now: new Date(),
      page: 1,
      readingSessionId: "session-1",
      userId: "user-1",
    };

    const first = trackComicPageView(input);
    await vi.waitFor(() => expect(get).toHaveBeenCalledOnce());
    const second = trackComicPageView({ ...input, page: 2 });
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    releaseFirstRead?.();

    await expect(first).resolves.toMatchObject({ accepted: true });
    await expect(second).resolves.toMatchObject({
      accepted: false,
      lastPageRead: 1,
      reason: "invalid_page",
      trackingAvailable: true,
      verifiedThroughPage: 1,
    });

    expect(set).toHaveBeenNthCalledWith(
      1,
      "comic-progress:session-lock:session-1",
      expect.any(String),
      { NX: true, PX: 30_000 }
    );
  });

  it("uses post-lock elapsed time for page spacing", async () => {
    const receivedAt = new Date("2026-08-10T12:00:00.000Z");
    const state = createState({
      lastAcceptedAtMs: receivedAt.getTime(),
      lastAcceptedPage: 1,
      lastPageRead: 1,
      lastPersistedAtMs: receivedAt.getTime(),
      lastPersistedPage: 1,
      startedAtMs: receivedAt.getTime() - 10_000,
      verifiedThroughPage: 1,
    });
    let lockAttempts = 0;
    const cache = {
      eval: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(JSON.stringify(state)),
      set: vi.fn((_key: string, _value: string, options?: { NX?: boolean }) => {
        if (!options?.NX) {
          return "OK";
        }
        lockAttempts += 1;
        return lockAttempts > 8 ? "OK" : null;
      }),
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];

    await expect(
      trackComicPageView({
        cache,
        comicId: "comic-1",
        correlation: { deviceHash: null, ipPrefixHash: null },
        db: { query: createAccessQueries() } as unknown as Parameters<
          typeof trackComicPageView
        >[0]["db"],
        evidence: { ...evidence, documentVisible: false },
        impersonated: false,
        now: receivedAt,
        page: 2,
        readingSessionId: "session-1",
        userId: "user-1",
      })
    ).resolves.toMatchObject({
      accepted: true,
      lastPageRead: 2,
      verifiedThroughPage: 2,
    });
  });

  it("does not settle a reward when Redis cannot persist checkpoint evidence", async () => {
    const cache = {
      get: vi.fn().mockResolvedValue(JSON.stringify(createState())),
      set: vi.fn().mockRejectedValue(new Error("redis unavailable")),
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];
    const transaction = vi.fn();
    const db = {
      query: createAccessQueries(),
      transaction,
    } as unknown as Parameters<typeof trackComicPageView>[0]["db"];

    await expect(
      trackComicPageView({
        cache,
        correlation: { deviceHash: null, ipPrefixHash: null },
        comicId: "comic-1",
        db,
        evidence,
        impersonated: false,
        now: new Date(),
        page: 1,
        readingSessionId: "session-1",
        userId: "user-1",
      })
    ).resolves.toMatchObject({
      persisted: false,
      processed: false,
      reason: "tracking_unavailable",
      rewardedXp: 0,
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("records only reward-valid pages for the streak in the progress transaction", async () => {
    const cache = {
      get: vi.fn().mockResolvedValue(JSON.stringify(createState())),
      set: vi.fn().mockResolvedValue("OK"),
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];
    const progress = createProgressSelect();
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
      select: progress.select,
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
      })),
    };
    const db = {
      query: createAccessQueries(),
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Parameters<typeof trackComicPageView>[0]["db"];
    const now = new Date("2026-08-08T12:00:00.000Z");

    await trackComicPageView({
      cache,
      comicId: "comic-1",
      correlation: { deviceHash: null, ipPrefixHash: null },
      db,
      evidence,
      impersonated: false,
      now,
      page: 1,
      readingSessionId: "session-1",
      timezone: "America/Argentina/Buenos_Aires",
      userId: "user-1",
    });

    expect(streak.applyStreakEvidenceInTransaction).toHaveBeenCalledWith(
      tx,
      {
        comicId: "comic-1",
        impersonated: false,
        integrity: {
          correlation: { deviceHash: null, ipPrefixHash: null },
        },
        kind: "reading",
        page: 1,
        timezone: "America/Argentina/Buenos_Aires",
        userId: "user-1",
      },
      now,
      expect.any(Date)
    );

    await trackComicPageView({
      cache: {
        ...cache,
        get: vi.fn().mockResolvedValue(JSON.stringify(createState())),
      } as unknown as Parameters<typeof trackComicPageView>[0]["cache"],
      comicId: "comic-1",
      correlation: { deviceHash: null, ipPrefixHash: null },
      db,
      evidence: { ...evidence, documentVisible: false },
      impersonated: false,
      now,
      page: 1,
      readingSessionId: "session-2",
      userId: "user-1",
    });

    expect(streak.applyStreakEvidenceInTransaction).toHaveBeenCalledOnce();
  });

  it("records a valid streak checkpoint when comic XP already processed the page", async () => {
    testEnv.XP_ACCRUAL_ENABLED = true;
    const cache = {
      get: vi.fn().mockResolvedValue(JSON.stringify(createState())),
      set: vi.fn().mockResolvedValue("OK"),
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];
    const progress = createProgressSelect({ ranges: [[1, 1]] });
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
      select: progress.select,
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
      })),
    };
    const db = {
      query: createAccessQueries(),
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Parameters<typeof trackComicPageView>[0]["db"];

    await expect(
      trackComicPageView({
        cache,
        comicId: "comic-1",
        correlation: { deviceHash: null, ipPrefixHash: null },
        db,
        evidence,
        impersonated: false,
        now: new Date("2026-08-08T12:00:00.000Z"),
        page: 1,
        readingSessionId: "session-1",
        userId: "user-1",
      })
    ).resolves.toMatchObject({ processed: false, rewardedXp: 0 });
    expect(streak.applyStreakEvidenceInTransaction).toHaveBeenCalledOnce();
  });

  it("preserves a buffered checkpoint's request time after its source transaction fails", async () => {
    const cache = {
      get: vi.fn().mockResolvedValue(JSON.stringify(createState())),
      set: vi.fn().mockResolvedValue("OK"),
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];
    const db = {
      query: createAccessQueries(),
      transaction: vi.fn().mockRejectedValue(new Error("database unavailable")),
    } as unknown as Parameters<typeof trackComicPageView>[0]["db"];

    await expect(
      trackComicPageView({
        cache,
        comicId: "comic-1",
        correlation: { deviceHash: null, ipPrefixHash: null },
        db,
        evidence,
        impersonated: false,
        now: new Date("2026-08-08T23:59:59.000Z"),
        page: 1,
        readingSessionId: "session-1",
        userId: "user-1",
      })
    ).rejects.toThrow("database unavailable");

    const sessionWrite = vi
      .mocked(cache.set)
      .mock.calls.find(([key]) => key === "comic-progress:session:session-1");
    expect(sessionWrite).toBeDefined();
    const persistedSession = JSON.parse(sessionWrite?.[1] as string);
    expect(persistedSession.pendingRewardCheckpoints).toEqual([
      { page: 1, receivedAtMs: new Date("2026-08-08T23:59:59.000Z").getTime() },
    ]);

    streak.applyStreakEvidenceInTransaction.mockClear();
    const progress = createProgressSelect();
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
      select: progress.select,
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
      })),
    };
    const retryCache = {
      get: vi.fn().mockResolvedValue(JSON.stringify(persistedSession)),
      set: vi.fn().mockResolvedValue("OK"),
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];
    const retryDb = {
      query: createAccessQueries(),
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Parameters<typeof trackComicPageView>[0]["db"];
    const retryNow = new Date("2026-08-09T00:00:01.000Z");

    await trackComicPageView({
      cache: retryCache,
      comicId: "comic-1",
      correlation: { deviceHash: null, ipPrefixHash: null },
      db: retryDb,
      evidence,
      impersonated: false,
      now: retryNow,
      page: 2,
      readingSessionId: "session-1",
      userId: "user-1",
    });

    expect(streak.applyStreakEvidenceInTransaction.mock.calls).toEqual([
      [
        tx,
        expect.objectContaining({ kind: "reading", page: 1 }),
        new Date("2026-08-08T23:59:59.000Z"),
        expect.any(Date),
      ],
      [
        tx,
        expect.objectContaining({ kind: "reading", page: 2 }),
        retryNow,
        expect.any(Date),
      ],
    ]);
    const firstProcessingNow =
      streak.applyStreakEvidenceInTransaction.mock.calls[0]?.[3];
    expect(firstProcessingNow).toBeInstanceOf(Date);
    if (!(firstProcessingNow instanceof Date)) {
      throw new Error("Expected a processing timestamp.");
    }
    expect(firstProcessingNow.getTime()).toBeGreaterThanOrEqual(
      retryNow.getTime()
    );
  });

  it("blocks comic XP without suppressing a valid streak checkpoint", async () => {
    testEnv.XP_ACCRUAL_ENABLED = true;
    const now = new Date("2026-08-08T12:00:00.000Z");
    const cache = {
      eval: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(
        JSON.stringify(
          createState({
            startedAtMs: now.getTime() - 10_000,
            verifiedThroughPage: 1,
          })
        )
      ),
      set: vi.fn().mockResolvedValue("OK"),
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
      query: {
        xpRewardBlock: {
          findFirst: vi.fn().mockResolvedValue({ id: "block-1" }),
        },
      },
      select: createProgressSelect().select,
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(null) })),
      })),
    };
    const db = {
      query: createAccessQueries(),
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Parameters<typeof trackComicPageView>[0]["db"];

    await expect(
      trackComicPageView({
        cache,
        comicId: "comic-1",
        correlation: { deviceHash: null, ipPrefixHash: null },
        db,
        evidence,
        impersonated: false,
        now,
        page: 1,
        readingSessionId: "session-1",
        userId: "user-1",
      })
    ).resolves.toMatchObject({ processed: true, rewardedXp: 0 });
    expect(integrity.settle).not.toHaveBeenCalled();
    expect(streak.applyStreakEvidenceInTransaction).toHaveBeenCalledOnce();
  });

  it("reports deferred reward pages as unprocessed for a later retry", async () => {
    integrity.settle.mockResolvedValueOnce({
      outcome: "deferred",
      releasedSettlements: [],
      replayed: false,
    });
    const cache = {
      eval: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(
        JSON.stringify(
          createState({
            startedAtMs: Date.now() - 10_000,
            verifiedThroughPage: 1,
          })
        )
      ),
      set: vi.fn().mockResolvedValue("OK"),
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];
    let selectCall = 0;
    let updateValues: Record<string, unknown> | undefined;
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn().mockResolvedValue(null),
        })),
      })),
      query: {
        xpRewardBlock: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      select: vi.fn(() => {
        selectCall += 1;
        const chain = {
          for: vi.fn().mockResolvedValue([
            {
              completed: false,
              completedAt: null,
              lastPageRead: 0,
              lastReadTimestamp: new Date(0),
              ranges: [],
              totalPagesAtLastRead: 0,
              verifiedThroughPage: 0,
            },
          ]),
          from: vi.fn(),
          where: vi.fn(),
        };
        chain.from.mockReturnValue(chain);
        chain.where.mockReturnValue(
          selectCall === 1 ? chain : Promise.resolve([{ total: 0 }])
        );
        return chain;
      }),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          updateValues = values;
          return { where: vi.fn().mockResolvedValue(null) };
        }),
      })),
    };
    const db = {
      query: createAccessQueries(),
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Parameters<typeof trackComicPageView>[0]["db"];

    await expect(
      trackComicPageView({
        cache,
        comicId: "comic-1",
        correlation: { deviceHash: null, ipPrefixHash: null },
        db,
        evidence,
        impersonated: false,
        now: new Date(),
        page: 1,
        readingSessionId: "session-1",
        userId: "user-1",
      })
    ).resolves.toMatchObject({ processed: false, rewardedXp: 0 });

    expect(updateValues).not.toHaveProperty("xpProcessedPageRanges");
  });

  it("rejects checkpoints after the comic becomes inaccessible", async () => {
    const cache = {
      eval: vi.fn().mockResolvedValue(1),
      get: vi.fn().mockResolvedValue(JSON.stringify(createState())),
      set: vi.fn().mockResolvedValue("OK"),
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];
    const transaction = vi.fn();
    const db = {
      query: createAccessQueries(null),
      transaction,
    } as unknown as Parameters<typeof trackComicPageView>[0]["db"];

    await expect(
      trackComicPageView({
        cache,
        comicId: "comic-1",
        correlation: { deviceHash: null, ipPrefixHash: null },
        db,
        evidence,
        impersonated: false,
        now: new Date("2026-08-08T12:00:00.000Z"),
        page: 1,
        readingSessionId: "session-1",
        role: "user",
        userId: "user-1",
      })
    ).resolves.toMatchObject({
      accepted: false,
      reason: "session_mismatch",
      rewardedXp: 0,
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("applyCheckpoint", () => {
  it("marks completion only after contiguous verified progress reaches the final page", () => {
    const pageOne = applyCheckpoint({
      nowMs: 1000,
      page: 1,
      state: createState(),
    });
    const pageTwo = applyCheckpoint({
      nowMs: 1500,
      page: 2,
      state: pageOne.nextState,
    });
    const pageThree = applyCheckpoint({
      nowMs: 2000,
      page: 3,
      state: pageTwo.nextState,
    });
    const finalPage = applyCheckpoint({
      nowMs: 2600,
      page: 4,
      state: pageThree.nextState,
    });

    expect(finalPage.accepted).toBe(true);
    expect(finalPage.markedCompleted).toBe(true);
    expect(finalPage.nextState.verifiedThroughPage).toBe(4);
  });

  it("refuses to mark completion when the reader jumps straight to the final page", () => {
    const pageOne = applyCheckpoint({
      nowMs: 1000,
      page: 1,
      state: createState(),
    });
    const finalPage = applyCheckpoint({
      nowMs: 1600,
      page: 4,
      state: pageOne.nextState,
    });

    expect(finalPage.accepted).toBe(true);
    expect(finalPage.markedCompleted).toBe(false);
    expect(finalPage.nextState.verifiedThroughPage).toBe(1);
    expect(finalPage.nextState.lastPageRead).toBe(4);
  });

  it("batches non-vip persistence for nearby pages", () => {
    const pageOne = applyCheckpoint({
      nowMs: 1000,
      page: 1,
      state: createState(),
    });
    const pageTwo = applyCheckpoint({
      nowMs: 1500,
      page: 2,
      state: pageOne.nextState,
    });

    expect(pageOne.persisted).toBe(true);
    expect(pageTwo.persisted).toBe(false);
  });

  it("persists every accepted page for vip resume sessions", () => {
    const pageOne = applyCheckpoint({
      nowMs: 1000,
      page: 1,
      state: createState({ canUseResume: true }),
    });
    const pageTwo = applyCheckpoint({
      nowMs: 1500,
      page: 2,
      state: pageOne.nextState,
    });

    expect(pageOne.persisted).toBe(true);
    expect(pageTwo.persisted).toBe(true);
  });
});
