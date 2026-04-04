import { describe, expect, it } from "vitest";

import {
  getPostEarlyAccessView,
  resolveEarlyAccessStorageFields,
} from "./early-access";

describe("early access helpers", () => {
  it("starts the schedule on first publish", () => {
    const now = new Date("2026-04-03T12:00:00.000Z");
    const result = resolveEarlyAccessStorageFields({
      documentStatus: "publish",
      enabled: true,
      now,
      vip12Hours: 24,
      vip8Hours: 48,
    });

    expect(result.earlyAccessStartedAt).toEqual(now);
    expect(result.earlyAccessVip12EndsAt?.toISOString()).toBe(
      "2026-04-04T12:00:00.000Z"
    );
    expect(result.earlyAccessPublicAt?.toISOString()).toBe(
      "2026-04-06T12:00:00.000Z"
    );
  });

  it("keeps unpublished drafts off the clock", () => {
    const result = resolveEarlyAccessStorageFields({
      documentStatus: "draft",
      enabled: true,
      now: new Date("2026-04-03T12:00:00.000Z"),
      vip12Hours: 24,
      vip8Hours: 48,
    });

    expect(result.earlyAccessStartedAt).toBeNull();
    expect(result.earlyAccessVip12EndsAt).toBeNull();
    expect(result.earlyAccessPublicAt).toBeNull();
  });

  it("distinguishes VIP 12 from VIP 8 access", () => {
    const publishedPost = {
      earlyAccessEnabled: true,
      earlyAccessStartedAt: new Date("2026-04-03T12:00:00.000Z"),
      type: "post" as const,
      vip12EarlyAccessHours: 24,
      vip8EarlyAccessHours: 48,
    };

    const vip8ViewDuringPhaseOne = getPostEarlyAccessView(
      publishedPost,
      { role: "user", tier: "level8" },
      new Date("2026-04-04T00:00:00.000Z")
    );
    const vip12ViewDuringPhaseOne = getPostEarlyAccessView(
      publishedPost,
      { role: "user", tier: "level12" },
      new Date("2026-04-04T00:00:00.000Z")
    );
    const vip8ViewDuringPhaseTwo = getPostEarlyAccessView(
      publishedPost,
      { role: "user", tier: "level8" },
      new Date("2026-04-04T18:00:00.000Z")
    );

    expect(vip8ViewDuringPhaseOne.currentState).toBe("VIP12_ONLY");
    expect(vip8ViewDuringPhaseOne.viewerCanAccess).toBe(false);
    expect(vip8ViewDuringPhaseOne.isRestrictedView).toBe(true);

    expect(vip12ViewDuringPhaseOne.viewerCanAccess).toBe(true);
    expect(vip12ViewDuringPhaseOne.isRestrictedView).toBe(false);

    expect(vip8ViewDuringPhaseTwo.currentState).toBe("VIP8_ONLY");
    expect(vip8ViewDuringPhaseTwo.viewerCanAccess).toBe(true);
  });
});
