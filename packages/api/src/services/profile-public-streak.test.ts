import { PROFILE_VISIBILITY_DEFAULTS } from "@repo/shared/profile";

import { getPublicCurrentStreak } from "./profile";

const mocks = vi.hoisted(() => ({ getStreakState: vi.fn() }));

vi.mock("./streak", () => ({ getStreakState: mocks.getStreakState }));

const visible = { ...PROFILE_VISIBILITY_DEFAULTS, streak: true };

beforeEach(() => vi.clearAllMocks());

it("does not read or expose a private streak", async () => {
  await expect(
    getPublicCurrentStreak({} as never, "user-1", PROFILE_VISIBILITY_DEFAULTS)
  ).resolves.toBeNull();
  expect(mocks.getStreakState).not.toHaveBeenCalled();
});

it.each([
  { available: false },
  { available: true, initialized: false },
  { available: true, currentStreak: 0, initialized: true },
])("hides disabled, uninitialized, and zero streaks", async (state) => {
  mocks.getStreakState.mockResolvedValueOnce(state);

  await expect(
    getPublicCurrentStreak({} as never, "user-1", visible)
  ).resolves.toBeNull();
});

it("returns only the authoritative effective current streak", async () => {
  mocks.getStreakState.mockResolvedValueOnce({
    available: true,
    bestStreak: 99,
    challenge: { target: 30 },
    currentStreak: 7,
    initialized: true,
    pendingXp: true,
    timezone: "America/Argentina/Buenos_Aires",
  });

  await expect(
    getPublicCurrentStreak(
      {} as never,
      "user-1",
      visible,
      new Date("2026-08-08T12:00:00.000Z")
    )
  ).resolves.toBe(7);
});
