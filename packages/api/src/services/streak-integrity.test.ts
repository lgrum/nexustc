import { describe, expect, it, vi } from "vitest";

import {
  assessStreakIntegrityRisk,
  classifyStreakIntegrityRisk,
  classifyStreakReviewRisk,
  getStreakStepUpClearance,
  grantStreakStepUpClearance,
  observeStreakActionRisk,
} from "./streak-integrity";

describe("streak integrity", () => {
  it.each([
    [[], "low"],
    [[{ count: 1, kind: "source_cap_pressure" as const }], "medium"],
    [[{ count: 1, kind: "rejected_sequence" as const }], "step_up"],
    [[{ count: 1, kind: "account_correlation" as const }], "high"],
  ])("classifies bounded risk signals", (signals, expected) => {
    expect(classifyStreakIntegrityRisk(signals)).toBe(expected);
  });

  it("preserves non-automation review risk after an automation Step-Up", () => {
    const signals = [
      { count: 1, kind: "rejected_sequence" as const },
      { count: 1, kind: "source_cap_pressure" as const },
    ];

    expect(classifyStreakIntegrityRisk(signals)).toBe("step_up");
    expect(classifyStreakReviewRisk(signals)).toBe("medium");
  });

  it("keeps neutral like observations out of streak review", () => {
    const signals = [
      { count: 1, kind: "like_correlation_observation" as const },
    ];

    expect(classifyStreakIntegrityRisk(signals)).toBe("low");
    expect(classifyStreakReviewRisk(signals)).toBeNull();
  });

  it("counts the acting account in multi-account device correlation", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { kind: "source_cap_pressure", userId: "user-1" },
      { kind: "source_cap_pressure", userId: "user-2" },
    ]);
    const select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ actingCount: 0, count: 2 }]),
      })),
    }));

    await expect(
      assessStreakIntegrityRisk(
        { query: { xpRiskSignal: { findMany } }, select } as never,
        "user-3",
        { deviceHash: "device-a", ipPrefixHash: null },
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({ disposition: "high" });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    );
  });

  it("keeps device account correlation outside the bounded signal sample", async () => {
    const findMany = vi.fn().mockResolvedValue(
      Array.from({ length: 100 }, () => ({
        kind: "like_correlation_observation",
        userId: "user-1",
      }))
    );
    const select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ actingCount: 1, count: 3 }]),
      })),
    }));

    await expect(
      assessStreakIntegrityRisk(
        { query: { xpRiskSignal: { findMany } }, select } as never,
        "user-1",
        { deviceHash: "device-a", ipPrefixHash: null },
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toMatchObject({
      disposition: "high",
      signals: expect.arrayContaining([
        { count: 3, kind: "account_correlation" },
      ]),
    });
  });

  it("reuses the fixed-window counter for bounded action velocity", async () => {
    const cache = {
      expire: vi.fn().mockResolvedValue(true),
      incr: vi.fn().mockResolvedValue(7),
    };

    await expect(
      observeStreakActionRisk(
        cache as never,
        "user-1",
        "device-a",
        "discovery",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toEqual([{ count: 7, kind: "like_toggle_velocity" }]);
    expect(cache.incr).toHaveBeenCalledWith(
      expect.stringContaining(
        "rl:fw:user:user-1:device:device-a:streak/evidence/discovery:"
      )
    );
  });

  it("requires Step-Up when the risk counter is unavailable", async () => {
    const cache = { incr: vi.fn().mockRejectedValue(new Error("offline")) };

    await expect(
      observeStreakActionRisk(
        cache as never,
        "user-1",
        "device-a",
        "discovery",
        new Date("2026-08-08T12:00:00.000Z")
      )
    ).resolves.toEqual([{ count: 7, kind: "like_toggle_velocity" }]);
  });

  it("scopes a 30-minute clearance to both account and device", async () => {
    const cache = {
      get: vi.fn().mockResolvedValue("1"),
      set: vi.fn().mockResolvedValue("OK"),
    };

    await expect(
      getStreakStepUpClearance(cache as never, "user-1", "device-a")
    ).resolves.toBe(true);
    await grantStreakStepUpClearance(cache as never, "user-1", "device-a");

    expect(cache.get).toHaveBeenCalledWith("streak:step-up:user-1:device-a");
    expect(cache.set).toHaveBeenCalledWith(
      "streak:step-up:user-1:device-a",
      "1",
      { EX: 30 * 60 }
    );
  });

  it("fails closed without device correlation", async () => {
    const cache = { get: vi.fn(), set: vi.fn() };
    await expect(
      getStreakStepUpClearance(cache as never, "user-1", null)
    ).resolves.toBe(false);
    await expect(
      grantStreakStepUpClearance(cache as never, "user-1", null)
    ).rejects.toThrow("STREAK_DEVICE_CORRELATION_REQUIRED");
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("treats a Redis read outage as no clearance", async () => {
    const cache = { get: vi.fn().mockRejectedValue(new Error("offline")) };
    await expect(
      getStreakStepUpClearance(cache as never, "user-1", "device-a")
    ).resolves.toBe(false);
  });
});
