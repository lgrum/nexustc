import {
  cardInstance,
  eterisWallet,
  packInstance,
  packOpening,
  packRevision,
  user,
} from "@repo/db";
import { describe, expect, it, vi } from "vitest";

import type { CollectibleTransaction } from "./collectible-issuance";
import {
  deliverPackOpeningNotification,
  openPackInTransaction,
} from "./pack-opening";

const notification = vi.hoisted(() => ({
  createUserNotification: vi.fn((..._args: unknown[]) =>
    Promise.resolve({ id: "notice-1" })
  ),
}));

vi.mock("./notification", () => notification);

const now = new Date("2026-08-16T12:00:00.000Z");

function createState() {
  return {
    account: {
      banExpires: null,
      banned: false,
      emailVerified: true,
      id: "user-1",
    },
    cards: [
      {
        availability: "active" as const,
        binding: "transferable" as const,
        characterName: "Carta Dos",
        description: "Descripción dos",
        edition: null,
        gameName: "Juego",
        id: "card-2",
        lifetimeSupplyCeiling: 100,
        mintNumber: 2,
        presentationMetadata: {
          accentColor: "#7c3aed",
          frameKey: "default",
          watermarkText: "NeXusTC",
        },
        rarity: "rare" as const,
        renderedVariants: [],
        revealOrder: 2,
        seriesName: "Serie",
        templateId: "template-card-2",
        templateAvailability: "active" as const,
        ownerUserId: null as string | null,
        packInstanceId: "pack-1" as string | null,
      },
      {
        availability: "active" as const,
        binding: "transferable" as const,
        characterName: "Carta Uno",
        description: "Descripción uno",
        edition: "Primera",
        gameName: "Juego",
        id: "card-1",
        lifetimeSupplyCeiling: null,
        mintNumber: 1,
        presentationMetadata: {
          accentColor: "#7c3aed",
          frameKey: "default",
          watermarkText: "NeXusTC",
        },
        rarity: "common" as const,
        renderedVariants: [],
        revealOrder: 1,
        seriesName: "Serie",
        templateId: "template-card-1",
        templateAvailability: "active" as const,
        ownerUserId: null as string | null,
        packInstanceId: "pack-1" as string | null,
      },
    ],
    events: [] as Record<string, unknown>[],
    openings: [] as Record<string, unknown>[],
    pack: {
      availability: "active" as "active" | "frozen",
      binding: "transferable" as const,
      id: "pack-1",
      issueSource: "grant",
      openedAt: null as Date | null,
      ownerUserId: "user-1",
      revisionId: "revision-1",
      state: "unopened" as "unopened" | "opened",
      templateId: "template-1",
    },
    revision: {
      availability: "active" as "active" | "disabled" | "exhausted",
      cardCount: 2,
      id: "revision-1",
      lifecycle: "published" as const,
      revision: 1,
      templateId: "template-1",
    },
    wallet: {
      id: "wallet-1",
      status: "active" as "active" | "frozen" | "closed",
    },
  };
}

function createTransaction(
  state: ReturnType<typeof createState>,
  expectedOpeningKey?: string,
  options: { failOnOpeningInsert?: boolean } = {}
) {
  const queryRows = (table: unknown) => {
    if (table === user) {
      return [state.account];
    }
    if (table === eterisWallet) {
      return [state.wallet];
    }
    if (table === packOpening) {
      return expectedOpeningKey
        ? state.openings.filter(
            (opening) => opening.idempotencyKey === expectedOpeningKey
          )
        : state.openings;
    }
    if (table === packInstance) {
      return [state.pack];
    }
    if (table === packRevision) {
      return [state.revision];
    }
    if (table === cardInstance) {
      return state.cards.toSorted((a, b) => a.id.localeCompare(b.id));
    }
    return [];
  };

  const tx = {
    select: vi.fn((selection?: unknown) => {
      let table: unknown;
      const builder = {
        from(nextTable: unknown) {
          table = nextTable;
          return builder;
        },
        innerJoin() {
          return builder;
        },
        where() {
          return builder;
        },
        orderBy() {
          return builder;
        },
        limit() {
          return builder;
        },
        for() {
          return Promise.resolve(queryRows(table));
        },
        // oxlint-disable-next-line unicorn/no-thenable -- This test adapter mirrors Drizzle's thenable query builder.
        then(
          resolve: (value: unknown) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          return Promise.resolve(queryRows(table)).then(resolve, reject);
        },
      };
      void selection;
      return builder;
    }),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((value: Record<string, unknown>) => {
        if (table === packOpening) {
          if (options.failOnOpeningInsert) {
            throw new Error("commit failed");
          }
          state.openings.push(value);
        }
        if (table !== packOpening) {
          state.events.push(value);
        }
        return [];
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => {
          if (table === cardInstance) {
            for (const card of state.cards) {
              Object.assign(card, values);
            }
          }
          if (table === packInstance) {
            Object.assign(state.pack, values);
          }
          return [];
        }),
      })),
    })),
  };
  return tx as unknown as CollectibleTransaction;
}

