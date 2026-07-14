import {
  resolvePublishReleasedAt,
  resolveReleasedAt,
} from "./content-timestamps";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const PAST = new Date("2026-07-13T12:00:00.000Z");
const FUTURE = new Date("2026-07-15T12:00:00.000Z");
const LATER = new Date("2026-07-16T12:00:00.000Z");

describe(resolvePublishReleasedAt, () => {
  it("sets publication time only for published content", () => {
    expect(
      resolvePublishReleasedAt({ documentStatus: "draft", now: NOW })
    ).toBeNull();
    expect(
      resolvePublishReleasedAt({ documentStatus: "publish", now: NOW })
    ).toBe(NOW);
    expect(
      resolvePublishReleasedAt({
        documentStatus: "publish",
        now: NOW,
        requestedReleasedAt: FUTURE,
      })
    ).toBe(FUTURE);
    expect(
      resolvePublishReleasedAt({
        documentStatus: "publish",
        now: NOW,
        requestedReleasedAt: PAST,
      })
    ).toBe(NOW);
  });
});

describe(resolveReleasedAt, () => {
  it("publishes or republishes now unless a future time is requested", () => {
    expect(
      resolveReleasedAt({
        documentStatus: "publish",
        existingReleasedAt: PAST,
        now: NOW,
        previousStatus: "draft",
        requestedReleasedAt: PAST,
      })
    ).toBe(NOW);
    expect(
      resolveReleasedAt({
        documentStatus: "publish",
        existingReleasedAt: PAST,
        now: NOW,
        previousStatus: "draft",
        requestedReleasedAt: FUTURE,
      })
    ).toBe(FUTURE);
  });

  it("allows rescheduling only before effective publication", () => {
    expect(
      resolveReleasedAt({
        documentStatus: "publish",
        existingReleasedAt: FUTURE,
        now: NOW,
        previousStatus: "publish",
        requestedReleasedAt: LATER,
      })
    ).toBe(LATER);
    expect(
      resolveReleasedAt({
        documentStatus: "publish",
        existingReleasedAt: FUTURE,
        now: NOW,
        previousStatus: "publish",
        requestedReleasedAt: null,
      })
    ).toBe(NOW);
    expect(
      resolveReleasedAt({
        documentStatus: "publish",
        existingReleasedAt: PAST,
        now: NOW,
        previousStatus: "publish",
        requestedReleasedAt: LATER,
      })
    ).toBe(PAST);
  });

  it("preserves publication time while content is not published", () => {
    expect(
      resolveReleasedAt({
        documentStatus: "draft",
        existingReleasedAt: PAST,
        now: NOW,
        previousStatus: "publish",
      })
    ).toBe(PAST);
  });
});
