import { call } from "@orpc/server";

import type { Context } from "../context";
import progressionRouter from "./progression";

const mocks = vi.hoisted(() => ({
  adjustXp: vi.fn(),
  getMine: vi.fn(),
  getPublic: vi.fn(),
  grantStipend: vi.fn(),
  listHistory: vi.fn(),
  releasePending: vi.fn(),
}));

vi.mock("@repo/auth", () => ({
  auth: { api: { userHasPermission: vi.fn(() => ({ success: true })) } },
}));
vi.mock("../services/progression", () => ({
  adjustXp: mocks.adjustXp,
  getUserProgression: mocks.getMine,
  getPublicAccountLevel: mocks.getPublic,
  listUserXpHistory: mocks.listHistory,
}));
vi.mock("../services/patreon-stipend", () => ({
  grantMonthlyPatreonStipend: mocks.grantStipend,
}));
vi.mock("../services/integrity", () => ({
  decideIntegrityCase: vi.fn(),
  getIntegrityCase: vi.fn(),
  listIntegrityCases: vi.fn(),
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
  mocks.releasePending.mockImplementation(() => Promise.resolve());
  mocks.grantStipend.mockResolvedValue({ granted: "0", month: "2026-08" });
  mocks.listHistory.mockResolvedValue({ items: [], nextCursor: null });
  mocks.getPublic.mockResolvedValue({ level: 1 });
  mocks.adjustXp.mockResolvedValue({
    eventId: "event-1",
    level: 2,
    totalXp: 67,
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
      totalXp: 0,
    });
    expect(mocks.getMine).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(mocks.releasePending).toHaveBeenCalledWith(
      expect.anything(),
      "user-1"
    );
    expect(mocks.grantStipend).toHaveBeenCalledWith(
      expect.anything(),
      "user-1"
    );
    expect(mocks.grantStipend.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getMine.mock.invocationCallOrder[0]!
    );
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
