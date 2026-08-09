import { call } from "@orpc/server";

import type { Context } from "../context";
import { EterisError } from "../services/eteris";
import eterisRouter from "./eteris";

const mocks = vi.hoisted(() => ({
  adjust: vi.fn(),
  getMine: vi.fn(),
  getPublic: vi.fn(),
  grantStipend: vi.fn(),
  inspect: vi.fn(),
  listHistory: vi.fn(),
  report: vi.fn(),
  reconcile: vi.fn(),
  setPublic: vi.fn(),
}));

vi.mock("@repo/auth", () => ({
  auth: {
    api: {
      userHasPermission: vi.fn(
        ({
          body,
        }: {
          body: { permissions: Record<string, unknown>; role: string };
        }) => ({
          success:
            "ratelimit" in body.permissions ||
            body.role === "admin" ||
            body.role === "owner",
        })
      ),
    },
  },
}));
vi.mock("../services/eteris", () => ({
  adjustEteris: mocks.adjust,
  EterisError: class extends Error {
    readonly code: string;

    constructor(code: string) {
      super(code);
      this.code = code;
    }
  },
  getPublicWalletBalance: mocks.getPublic,
  getUserWallet: mocks.getMine,
  inspectWallet: mocks.inspect,
  listEterisHistory: mocks.listHistory,
  reconcileWallet: mocks.reconcile,
  setPublicWalletBalance: mocks.setPublic,
}));
vi.mock("../services/patreon-stipend", () => ({
  grantMonthlyPatreonStipend: mocks.grantStipend,
}));
vi.mock("../services/economy-report", () => ({
  getDailyEconomyReport: mocks.report,
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
    balance: "0",
    canSpend: false,
    debt: false,
    enabled: false,
    publicBalance: false,
    spendingEnabled: false,
    status: "active",
  });
  mocks.grantStipend.mockResolvedValue({ granted: "0", month: "2026-08" });
  mocks.getPublic.mockResolvedValue(null);
  mocks.listHistory.mockResolvedValue({ items: [], nextCursor: null });
  mocks.adjust.mockResolvedValue({ id: "transaction-1", replayed: false });
  mocks.inspect.mockResolvedValue({ balance: "0", walletId: "wallet-1" });
  mocks.reconcile.mockResolvedValue({ matches: true });
  mocks.report.mockResolvedValue({ day: "2026-08-07" });
  mocks.setPublic.mockResolvedValue({ publicBalance: true });
});

test("wallet reads and history are scoped to the authenticated account", async () => {
  await call(eterisRouter.getMine, undefined, { context: createContext() });
  await call(
    eterisRouter.history,
    { cursor: { sequence: "42" } },
    { context: createContext() }
  );

  expect(mocks.getMine).toHaveBeenCalledWith(expect.anything(), "user-1");
  expect(mocks.grantStipend).toHaveBeenCalledWith(expect.anything(), "user-1");
  expect(mocks.getMine.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.grantStipend.mock.invocationCallOrder[0]!
  );
  expect(mocks.listHistory).toHaveBeenCalledWith(expect.anything(), {
    cursor: { sequence: 42n },
    limit: 20,
    userId: "user-1",
  });
});

test("wallet reads survive a stipend settlement failure", async () => {
  mocks.grantStipend.mockRejectedValueOnce(new EterisError("CLOSED_OR_FROZEN"));

  await expect(
    call(eterisRouter.getMine, undefined, { context: createContext() })
  ).resolves.toMatchObject({ status: "active" });
});

test("public lookup returns only the opt-in serialized balance", async () => {
  mocks.getPublic.mockResolvedValue({ balance: "9223372036854775807" });

  await expect(
    call(
      eterisRouter.getPublicBalance,
      { userId: "public-user" },
      { context: { ...createContext(), session: null } }
    )
  ).resolves.toEqual({ balance: "9223372036854775807" });
});

test("owner adjustment accepts a signed decimal string and requires owner", async () => {
  const input = {
    amount: "-9223372036854775808",
    idempotencyKey: "support-ticket-123456",
    reason: "Correcci\u00F3n aprobada por soporte",
    userId: "target-user",
  };

  await call(eterisRouter.owner.adjust, input, {
    context: createContext("owner"),
  });
  expect(mocks.adjust).toHaveBeenCalledWith(expect.anything(), {
    ...input,
    actorUserId: "user-1",
    amount: -9_223_372_036_854_775_808n,
  });
  await expect(
    call(eterisRouter.owner.adjust, input, {
      context: createContext("admin"),
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("admins can inspect but moderators cannot, and only owners reconcile", async () => {
  await expect(
    call(eterisRouter.admin.report, undefined, {
      context: createContext("admin"),
    })
  ).resolves.toEqual({ day: "2026-08-07" });
  expect(mocks.report).toHaveBeenCalledWith(expect.anything());
  await expect(
    call(
      eterisRouter.admin.inspectWallet,
      { userId: "target-user" },
      { context: createContext("admin") }
    )
  ).resolves.toMatchObject({ walletId: "wallet-1" });
  await expect(
    call(
      eterisRouter.admin.inspectWallet,
      { userId: "target-user" },
      { context: createContext("moderator") }
    )
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    call(
      eterisRouter.owner.reconcileWallet,
      { repair: false, userId: "target-user" },
      { context: createContext("admin") }
    )
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    call(eterisRouter.admin.report, undefined, {
      context: createContext("moderator"),
    })
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await call(
    eterisRouter.owner.reconcileWallet,
    { repair: true, userId: "target-user" },
    { context: createContext("owner") }
  );
  expect(mocks.reconcile).toHaveBeenCalledWith(
    expect.anything(),
    "target-user",
    true,
    "user-1"
  );
});

test.each([
  {
    code: "WALLET_NOT_FOUND" as const,
    expected: { code: "NOT_FOUND", message: "Billetera no encontrada." },
    procedure: "getMine" as const,
  },
  {
    code: "PROJECTION_MISMATCH" as const,
    expected: {
      code: "BAD_REQUEST",
      message:
        "La Billetera est\u00E1 bloqueada temporalmente para revisi\u00F3n.",
    },
    procedure: "reconcile" as const,
  },
  {
    code: "WALLET_NOT_FOUND" as const,
    expected: { code: "NOT_FOUND", message: "Billetera no encontrada." },
    procedure: "inspect" as const,
  },
])("maps $procedure service errors to declared Spanish errors", async (row) => {
  mocks[row.procedure].mockRejectedValueOnce(new EterisError(row.code));

  const result =
    row.procedure === "getMine"
      ? call(eterisRouter.getMine, undefined, { context: createContext() })
      : row.procedure === "reconcile"
        ? call(
            eterisRouter.owner.reconcileWallet,
            { repair: false, userId: "target-user" },
            { context: createContext("owner") }
          )
        : call(
            eterisRouter.admin.inspectWallet,
            { userId: "target-user" },
            { context: createContext("admin") }
          );

  await expect(result).rejects.toMatchObject(row.expected);
});
