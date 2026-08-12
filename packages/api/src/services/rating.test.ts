import { saveRatingInTransaction } from "./rating";

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.hasReviewRewardSubjectInTransaction.mockResolvedValue(false);
});

const dependencies = vi.hoisted(() => ({
  applyStreakEvidenceInTransaction: vi.fn(),
  hasReviewRewardSubjectInTransaction: vi.fn(),
  lockContributionParticipantsInTransaction: vi.fn(),
  reconcileEditedReviewRewardsInTransaction: vi.fn(),
}));

vi.mock("./contribution-rewards", () => ({
  hasReviewRewardSubjectInTransaction:
    dependencies.hasReviewRewardSubjectInTransaction,
  lockContributionParticipantsInTransaction:
    dependencies.lockContributionParticipantsInTransaction,
  reconcileEditedReviewRewardsInTransaction:
    dependencies.reconcileEditedReviewRewardsInTransaction,
}));
vi.mock("./streak", () => ({
  applyStreakEvidenceInTransaction:
    dependencies.applyStreakEvidenceInTransaction,
}));

const reviewA =
  "Esta reseña analiza cuidadosamente el ritmo, los personajes y la presentación de la obra con ejemplos concretos.";
const reviewB =
  "Esta reseña explica con claridad la trama, el desarrollo del elenco y la calidad visual de toda la publicación.";

function createConcurrentTransactions() {
  let current = {
    createdAt: new Date("2026-08-08T12:00:00.000Z"),
    id: "review-1",
    postId: "post-1",
    rating: 5,
    review: "",
    userId: "user-1",
  };
  let arrivals = 0;
  let openBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => {
    openBarrier = resolve;
  });
  let lock = Promise.resolve();

  return async function transaction(callback: (tx: never) => Promise<unknown>) {
    let release!: () => void;
    const previousLock = lock;
    lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    let pendingUpdate: Partial<typeof current> = {};
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(async () => {
              arrivals += 1;
              if (arrivals === 2) {
                openBarrier();
              }
              await barrier;
              return [];
            }),
          })),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(async () => {
              await previousLock;
              return [{ review: current.review }];
            }),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values: Partial<typeof current>) => {
          pendingUpdate = values;
          return {
            where: vi.fn(() => ({
              returning: vi.fn(() => {
                current = { ...current, ...pendingUpdate };
                return [current];
              }),
            })),
          };
        }),
      })),
    };

    try {
      return await callback(tx as never);
    } finally {
      release();
    }
  };
}

it("emits one Contribution transition across competing rating transactions", async () => {
  dependencies.reconcileEditedReviewRewardsInTransaction.mockResolvedValue({
    settlements: [],
  });
  const transaction = createConcurrentTransactions();
  const now = new Date("2026-08-08T12:00:00.000Z");
  const save = (review: string) =>
    transaction((tx) =>
      saveRatingInTransaction(tx, {
        contentType: "post",
        impersonated: false,
        insertIfMissing: true,
        now,
        postId: "post-1",
        rating: 8,
        review,
        timezone: "America/Argentina/Buenos_Aires",
        userId: "user-1",
      })
    );

  await Promise.all([save(reviewA), save(reviewB)]);

  expect(
    dependencies.lockContributionParticipantsInTransaction
  ).toHaveBeenCalledTimes(2);
  expect(
    dependencies.lockContributionParticipantsInTransaction
  ).toHaveBeenCalledWith(expect.anything(), ["user-1"]);
  expect(dependencies.applyStreakEvidenceInTransaction).toHaveBeenCalledOnce();
});

it("timestamps the reward subject when a bare rating first becomes a review", async () => {
  const createdAt = new Date("2026-08-01T12:00:00.000Z");
  const now = new Date("2026-08-08T12:00:00.000Z");
  const saved = {
    createdAt,
    id: "review-1",
    postId: "post-1",
    review: reviewA,
    userId: "user-1",
  };
  const tx = createRatingTransaction({ existingReview: "", saved });

  await saveRatingInTransaction(tx as never, {
    contentType: "post",
    impersonated: false,
    insertIfMissing: false,
    now,
    postId: "post-1",
    rating: 8,
    review: reviewA,
    userId: "user-1",
  });

  expect(
    dependencies.reconcileEditedReviewRewardsInTransaction
  ).toHaveBeenCalledWith(
    tx,
    expect.objectContaining({ ...saved, createdAt: now }),
    now
  );
  expect(tx.updateSet).toHaveBeenCalledWith(
    expect.objectContaining({ createdAt: now })
  );
});

it("does not re-award a review that qualified before its text was cleared", async () => {
  dependencies.hasReviewRewardSubjectInTransaction.mockResolvedValue(true);
  const now = new Date("2026-08-08T12:00:00.000Z");
  const tx = createRatingTransaction({
    existingReview: "",
    saved: {
      createdAt: new Date("2026-08-01T12:00:00.000Z"),
      id: "review-1",
      postId: "post-1",
      review: reviewA,
      userId: "user-1",
    },
  });

  await saveRatingInTransaction(tx as never, {
    contentType: "post",
    impersonated: false,
    insertIfMissing: false,
    now,
    postId: "post-1",
    rating: 8,
    review: reviewA,
    userId: "user-1",
  });

  expect(dependencies.hasReviewRewardSubjectInTransaction).toHaveBeenCalledWith(
    tx,
    "review-1"
  );
  expect(dependencies.applyStreakEvidenceInTransaction).not.toHaveBeenCalled();
  expect(
    dependencies.reconcileEditedReviewRewardsInTransaction
  ).toHaveBeenCalledOnce();
  expect(tx.updateSet).toHaveBeenCalledWith(
    expect.not.objectContaining({ createdAt: now })
  );
});

it("does not create a review reward subject for a bare rating", async () => {
  const now = new Date("2026-08-08T12:00:00.000Z");
  const tx = createRatingTransaction({
    saved: {
      createdAt: now,
      id: "rating-1",
      postId: "post-1",
      review: "",
      userId: "user-1",
    },
  });

  await saveRatingInTransaction(tx as never, {
    contentType: "post",
    impersonated: false,
    insertIfMissing: true,
    now,
    postId: "post-1",
    rating: 8,
    review: "",
    userId: "user-1",
  });

  expect(
    dependencies.reconcileEditedReviewRewardsInTransaction
  ).not.toHaveBeenCalled();
});

function createRatingTransaction(input: {
  existingReview?: string;
  saved: {
    createdAt: Date;
    id: string;
    postId: string;
    review: string;
    userId: string;
  };
}) {
  const updateSet = vi.fn((values: Partial<typeof input.saved>) => ({
    where: vi.fn(() => ({
      returning: vi.fn().mockResolvedValue([{ ...input.saved, ...values }]),
    })),
  }));
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi
            .fn()
            .mockResolvedValue(
              input.existingReview === undefined ? [input.saved] : []
            ),
        })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          for: vi
            .fn()
            .mockResolvedValue([
              { id: input.saved.id, review: input.existingReview },
            ]),
        })),
      })),
    })),
    update: vi.fn(() => ({ set: updateSet })),
    updateSet,
  };
}
