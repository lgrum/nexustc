import { expect, it } from "vitest";

import { hasRepeatedBlockedSignal } from "./use-adblock-detector";

it("requires the same blocked signal twice", () => {
  expect(
    hasRepeatedBlockedSignal(
      { blockedSignals: ["script"], result: "blocked" },
      { blockedSignals: ["script"], result: "blocked" }
    )
  ).toBe(true);
  expect(
    hasRepeatedBlockedSignal(
      { blockedSignals: ["script"], result: "blocked" },
      { blockedSignals: ["asset"], result: "blocked" }
    )
  ).toBe(false);
  expect(
    hasRepeatedBlockedSignal(
      { blockedSignals: ["script"], result: "blocked" },
      { blockedSignals: [], result: "inconclusive" }
    )
  ).toBe(false);
});
