import { applyCheckpoint, getPersistedProgressStatus } from "./comic-progress";

function createState(
  overrides?: Partial<Parameters<typeof applyCheckpoint>[0]["state"]>
) {
  return {
    canUseResume: false,
    comicId: "comic-1",
    completedAtIso: null,
    completedSnapshot: false,
    lastAcceptedAtMs: null,
    lastAcceptedPage: null,
    lastPageRead: 0,
    lastPersistedAtMs: null,
    lastPersistedPage: 0,
    startedAtMs: 0,
    totalPages: 4,
    totalPagesAtLastReadSnapshot: 4,
    userId: "user-1",
    verifiedThroughPage: 0,
    ...overrides,
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
