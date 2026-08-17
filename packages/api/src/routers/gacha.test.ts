import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";
import gachaRouter from "./gacha";

const flags = vi.hoisted(() => ({ enabled: true }));
const service = vi.hoisted(() => ({
  activateGachapon: vi.fn(),
  createGachaponMachine: vi.fn(),
  getActiveGachaponMachine: vi.fn(),
  getGachaponActivation: vi.fn(),
  listActiveGachaponMachines: vi.fn(),
  listGachaponMachinesForAdmin: vi.fn(),
  listOwnGachaponActivations: vi.fn(),
  retryGachaponActivationNotification: vi.fn(),
  transitionGachaponMachine: vi.fn(),
  updateGachaponMachine: vi.fn(),
}));

vi.mock("@repo/env", () => ({
  env: {
    get COLLECTIBLES_ENABLED() {
      return flags.enabled;
    },
  },
}));
vi.mock("@repo/auth", () => ({
  auth: {
    api: {
      userHasPermission: vi.fn(({ body }: { body: { role: string } }) => ({
        success: body.role === "owner",
      })),
    },
  },
}));
vi.mock("../services/gachapon", () => ({
  activateGachapon: service.activateGachapon,
  createGachaponMachine: service.createGachaponMachine,
  getActiveGachaponMachine: service.getActiveGachaponMachine,
  getGachaponActivation: service.getGachaponActivation,
  GachaponError: class GachaponError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = "GachaponError";
      this.code = code;
    }
  },
  listActiveGachaponMachines: service.listActiveGachaponMachines,
  listGachaponMachinesForAdmin: service.listGachaponMachinesForAdmin,
  listOwnGachaponActivations: service.listOwnGachaponActivations,
  retryGachaponActivationNotification:
    service.retryGachaponActivationNotification,
  transitionGachaponMachine: service.transitionGachaponMachine,
  updateGachaponMachine: service.updateGachaponMachine,
}));
vi.mock("../utils/redis-operations", () => ({
  checkSlidingWindowRateLimit: vi.fn().mockResolvedValue({ exceeded: false }),
}));

function createContext(role = "user", impersonatedBy?: string): Context {
  return {
    db: {},
    headers: new Headers(),
    isSharedCacheContext: true,
    session: {
      session: impersonatedBy ? { impersonatedBy } : {},
      user: { id: "user-1", role },
    },
  } as unknown as Context;
}

beforeEach(() => {
  flags.enabled = true;
  vi.clearAllMocks();
  service.listActiveGachaponMachines.mockResolvedValue([
    {
      availability: "available",
      binding: "transferable",
      cost: "25",
      description: "Evento",
      endsAt: null,
      entries: [
        {
          available: true,
          description: "Pack",
          latestRevision: { revision: 2 },
          name: "Pack inicial",
          packTemplateId: "pack-1",
        },
      ],
      globalQuota: null,
      id: "machine-1",
      name: "Máquina",
      perAccountLimit: null,
      remainingGlobalActivations: null,
      startsAt: null,
      state: "active",
      version: 1,
    },
  ]);
  service.activateGachapon.mockResolvedValue({
    activationId: "activation-1",
    chargedCost: "25",
    machineId: "machine-1",
    packInstanceId: "pack-instance-1",
    replayed: false,
    revisionId: "revision-2",
    templateId: "pack-1",
    transactionId: "transaction-1",
  });
  service.listGachaponMachinesForAdmin.mockResolvedValue([]);
  service.retryGachaponActivationNotification.mockResolvedValue(
    "notification-1"
  );
});

describe("gacha router boundaries", () => {
  it("keeps public machine views free of numeric weights and hidden outcomes", async () => {
    const result = await call(gachaRouter.list, undefined, {
      context: createContext(),
    });
    expect(result[0]).not.toHaveProperty("weight");
    expect(result[0]?.entries[0]).not.toHaveProperty("weight");
    expect(result[0]?.entries[0]).not.toHaveProperty("outcome");
  });

  it("accepts only confirmation data and delegates server-side activation", async () => {
    const input = {
      expectedCost: "25",
      expectedMachineVersion: 1,
      idempotencyKey: "gachapon-router-key-1",
      machineId: "machine-1",
    };
    await expect(
      call(gachaRouter.activate, input, { context: createContext() })
    ).resolves.toMatchObject({ packInstanceId: "pack-instance-1" });
    expect(service.activateGachapon).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        expectedCost: 25n,
        machineId: "machine-1",
        userId: "user-1",
      })
    );
    expect(service.activateGachapon.mock.calls[0]?.[1]).not.toHaveProperty(
      "outcome"
    );
  });

  it("requires gacha management capability and rejects impersonated mutations", async () => {
    await expect(
      call(
        gachaRouter.admin.list,
        { limit: 10 },
        { context: createContext("admin") }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call(
        gachaRouter.activate,
        {
          expectedCost: "25",
          expectedMachineVersion: 1,
          idempotencyKey: "gachapon-router-key-2",
          machineId: "machine-1",
        },
        { context: createContext("user", "staff-1") }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    flags.enabled = false;
    await expect(
      call(
        gachaRouter.activate,
        {
          expectedCost: "25",
          expectedMachineVersion: 1,
          idempotencyKey: "gachapon-router-key-3",
          machineId: "machine-1",
        },
        { context: createContext() }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(service.activateGachapon).toHaveBeenCalledTimes(0);
  });

  it("exposes a gated, permissioned retry hook without settlement fields", async () => {
    await expect(
      call(
        gachaRouter.retryNotification,
        { activationId: "activation-1" },
        { context: createContext("owner") }
      )
    ).resolves.toBe("notification-1");
    expect(service.retryGachaponActivationNotification).toHaveBeenCalledWith(
      expect.anything(),
      "activation-1"
    );

    flags.enabled = false;
    await expect(
      call(
        gachaRouter.retryNotification,
        { activationId: "activation-1" },
        { context: createContext("owner") }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
