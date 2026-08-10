// @vitest-environment node

import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configureComment: vi.fn(),
  configureCompleted: vi.fn(),
  configureLike: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/api/services/contribution-rewards", () => ({
  reconcileClosedAuthorCommentRewardsInTransaction: vi.fn(),
  reconcileClosedLikerRewardsInTransaction: vi.fn(),
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
