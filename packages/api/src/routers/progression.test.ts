import { call } from "@orpc/server";

import type { Context } from "../context";
import progressionRouter from "./progression";

const mocks = vi.hoisted(() => ({
  ProgressionError: class ProgressionError extends Error {
    code: string;

    constructor(code: string) {
      super(code);
      this.name = "ProgressionError";
      this.code = code;
    }
  },
  adjustXp: vi.fn(),
  getWallet: vi.fn(),
  getMine: vi.fn(),
  getPublic: vi.fn(),
  grantStipend: vi.fn(),
  listCases: vi.fn(),
  listHistory: vi.fn(),
  releasePending: vi.fn(),
}));

vi.mock("@repo/auth", () => ({
  auth: { api: { userHasPermission: vi.fn(() => ({ success: true })) } },
}));
vi.mock("../services/progression", () => ({
  ProgressionError: mocks.ProgressionError,
  adjustXp: mocks.adjustXp,
  getUserProgression: mocks.getMine,
  getPublicAccountLevel: mocks.getPublic,
  listUserXpHistory: mocks.listHistory,
}));
vi.mock("../services/eteris", () => ({
  getUserWallet: mocks.getWallet,
}));
vi.mock("../services/patreon-stipend", () => ({
  grantMonthlyPatreonStipend: mocks.grantStipend,
}));
vi.mock("../services/integrity", () => ({
  decideIntegrityCase: vi.fn(),
  getIntegrityCase: vi.fn(),
  listIntegrityCases: mocks.listCases,
  releaseMaturedPendingXp: mocks.releasePending,
}));

function createContext(role = "user") {
  return {
    db: {},
    headers: new Headers(),
    session: { user: { id: "user-1", role } },
  } as unknown as Context;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMine.mockResolvedValue({
    accrualEnabled: false,
    enabled: false,
    level: 1,
    nextLevelTotalXp: 67,
    pendingXp: 0,
    progress: 0,
    totalXp: 0,
    xpForNextLevel: 67,
  });
  mocks.getWallet.mockResolvedValue({
    publicBalance: false,
    status: "active",
  });
  mocks.releasePending.mockResolvedValue([]);
  mocks.grantStipend.mockResolvedValue({ granted: "0", month: "2026-08" });
  mocks.listHistory.mockResolvedValue({ items: [], nextCursor: null });
  mocks.listCases.mockResolvedValue([]);
  mocks.getPublic.mockResolvedValue({ level: 1 });
  mocks.adjustXp.mockResolvedValue({
    eventId: "event-1",
    level: 2,
    totalXp: 67,
  });
});

it("forwards a stable integrity-case cursor", async () => {
  await call(
    progressionRouter.admin.listCases,
    {
      cursor: {
        createdAt: "2026-08-07T00:00:00.000Z",
        id: "case-50",
      },
      limit: 50,
      status: "released",
    },
    { context: createContext("admin") }
  );

  expect(mocks.listCases).toHaveBeenCalledWith(expect.anything(), {
    cursor: {
      createdAt: new Date("2026-08-07T00:00:00.000Z"),
      id: "case-50",
    },
    limit: 50,
    status: "released",
  });
});

