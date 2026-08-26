import { COLLECTIBLE_METRIC_NAMES } from "@repo/shared/collectibles";
import { describe, expect, it, vi } from "vitest";

import {
  COLLECTIBLE_ADMIN_ACTIONS,
  COLLECTIBLE_ADMIN_TARGETS,
  appendCollectibleAdminAction,
  collectibleAdminActionFingerprint,
  decodeCollectibleAdminAuditCursor,
  encodeCollectibleAdminAuditCursor,
  listCollectibleAdminActions,
  sanitizeCollectibleAdminSnapshot,
} from "./collectible-admin-action";

describe("collectible administrative action boundary", () => {
  it("keeps the action/target vocabulary explicit", () => {
    expect(COLLECTIBLE_ADMIN_ACTIONS).toContain("exceptional-transfer");
    expect(COLLECTIBLE_ADMIN_ACTIONS).toContain("reverse-eteris");
    expect(COLLECTIBLE_ADMIN_TARGETS).toContain("eteris-transaction");
  });

  it("removes unopened outcome material before private audit shaping", () => {
    expect(
      sanitizeCollectibleAdminSnapshot({
        availability: "frozen",
        nested: { revealOrder: [1, 2], safe: "kept" },
        outcomeDigest: "hidden",
        safeVersion: 2,
      })
    ).toEqual({
      availability: "frozen",
      nested: { safe: "kept" },
      safeVersion: 2,
    });
  });

  it("uses a stable descending cursor tuple and scopes fingerprints by actor", () => {
    const cursor = {
      createdAt: new Date("2026-08-17T00:00:00.000Z"),
      id: "action-1",
    };
    expect(
      decodeCollectibleAdminAuditCursor(
        encodeCollectibleAdminAuditCursor(cursor)
      )
    ).toEqual(cursor);
    const common = {
      action: "freeze" as const,
      expectedVersion: 1,
      idempotencyKey: "admin-action-1",
      reason: "Incidente confirmado",
      targetId: "card-1",
      targetKind: "card-instance" as const,
      version: 2,
    };
    expect(
      collectibleAdminActionFingerprint({ ...common, actorUserId: "owner-1" })
    ).not.toBe(
      collectibleAdminActionFingerprint({ ...common, actorUserId: "owner-2" })
    );
  });

  it("returns a private second keyset page without outcome-bearing snapshots", async () => {
    const rows = [0, 1, 2].map((index) => ({
      action: "freeze",
      actionId: `action-${index}`,
      actorUserId: `staff-${index}`,
      after: {
        availability: "frozen",
        outcomeDigest: `secret-${index}`,
      },
      before: {
        availability: "active",
        revealOrder: [index],
      },
      createdAt: new Date(`2026-08-17T00:00:0${index}.000Z`),
      expectedVersion: 1,
      fingerprint: `fingerprint-${index}`,
      id: `action-${index}`,
      idempotencyKey: `key-${index}`,
      linkedActionId: null,
      linkedEterisTransactionId: null,
      reason: "Revisión operativa",
      targetId: `card-${index}`,
      targetKind: "card-instance",
      version: 2,
    }));
    let queryCount = 0;
    const database = {
      select: () => {
        const builder = {
          from: () => builder,
          limit: () => builder,
          orderBy: () => builder,
          where: () => builder,
          // oxlint-disable-next-line unicorn/no-thenable -- mirrors a Drizzle select builder.
          then: (resolve: (value: typeof rows) => unknown) => {
            queryCount += 1;
            return Promise.resolve(
              resolve(queryCount === 1 ? rows : [rows[2]!])
            );
          },
        };
        return builder;
      },
    };

    const first = await listCollectibleAdminActions(database as never, {
      limit: 2,
    });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first.items[0]).not.toHaveProperty("after.outcomeDigest");
    expect(first.items[0]?.before).not.toHaveProperty("revealOrder");
    const second = await listCollectibleAdminActions(database as never, {
      cursor: first.nextCursor ?? undefined,
      limit: 2,
    });
    expect(second.items).toEqual([
      expect.objectContaining({ actionId: "action-2", targetId: "card-2" }),
    ]);
    expect(second.nextCursor).toBeNull();
    expect(COLLECTIBLE_METRIC_NAMES).toEqual(
      expect.arrayContaining([
        "freeze",
        "restore",
        "correction",
        "exceptional_grant",
        "exceptional_transfer",
        "fee_reversal",
        "revision_exhaustion",
        "quota_drift",
        "custody_age",
        "failed_settlement",
        "render_failure",
        "notification_backlog",
        "expiry_backlog",
      ])
    );
    expect(JSON.stringify(first)).not.toContain("secret-");
  });
});

