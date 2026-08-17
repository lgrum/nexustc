import { COLLECTIBLE_METRIC_NAMES } from "@repo/shared/collectibles";
import { describe, expect, it } from "vitest";

import {
  COLLECTIBLE_ADMIN_ACTIONS,
  COLLECTIBLE_ADMIN_TARGETS,
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