async function runAtomic(
  state: ReturnType<typeof createState>,
  operation: () => Promise<unknown>
) {
  const snapshot = {
    cards: state.cards.map((card) => ({ ...card })),
    events: [...state.events],
    openings: [...state.openings],
    pack: { ...state.pack },
  };
  try {
    return await operation();
  } catch (error) {
    state.cards.splice(0, state.cards.length, ...snapshot.cards);
    state.events.splice(0, state.events.length, ...snapshot.events);
    state.openings.splice(0, state.openings.length, ...snapshot.openings);
    Object.assign(state.pack, snapshot.pack);
    throw error;
  }
}

function openInput(idempotencyKey = "open-pack-key-1") {
  return { idempotencyKey, packInstanceId: "pack-1" };
}

describe("pack opening application-service seam", () => {
  it("transfers every committed card in reveal order and records a stable result", async () => {
    const state = createState();
    const result = await openPackInTransaction(
      createTransaction(state),
      "user-1",
      openInput(),
      { now }
    );

    expect(result).toMatchObject({
      openedAt: now,
      packInstanceId: "pack-1",
      replayed: false,
      revision: 1,
      revisionId: "revision-1",
      source: "grant",
    });
    expect(result.cards.map(({ cardInstanceId }) => cardInstanceId)).toEqual([
      "card-1",
      "card-2",
    ]);
    expect(state.pack.state).toBe("opened");
    expect(state.pack.openedAt).toEqual(now);
    expect(state.cards.every((card) => card.ownerUserId === "user-1")).toBe(
      true
    );
    expect(state.cards.every((card) => card.packInstanceId === null)).toBe(
      true
    );
    expect(state.events).toHaveLength(3);
    expect(state.openings).toHaveLength(1);
  });

  it("returns the exact committed result for a matching retry and rejects a conflicting key payload", async () => {
    const state = createState();
    const tx = createTransaction(state);
    const first = await openPackInTransaction(tx, "user-1", openInput(), {
      now,
    });
    const replay = await openPackInTransaction(tx, "user-1", openInput(), {
      now: new Date("2026-08-17T12:00:00.000Z"),
    });
    expect(replay).toEqual({ ...first, replayed: true });
    state.account.banned = true;
    expect(
      await openPackInTransaction(tx, "user-1", openInput(), { now })
    ).toEqual({ ...first, replayed: true });
    const alreadyOpened = createState();
    alreadyOpened.pack.state = "opened";
    alreadyOpened.pack.openedAt = now;
    await expect(
      openPackInTransaction(createTransaction(alreadyOpened), "user-1", {
        idempotencyKey: "different-pack-key",
        packInstanceId: "pack-1",
      })
    ).rejects.toMatchObject({ code: "ALREADY_OPENED" });

    const conflictingState = createState();
    const conflictingTx = createTransaction(
      conflictingState,
      "open-pack-key-2"
    );
    await openPackInTransaction(
      conflictingTx,
      "user-1",
      openInput("open-pack-key-2"),
      { now }
    );
    await expect(
      openPackInTransaction(conflictingTx, "user-1", {
        idempotencyKey: "open-pack-key-2",
        packInstanceId: "different-pack",
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("serializes competing opens so only one request can transfer the Pack", async () => {
    const state = createState();
    let tail = Promise.resolve();
    const run = (idempotencyKey: string) => {
      const previous = tail;
      let release!: () => void;
      tail = new Promise<void>((resolve) => {
        release = resolve;
      });
      return previous.then(async () => {
        try {
          return await openPackInTransaction(
            createTransaction(state, idempotencyKey),
            "user-1",
            openInput(idempotencyKey),
            { now }
          );
        } finally {
          release();
        }
      });
    };
    const results = await Promise.allSettled([
      run("competing-open-1"),
      run("competing-open-2"),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1
    );
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(
      1
    );
    expect(results.find(({ status }) => status === "rejected")).toMatchObject({
      reason: expect.objectContaining({ code: "ALREADY_OPENED" }),
    });
    expect(state.openings).toHaveLength(1);
  });

  it("rejects frozen packs and active custody before transfer", async () => {
    const frozen = createState();
    frozen.pack.availability = "frozen";
    await expect(
      openPackInTransaction(createTransaction(frozen), "user-1", openInput(), {
        now,
      })
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(frozen.pack.state).toBe("unopened");

    const custody = createState();
    await expect(
      openPackInTransaction(createTransaction(custody), "user-1", openInput(), {
        now,
        activeCustody: () => ["pack-1"],
      })
    ).rejects.toMatchObject({ code: "ACTIVE_CUSTODY" });
    expect(custody.cards.every((card) => card.ownerUserId === null)).toBe(true);
  });

  it("rejects ineligible accounts and unavailable revisions before transfer", async () => {
    for (const configure of [
      (state: ReturnType<typeof createState>) => {
        state.account.emailVerified = false;
      },
      (state: ReturnType<typeof createState>) => {
        state.account.banned = true;
      },
      (state: ReturnType<typeof createState>) => {
        state.wallet.status = "frozen";
      },
    ]) {
      const state = createState();
      configure(state);
      await expect(
        openPackInTransaction(createTransaction(state), "user-1", openInput(), {
          now,
        })
      ).rejects.toMatchObject({ code: "ACCOUNT_INELIGIBLE" });
      expect(state.pack.state).toBe("unopened");
      expect(state.cards.every((card) => card.ownerUserId === null)).toBe(true);
    }

    const unavailableRevision = createState();
    unavailableRevision.revision.availability = "disabled";
    await expect(
      openPackInTransaction(
        createTransaction(unavailableRevision),
        "user-1",
        openInput(),
        { now }
      )
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(unavailableRevision.pack.state).toBe("unopened");
  });

  it("still opens packs issued from a revision that later became exhausted", async () => {
    const state = createState();
    state.revision.availability = "exhausted";
    const result = await openPackInTransaction(
      createTransaction(state),
      "user-1",
      openInput(),
      { now }
    );
    expect(result.replayed).toBe(false);
    expect(state.pack.state).toBe("opened");
    expect(state.cards.every((card) => card.ownerUserId === "user-1")).toBe(
      true
    );
  });

  it("leaves no partial transfer when the opening transaction cannot commit", async () => {
    const state = createState();
    await expect(
      runAtomic(state, () =>
        openPackInTransaction(
          createTransaction(state, undefined, { failOnOpeningInsert: true }),
          "user-1",
          openInput(),
          { now }
        )
      )
    ).rejects.toThrow("commit failed");
    expect(state.pack.state).toBe("unopened");
    expect(state.pack.openedAt).toBeNull();
    expect(state.cards.every((card) => card.ownerUserId === null)).toBe(true);
    expect(state.cards.every((card) => card.packInstanceId === "pack-1")).toBe(
      true
    );
    expect(state.events).toHaveLength(0);
    expect(state.openings).toHaveLength(0);
  });

  it("delivers a private post-commit notice only to the opener", async () => {
    await deliverPackOpeningNotification({} as never, {
      openingId: "opening-1",
      packInstanceId: "pack-1",
      userId: "user-1",
    });
    expect(notification.createUserNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        dedupeKey: "collectible-pack-open:opening-1",
        targetUserId: "user-1",
      })
    );
    expect(
      notification.createUserNotification.mock.calls[0]?.[1]
    ).not.toHaveProperty("audienceType", "broadcast");
  });
});
