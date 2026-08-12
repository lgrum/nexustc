import { describe, expect, it } from "vitest";

import {
  assessXpSourceCapPressure,
  buildPendingXpReleaseCommand,
  classifyIntegrityDisposition,
  normalizeIntegrityDecisionActor,
  sanitizeIntegrityEvidence,
} from "./integrity";

describe("XP integrity disposition", () => {
  it("rejects invalid proof, posts low risk, and reserves permanent action for staff", () => {
    expect(classifyIntegrityDisposition({ invalidProof: true })).toBe("reject");
    expect(classifyIntegrityDisposition({})).toBe("low");
    expect(classifyIntegrityDisposition({ riskLevel: "medium" })).toBe(
      "medium"
    );
    expect(classifyIntegrityDisposition({ riskLevel: "high" })).toBe("high");
  });

  it("holds only source awards that reach their own configured cap", () => {
    const correlation = {
      deviceHash: "device-hash",
      ipPrefixHash: "ip-prefix-hash",
    };
    expect(
      assessXpSourceCapPressure({ limit: 200, observed: 199, source: "comic" })
    ).toEqual({ disposition: "low" });
    expect(
      assessXpSourceCapPressure({
        correlation,
        limit: 200,
        observed: 200,
        source: "comic",
      })
    ).toMatchObject({
      correlation,
      disposition: "medium",
      signals: [{ count: 1, kind: "source_cap_pressure" }],
    });
  });

  it("shapes case evidence without hashes, thresholds, notes, or identities", () => {
    expect(
      sanitizeIntegrityEvidence({
        deviceHash: "secret-device",
        moderatorNote: "secret-note",
        signals: [
          { count: 3, kind: "like_toggle_velocity", threshold: 2 },
          { count: -1, kind: "bad" },
        ],
        userId: "other-user",
      })
    ).toEqual({ signals: [{ count: 3, kind: "like_toggle_velocity" }] });
  });

  it("records automated release with no fake user foreign key", () => {
    expect(normalizeIntegrityDecisionActor()).toBeNull();
    expect(normalizeIntegrityDecisionActor("moderator-1")).toBe("moderator-1");
  });

  it("keeps a released comic award on its original UTC source day", () => {
    const sourceCreatedAt = new Date("2026-08-07T23:59:59.000Z");
    const command = buildPendingXpReleaseCommand(
      {
        amount: 1,
        createdAt: sourceCreatedAt,
        id: "pending-comic-1",
        kind: "comic_reading",
        milestone: null,
        reasonCode: "verified_comic_reading",
        sourceRef: "comic:comic-1:pages:200",
        subjectId: null,
        userId: "user-1",
      },
      "case-1"
    );

    expect(command.sourceCreatedAt).toEqual(sourceCreatedAt);
    expect(new Date("2026-08-08T00:00:01.000Z").getUTCDate()).not.toBe(
      command.sourceCreatedAt?.getUTCDate()
    );
  });

  it("preserves original streak metadata when Pending XP is released", () => {
    const command = buildPendingXpReleaseCommand(
      {
        amount: 25,
        createdAt: new Date("2026-08-08T12:00:00.000Z"),
        id: "pending-streak-1",
        kind: "streak_day",
        metadata: { dayKey: "user-1:1:2026-08-08", path: "reading" },
        milestone: null,
        reasonCode: "streak_day_completed",
        sourceRef: "comic:comic-1:page:3",
        subjectId: null,
        userId: "user-1",
      },
      "case-1"
    );

    expect(command.metadata).toEqual({
      dayKey: "user-1:1:2026-08-08",
      path: "reading",
      releasedPendingEventId: "pending-streak-1",
    });
  });
});
