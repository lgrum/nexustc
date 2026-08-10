// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configureComment: vi.fn(),
  configureCompleted: vi.fn(),
  configureLike: vi.fn(),
  notifySettlements: vi.fn(),
  reconcileClosedLikes: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/api/services/contribution-rewards", () => ({
  reconcileClosedAuthorCommentRewardsInTransaction: vi.fn(),
  notifyBannedLikerRewardSettlementsInTransaction: mocks.notifySettlements,
  reconcileClosedLikerRewardsInTransaction: mocks.reconcileClosedLikes,
}));
vi.mock("@repo/auth/account-closure", () => ({
  configureAccountClosureCommentReconciler: mocks.configureComment,
  configureAccountClosureCompletionHandler: mocks.configureCompleted,
  configureAccountClosureLikeReconciler: mocks.configureLike,
}));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

test("account closure invalidates the deleted public profile", async () => {
  await import("./account-closure.server");
  const handler = mocks.configureCompleted.mock.calls[0]?.[0];

  expect(handler).toBeTypeOf("function");
  await handler("user-1");

  expect(mocks.revalidateTag).toHaveBeenCalledWith("profile:user-1", "max");
  expect(mocks.revalidateTag).toHaveBeenCalledWith("profiles", "max");
});

test("account closure notifies authors before its transaction completes", async () => {
  const settlements = [
    { settlements: [{ eventId: "reversal-1" }], userId: "author-1" },
  ];
  mocks.reconcileClosedLikes.mockResolvedValue(settlements);
  await import("./account-closure.server");
  const reconcile = mocks.configureLike.mock.calls[0]?.[0];
  const tx = { id: "transaction-1" };
  const input = {
    actorUserId: "closing-user",
    likerUserId: "closing-user",
    now: new Date("2026-08-10T12:00:00.000Z"),
  };

  await reconcile(tx, input);

  expect(mocks.reconcileClosedLikes).toHaveBeenCalledWith(tx, input);
  expect(mocks.notifySettlements).toHaveBeenCalledWith(tx, settlements);
});
