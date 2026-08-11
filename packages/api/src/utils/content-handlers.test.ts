import { deleteContent } from "./content-handlers";
import {
  resolvePublishReleasedAt,
  resolveReleasedAt,
  resolveVersionUpdatedAt,
} from "./content-timestamps";

const rewards = vi.hoisted(() => ({ markRemoved: vi.fn() }));

vi.mock("../services/contribution-rewards", () => ({
  markParentPostContributionSubjectsRemovedInTransaction: rewards.markRemoved,
}));

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

describe(resolveVersionUpdatedAt, () => {
  it("tracks version changes only after effective publication", () => {
    expect(
      resolveVersionUpdatedAt({
        documentStatus: "draft",
        existingReleasedAt: null,
        nextReleasedAt: null,
        now: NOW,
        previousStatus: "draft",
        versionChanged: true,
      })
    ).toBeUndefined();
    expect(
      resolveVersionUpdatedAt({
        documentStatus: "publish",
        existingReleasedAt: null,
        nextReleasedAt: NOW,
        now: NOW,
        previousStatus: "draft",
        versionChanged: true,
      })
    ).toBeNull();
    expect(
      resolveVersionUpdatedAt({
        documentStatus: "publish",
        existingReleasedAt: PAST,
        nextReleasedAt: PAST,
        now: NOW,
        previousStatus: "publish",
        versionChanged: true,
      })
    ).toBe(NOW);
    expect(
      resolveVersionUpdatedAt({
        documentStatus: "publish",
        existingReleasedAt: FUTURE,
        nextReleasedAt: FUTURE,
        now: NOW,
        previousStatus: "publish",
        versionChanged: true,
      })
    ).toBeNull();
  });
});

describe(deleteContent, () => {
  it("does not remove reward subjects when the content type does not match", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const tx = {
      delete: vi.fn(() => ({
        where: vi.fn(() => ({ returning })),
      })),
    };
    const db = {
      transaction: vi.fn((callback) => callback(tx)),
    };

    await expect(
      deleteContent({
        context: {
          db,
          headers: new Headers(),
          session: { user: { id: "owner-1" } },
        } as never,
        errors: {
          BAD_REQUEST: () => new Error("BAD_REQUEST"),
          NOT_FOUND: () => new Error("NOT_FOUND"),
        },
        input: { id: "comic-1", type: "post" },
      })
    ).rejects.toThrow("NOT_FOUND");
    expect(rewards.markRemoved).not.toHaveBeenCalled();
  });
});