describe("progression router", () => {
  it("returns authoritative disabled state and lazy progression totals", async () => {
    await expect(
      call(progressionRouter.getMine, undefined, { context: createContext() })
    ).resolves.toMatchObject({
      accrualEnabled: false,
      enabled: false,
      level: 1,
      pendingXp: 0,
      profileUserId: "user-1",
      publicProfileChanged: false,
      totalXp: 0,
    });
    expect(mocks.getMine).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(mocks.releasePending).not.toHaveBeenCalled();
    expect(mocks.grantStipend).toHaveBeenCalledWith(
      expect.anything(),
      "user-1"
    );
    expect(mocks.getMine.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.grantStipend.mock.invocationCallOrder[0]!
    );
  });

  it("signals only an actual released level or public stipend change", async () => {
    mocks.getMine.mockResolvedValue({
      accrualEnabled: true,
      enabled: true,
      level: 1,
      nextLevelTotalXp: 67,
      pendingXp: 5,
      progress: 0,
      totalXp: 0,
      xpForNextLevel: 67,
    });
    mocks.releasePending.mockResolvedValueOnce([
      { level: 2, previousLevel: 1, replayed: false },
    ]);
    await expect(
      call(progressionRouter.getMine, undefined, { context: createContext() })
    ).resolves.toMatchObject({ publicProfileChanged: true });

    mocks.grantStipend.mockResolvedValueOnce({
      granted: "600",
      month: "2026-08",
      publicProfileChanged: true,
    });
    await expect(
      call(progressionRouter.getMine, undefined, { context: createContext() })
    ).resolves.toMatchObject({ publicProfileChanged: true });
  });

  it("returns progression when stipend settlement is unavailable", async () => {
    mocks.grantStipend.mockRejectedValueOnce(new Error("wallet frozen"));
    mocks.getWallet.mockResolvedValueOnce({
      publicBalance: true,
      status: "frozen",
    });

    await expect(
      call(progressionRouter.getMine, undefined, { context: createContext() })
    ).resolves.toMatchObject({
      level: 1,
      publicProfileChanged: true,
      totalXp: 0,
    });
  });

  it("does not multiply Account XP when the monthly VIP stipend is granted", async () => {
    mocks.grantStipend.mockResolvedValueOnce({
      granted: "600",
      month: "2026-08",
    });
    mocks.getMine.mockResolvedValueOnce({
      accrualEnabled: true,
      enabled: true,
      level: 2,
      nextLevelTotalXp: 133,
      pendingXp: 0,
      progress: 0,
      totalXp: 67,
      xpForNextLevel: 66,
    });

    await expect(
      call(progressionRouter.getMine, undefined, { context: createContext() })
    ).resolves.toMatchObject({ level: 2, totalXp: 67 });
  });

  it("keeps public progression limited to Account Level", async () => {
    await expect(
      call(
        progressionRouter.getPublic,
        { userId: "public-user" },
        { context: { ...createContext(), session: null } }
      )
    ).resolves.toEqual({ level: 1 });
    expect(mocks.getPublic).toHaveBeenCalledWith(
      expect.anything(),
      "public-user"
    );
  });

  it("paginates only the authenticated user's private history", async () => {
    await call(
      progressionRouter.history,
      { cursor: { createdAt: "2026-08-07T00:00:00.000Z", id: "event-2" } },
      { context: createContext() }
    );

    expect(mocks.listHistory).toHaveBeenCalledWith(expect.anything(), {
      cursor: {
        createdAt: new Date("2026-08-07T00:00:00.000Z"),
        id: "event-2",
      },
      limit: 20,
      userId: "user-1",
    });
  });

  it("lets authorized staff inspect a user's XP without integrity evidence", async () => {
    mocks.listHistory.mockResolvedValueOnce({
      items: [
        {
          amount: 10,
          createdAt: "2026-08-07T00:00:00.000Z",
          id: "event-1",
          kind: "comic_reading",
          label: "Lectura verificada de cómic",
          state: "posted",
        },
      ],
      nextCursor: null,
    });

    const result = await call(
      progressionRouter.admin.inspectUser,
      { userId: "target-user" },
      { context: createContext("admin") }
    );

    expect(mocks.getMine).toHaveBeenCalledWith(
      expect.anything(),
      "target-user"
    );
    expect(mocks.listHistory).toHaveBeenCalledWith(expect.anything(), {
      authorizedStaff: true,
      limit: 20,
      userId: "target-user",
    });
    expect(result).toMatchObject({ history: { nextCursor: null } });
    expect(result).not.toHaveProperty("evidence");
  });

  it("returns not found when staff inspect an unknown account", async () => {
    mocks.getMine.mockRejectedValueOnce(
      new mocks.ProgressionError("PROGRESSION_NOT_FOUND")
    );

    await expect(
      call(
        progressionRouter.admin.inspectUser,
        { userId: "missing-user" },
        { context: createContext("admin") }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows only the owner to append a reasoned signed correction", async () => {
    const input = {
      amount: 67,
      idempotencyKey: "support-ticket-123456",
      reason: "Correccion aprobada por soporte",
      userId: "target-user",
    };

    await expect(
      call(progressionRouter.owner.adjustXp, input, {
        context: createContext("owner"),
      })
    ).resolves.toMatchObject({ eventId: "event-1" });
    expect(mocks.adjustXp).toHaveBeenCalledWith(expect.anything(), {
      ...input,
      actorUserId: "user-1",
    });

    await expect(
      call(progressionRouter.owner.adjustXp, input, {
        context: createContext("admin"),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects zero corrections and missing audit reasons", async () => {
    await expect(
      call(
        progressionRouter.owner.adjustXp,
        {
          amount: 0,
          idempotencyKey: "support-ticket-123456",
          reason: "",
          userId: "target-user",
        },
        { context: createContext("owner") }
      )
    ).rejects.toBeDefined();
    expect(mocks.adjustXp).not.toHaveBeenCalled();
  });
});
