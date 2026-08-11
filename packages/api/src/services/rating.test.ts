import { saveRatingInTransaction } from "./rating";

const dependencies = vi.hoisted(() => ({
  applyStreakEvidenceInTransaction: vi.fn(),
  lockContributionParticipantsInTransaction: vi.fn(),
  reconcileEditedReviewRewardsInTransaction: vi.fn(),
}));

vi.mock("./contribution-rewards", () => ({
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
