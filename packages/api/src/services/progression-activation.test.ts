import { ACCOUNT_LEVEL_CURVE_VERSION } from "@repo/shared/progression";
import { expect, test, vi } from "vitest";

import { ensureProgressionActivationInTransaction } from "./progression-activation";

test("uses an unlocked read for an already-current progression activation", async () => {
  const activatedAt = new Date("2026-08-01T00:00:00.000Z");
  const forUpdate = vi
    .fn()
    .mockResolvedValue([
      { activatedAt, curveVersion: ACCOUNT_LEVEL_CURVE_VERSION },
    ]);
  const chain = {
    for: forUpdate,
    from: vi.fn(),
    limit: vi
      .fn()
      .mockResolvedValue([
        { activatedAt, curveVersion: ACCOUNT_LEVEL_CURVE_VERSION },
      ]),
    where: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  const executor = {
    insert: vi.fn(),
    query: {
      progressionSystem: {
        findFirst: vi.fn().mockResolvedValue({
          activatedAt,
          curveVersion: ACCOUNT_LEVEL_CURVE_VERSION,
        }),
      },
    },
    select: vi.fn(() => chain),
    update: vi.fn(),
  };

  await expect(
    ensureProgressionActivationInTransaction(
      executor as never,
      new Date("2026-08-10T00:00:00.000Z")
    )
  ).resolves.toEqual(activatedAt);

  expect(executor.insert).not.toHaveBeenCalled();
  expect(forUpdate).not.toHaveBeenCalled();
});
