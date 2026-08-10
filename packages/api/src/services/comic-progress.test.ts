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

const integrity = vi.hoisted(() => ({
  settle: vi.fn(),
}));
const notifications = vi.hoisted(() => ({
  notify: vi.fn(),
  notifyInTransaction: vi.fn(),
}));

vi.mock("./integrity-settlement", () => ({
  assessXpSourceCapPressure: vi.fn(() => ({ disposition: "low" })),
  settleXpWithIntegrityInTransaction: integrity.settle,
}));

vi.mock("@repo/env", () => ({
  env: { XP_ACCRUAL_ENABLED: true },
}));

vi.mock("./progression", () => ({
  lockUserProgressionInTransaction: vi.fn().mockResolvedValue({}),
  notifyXpSettlement: notifications.notify,
  notifyXpSettlementInTransaction: notifications.notifyInTransaction,
}));

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
    pendingRewardPages: [],
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
    notifications.notify
      .mockReset()
      .mockImplementation(() => Promise.resolve());
    notifications.notifyInTransaction
      .mockReset()
      .mockImplementation(() => Promise.resolve());
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
    expect(result.nextState.pendingRewardPages).toEqual([]);
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

  it("keeps checkpoint notifications in the progress transaction", async () => {
    notifications.notify.mockRejectedValueOnce(
      new Error("notification failure")
    );
    notifications.notifyInTransaction.mockRejectedValueOnce(
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
            pendingRewardPages: [1],
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
        page: 2,
        readingSessionId: "session-1",
        userId: "user-1",
      })
    ).rejects.toThrow("notification failure");

    expect(committed).toBe(false);
    expect(notifications.notifyInTransaction).toHaveBeenCalledWith(
      tx,
      "user-1",
      expect.objectContaining({ replayed: false, settledXp: 1 })
    );
    expect(notifications.notify).not.toHaveBeenCalled();
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
      totalPagesAtLastRead: 4,
      updatedAt: new Date("2026-08-09T00:00:00.000Z"),
      verifiedThroughPage: 4,
      xpProcessedPageRanges: [],
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
          onConflictDoNothing: vi.fn(() => Promise.resolve()),
        })),
      })),
      select: vi.fn().mockReturnValue(selectChain),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          updateValues = values;
          return { where: vi.fn(() => Promise.resolve()) };
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
    let releaseRead: ((value: string | null) => void) | undefined;
    const get = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          releaseRead = resolve;
        })
    );
    const set = vi.fn().mockResolvedValueOnce("OK").mockResolvedValueOnce(null);
    const cache = {
      eval: vi.fn().mockResolvedValue(1),
      get,
      set,
    } as unknown as Parameters<typeof trackComicPageView>[0]["cache"];
    const input = {
      cache,
      correlation: { deviceHash: null, ipPrefixHash: null },
      comicId: "comic-1",
      db: {} as Parameters<typeof trackComicPageView>[0]["db"],
      evidence,
      page: 1,
      readingSessionId: "session-1",
      userId: "user-1",
    };

    const first = trackComicPageView(input);
    await vi.waitFor(() => expect(get).toHaveBeenCalledOnce());
    await expect(trackComicPageView(input)).resolves.toMatchObject({
      accepted: false,
      reason: "tracking_unavailable",
      trackingAvailable: false,
    });
    releaseRead?.(null);
    await first;

    expect(set).toHaveBeenNthCalledWith(
      1,
      "comic-progress:session-lock:session-1",
      expect.any(String),
      { NX: true, PX: 30_000 }
    );
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

  it("does not settle verified pages after the comic reward scope is blocked", async () => {
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
      select: vi.fn(() => {
        selectCall += 1;
        const chain = {
          for: vi.fn().mockResolvedValue([{ ranges: [] }]),
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
    const db = {
      query: createAccessQueries(),
      transaction: vi.fn((callback) => callback(tx)),
    } as unknown as Parameters<typeof trackComicPageView>[0]["db"];

    await expect(
      trackComicPageView({
        cache,
        correlation: { deviceHash: null, ipPrefixHash: null },
        comicId: "comic-1",
        db,
        evidence,
        page: 1,
        readingSessionId: "session-1",
        userId: "user-1",
      })
    ).resolves.toMatchObject({ processed: true, rewardedXp: 0 });
    expect(integrity.settle).not.toHaveBeenCalled();
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
        page: 1,
        readingSessionId: "session-1",
        userId: "user-1",
      })
    ).resolves.toMatchObject({ processed: false, rewardedXp: 0 });

    expect(updateValues).toMatchObject({ xpProcessedPageRanges: [] });
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
        correlation: { deviceHash: null, ipPrefixHash: null },
        comicId: "comic-1",
        db,
        evidence,
        page: 1,
        readingSessionId: "session-1",
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
