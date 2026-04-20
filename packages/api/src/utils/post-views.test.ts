import { getPostViewDedupeKey, getPostViewViewerKey } from "./post-views";

describe(getPostViewViewerKey, () => {
  it("uses the authenticated user id first", () => {
    const key = getPostViewViewerKey({
      anonymousViewerId: "11111111-1111-4111-8111-111111111111",
      headers: new Headers({
        "cf-connecting-ip": "203.0.113.10",
        "user-agent": "Vitest",
      }),
      session: {
        user: {
          id: "user_123",
        },
      } as Parameters<typeof getPostViewViewerKey>[0]["session"],
    });

    expect(key).toBe("user:user_123");
  });

  it("uses the anonymous viewer id for signed-out viewers", () => {
    const key = getPostViewViewerKey({
      anonymousViewerId: "11111111-1111-4111-8111-111111111111",
      headers: new Headers({
        "cf-connecting-ip": "203.0.113.10",
        "user-agent": "Vitest",
      }),
      session: null,
    });

    expect(key).toBe("anon:11111111-1111-4111-8111-111111111111");
  });

  it("falls back to a stable hashed fingerprint", () => {
    const headers = new Headers({
      "user-agent": "Vitest",
      "x-forwarded-for": "203.0.113.10, 198.51.100.20",
    });

    const firstKey = getPostViewViewerKey({ headers, session: null });
    const secondKey = getPostViewViewerKey({ headers, session: null });

    expect(firstKey).toMatch(/^fingerprint:[a-f0-9]{32}$/);
    expect(secondKey).toBe(firstKey);
  });

  it("returns null when no viewer signal is available", () => {
    const key = getPostViewViewerKey({
      headers: new Headers(),
      session: null,
    });

    expect(key).toBeNull();
  });
});

describe(getPostViewDedupeKey, () => {
  it("scopes dedupe by post and viewer", () => {
    expect(getPostViewDedupeKey("post_123", "user:user_123")).toBe(
      "post:view:post_123:user:user_123"
    );
  });
});