function createAppendTx(
  options: {
    existing?: Record<string, unknown> | null;
  } = {}
) {
  const inserted: Record<string, unknown>[] = [];
  const tx = {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: () => {
          inserted.push(values);
          return Promise.resolve([
            {
              action: "freeze",
              actorUserId: "staff-1",
              after: {},
              before: {},
              createdAt: new Date("2026-08-20T00:00:00.000Z"),
              expectedVersion: 1,
              fingerprint: "fingerprint-1",
              id: "action-new",
              idempotencyKey: "admin-key-1",
              linkedActionId: null,
              linkedEterisTransactionId: null,
              reason: "Revisión operativa",
              targetId: "card-1",
              targetKind: "card-instance",
              version: 2,
            },
          ]);
        },
      }),
    }),
    select: () => {
      const builder = {
        from: () => builder,
        limit: () => builder,
        where: () => builder,
        // oxlint-disable-next-line unicorn/no-thenable -- mirrors a Drizzle select builder.
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve(resolve(options.existing ? [options.existing] : [])),
      };
      return builder;
    },
  };
  return { inserted, tx };
}

const appendInputBase = {
  action: "freeze" as const,
  actorUserId: "staff-1",
  after: { availability: "frozen", outcomeDigest: "hidden" },
  before: { availability: "active", revealOrder: [1, 2] },
  expectedVersion: 1,
  idempotencyKey: "admin-key-1",
  reason: "Revisión operativa confirmada",
  targetId: "card-1",
  targetKind: "card-instance" as const,
  version: 2,
};

describe("appendCollectibleAdminAction write path", () => {
  it("inserts one sanitized, immutable audit row on first use", async () => {
    const { inserted, tx } = createAppendTx();
    const result = await appendCollectibleAdminAction(
      tx as never,
      appendInputBase
    );
    expect(result).toMatchObject({
      actionId: "action-new",
      replayed: false,
      version: 2,
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ idempotencyKey: "admin-key-1" });
    // Unopened outcome material never reaches the audit table.
    expect(inserted[0]?.after).toEqual({ availability: "frozen" });
    expect(inserted[0]?.before).toEqual({ availability: "active" });
  });

  it("replays the same logical action without a second insert", async () => {
    const fingerprint = collectibleAdminActionFingerprint(appendInputBase);
    const { inserted, tx } = createAppendTx({
      existing: {
        createdAt: new Date("2026-08-19T00:00:00.000Z"),
        fingerprint,
        id: "action-original",
        version: 2,
      },
    });
    const result = await appendCollectibleAdminAction(
      tx as never,
      appendInputBase
    );
    expect(result).toEqual({
      actionId: "action-original",
      createdAt: new Date("2026-08-19T00:00:00.000Z"),
      replayed: true,
      version: 2,
    });
    expect(inserted).toHaveLength(0);
  });

  it("rejects reuse of a key with different data as an idempotency conflict", async () => {
    const metricSink = vi.fn();
    const conflictingFingerprint = `${collectibleAdminActionFingerprint(appendInputBase)}-different`;
    const { tx } = createAppendTx({
      existing: {
        createdAt: new Date("2026-08-19T00:00:00.000Z"),
        fingerprint: conflictingFingerprint,
        id: "action-other",
        version: 3,
      },
    });
    await expect(
      appendCollectibleAdminAction(tx as never, {
        ...appendInputBase,
        metrics: metricSink,
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(metricSink).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "idempotency_conflict",
        operation: "collectibles.admin-action",
      })
    );
  });

  it("validates the reason and audit version before touching storage", async () => {
    const { tx } = createAppendTx();
    await expect(
      appendCollectibleAdminAction(tx as never, {
        ...appendInputBase,
        reason: "no",
      })
    ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
    await expect(
      appendCollectibleAdminAction(tx as never, {
        ...appendInputBase,
        version: 0,
      })
    ).rejects.toMatchObject({ code: "INVALID_ACTION" });
    await expect(
      appendCollectibleAdminAction(tx as never, {
        ...appendInputBase,
        idempotencyKey: "   ",
      })
    ).rejects.toMatchObject({ code: "INVALID_ACTION" });
  });
});
