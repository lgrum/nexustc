import { call } from "@orpc/server";

import type { Context } from "../context";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  startSession: vi.fn(),
}));

vi.mock("@repo/auth", () => ({
  auth: {
    api: {
      userHasPermission: vi.fn(() => ({ success: false })),
    },
  },
}));
vi.mock("@repo/db", () => ({ getRedis: vi.fn().mockResolvedValue({}) }));
vi.mock("../utils/redis-operations", () => ({
  checkFixedWindowRateLimit: vi.fn(),
  checkSlidingWindowRateLimit: mocks.rateLimit,
}));
vi.mock("../services/comic-progress", () => ({
  getComicProgressOverview: vi.fn(),
  startComicReadingSession: mocks.startSession,
  trackComicPageView: vi.fn(),
}));

const { default: comicProgressRouter } = await import("./comic-progress");

function createContext() {
  return {
    db: {},
    headers: new Headers(),
    session: { user: { id: "user-1", role: "user" } },
  } as unknown as Context;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue({ exceeded: false });
});

test("rate-limits comic reading-session creation", async () => {
  mocks.rateLimit.mockResolvedValueOnce({ exceeded: true });

  await expect(
    call(
      comicProgressRouter.startSession,
      { comicId: "comic-1" },
      { context: createContext() }
    )
  ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  expect(mocks.startSession).not.toHaveBeenCalled();
});
