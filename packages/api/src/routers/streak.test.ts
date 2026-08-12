import { call } from "@orpc/server";

import type { Context } from "../context";
import streakRouter from "./streak";

const mocks = vi.hoisted(() => ({
  cache: {
    expire: vi.fn().mockResolvedValue(true),
    incr: vi.fn().mockResolvedValue(1),
    set: vi.fn().mockResolvedValue("OK"),
  },
  completeStepUp: vi.fn(),
  getState: vi.fn(),
  isAvailable: vi.fn(),
  selectChallenge: vi.fn(),
  setTimezone: vi.fn(),
  verifyTurnstile: vi.fn(),
}));

vi.mock("@repo/auth", () => ({
  auth: {
    api: { userHasPermission: vi.fn().mockResolvedValue({ success: false }) },
  },
  verifyTurnstileToken: mocks.verifyTurnstile,
}));
vi.mock("@repo/db", async (importOriginal) => ({
  ...(await importOriginal()),
  getRedis: vi.fn().mockResolvedValue(mocks.cache),
}));
vi.mock("../services/streak", () => ({
  completeStreakStepUpInTransaction: mocks.completeStepUp,
  getStreakState: mocks.getState,
  isStreakAvailable: mocks.isAvailable,
  selectStreakChallengeInTransaction: mocks.selectChallenge,
  setStreakTimezoneInTransaction: mocks.setTimezone,
  StreakError: class extends Error {
    readonly code: string;

    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
}));
vi.mock("../utils/integrity-evidence", () => ({
  buildIntegrityCorrelationEvidence: vi.fn(() => ({
    deviceHash: "device-hash",
    ipPrefixHash: "ip-hash",
  })),
}));

function createContext(role = "user") {
  const returning = vi.fn().mockResolvedValue([{ id: "window-1" }]);
  const values = vi.fn(() => ({ returning }));
  return {
    context: {
      db: {
        insert: vi.fn(() => ({ values })),
        transaction: vi.fn((handler) => handler({})),
      },
      headers: new Headers(),
      session: { user: { id: "user-1", role } },
    } as unknown as Context,
    values,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cache.incr.mockResolvedValue(1);
  mocks.completeStepUp.mockResolvedValue({ completed: true });
  mocks.isAvailable.mockResolvedValue(true);
  mocks.verifyTurnstile.mockResolvedValue("pass");
  mocks.setTimezone.mockResolvedValue({ available: true, initialized: true });
  mocks.selectChallenge.mockResolvedValue({ target: 10 });
});

test("verifies and settles retained evidence using only the token", async () => {
  const { context } = createContext();
  context.headers = new Headers({
    "cf-connecting-ip": "203.0.113.1",
    cookie: "ntc_device=550e8400-e29b-41d4-a716-446655440000",
  });

  await expect(
    call(streakRouter.completeStepUp, { token: "provider-token" }, { context })
  ).resolves.toEqual({ completed: true });
  expect(mocks.verifyTurnstile).toHaveBeenCalledWith("provider-token", {
    action: "streak_step_up",
    remoteIp: "203.0.113.1",
  });
  expect(mocks.completeStepUp).toHaveBeenCalledWith(
    {},
    "user-1",
    expect.objectContaining({ deviceHash: expect.any(String) }),
    expect.any(Date)
  );
});

test("keeps retained evidence retryable when Turnstile fails", async () => {
  const { context } = createContext();
  mocks.verifyTurnstile.mockResolvedValue("fail");

  await expect(
    call(streakRouter.completeStepUp, { token: "bad-token" }, { context })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(mocks.completeStepUp).not.toHaveBeenCalled();
});

test("reports a Turnstile provider outage without consuming evidence", async () => {
  const { context } = createContext();
  mocks.verifyTurnstile.mockResolvedValue("error");

  await expect(
    call(streakRouter.completeStepUp, { token: "provider-token" }, { context })
  ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  expect(mocks.completeStepUp).not.toHaveBeenCalled();
});

test("reports settlement failures without consuming retained evidence", async () => {
  const { context } = createContext();
  mocks.completeStepUp.mockRejectedValue(new Error("redis offline"));

  await expect(
    call(streakRouter.completeStepUp, { token: "provider-token" }, { context })
  ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  expect(mocks.completeStepUp).toHaveBeenCalledOnce();
});

test("validates and selects only an accepted challenge target", async () => {
  const { context } = createContext();

  await expect(
    call(streakRouter.selectChallenge, { target: 10 }, { context })
  ).resolves.toEqual({ target: 10 });
  expect(mocks.selectChallenge).toHaveBeenCalledWith(
    {},
    "user-1",
    10,
    expect.any(Date)
  );

  await expect(
    call(streakRouter.selectChallenge, { target: 15 } as never, { context })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(mocks.selectChallenge).toHaveBeenCalledOnce();
});

test("only owners can append an audited protection interval", async () => {
  const input = {
    endsAt: "2026-08-10T00:00:00.000Z",
    kind: "pause" as const,
    reason: "Mantenimiento planificado",
    startsAt: "2026-08-09T00:00:00.000Z",
  };
  const admin = createContext("admin");
  await expect(
    call(streakRouter.declareProtectionWindow, input, {
      context: admin.context,
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(admin.values).not.toHaveBeenCalled();

  const owner = createContext("owner");
  await expect(
    call(streakRouter.declareProtectionWindow, input, {
      context: owner.context,
    })
  ).resolves.toEqual({ id: "window-1" });
  expect(owner.values).toHaveBeenCalledWith({
    createdBy: "user-1",
    endsAt: new Date(input.endsAt),
    kind: "pause",
    reason: input.reason,
    startsAt: new Date(input.startsAt),
  });
});

test("does not create protection state while streaks are unavailable", async () => {
  mocks.isAvailable.mockResolvedValue(false);
  const owner = createContext("owner");

  await expect(
    call(
      streakRouter.declareProtectionWindow,
      {
        endsAt: "2026-08-10T00:00:00.000Z",
        kind: "pause",
        reason: "Mantenimiento planificado",
        startsAt: "2026-08-09T00:00:00.000Z",
      },
      { context: owner.context }
    )
  ).resolves.toEqual({ available: false });
  expect(owner.values).not.toHaveBeenCalled();
});

test("rejects invalid protection bounds before writing", async () => {
  const owner = createContext("owner");

  await expect(
    call(
      streakRouter.declareProtectionWindow,
      {
        endsAt: "2026-08-09T00:00:00.000Z",
        kind: "outage",
        reason: "Incidente confirmado",
        startsAt: "2026-08-09T00:00:00.000Z",
      },
      { context: owner.context }
    )
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(owner.values).not.toHaveBeenCalled();
});

test.each([
  ["INVALID_TIMEZONE", "La zona horaria no es v\u00E1lida."],
  ["TIMEZONE_CHANGE_PENDING", "Ya hay un cambio de zona horaria pendiente."],
  [
    "TIMEZONE_COOLDOWN",
    "Podr\u00E1s volver a cambiar tu zona horaria cuando termine el plazo de 30 d\u00EDas.",
  ],
])("maps %s to a declared Spanish error", async (code, message) => {
  const { context } = createContext();
  const { StreakError } = await import("../services/streak");
  mocks.setTimezone.mockRejectedValueOnce(new StreakError(code as never));

  await expect(
    call(
      streakRouter.setTimezone,
      { timezone: "America/Los_Angeles" },
      { context }
    )
  ).rejects.toMatchObject({ code: "BAD_REQUEST", message });
});
