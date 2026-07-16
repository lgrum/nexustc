import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  getPostById: vi.fn(),
  render: vi.fn(
    () =>
      new Response("png", {
        headers: { "content-type": "image/png" },
      })
  ),
}));

vi.mock("@/lib/orpc.server", () => ({}));
vi.mock("@/lib/orpc", () => ({
  orpcClient: { post: { getPostById: mocks.getPostById } },
}));
vi.mock("@/lib/content-og-image", () => ({
  renderContentOpenGraphImage: mocks.render,
}));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

const request = new Request("https://nexustc18.com/og/comic/example?v=1");

function callRoute(type: string, identifier = "example") {
  return GET(request, { params: Promise.resolve({ identifier, type }) });
}

describe("content Open Graph image route", () => {
  beforeEach(() => {
    mocks.getPostById.mockReset();
    mocks.render.mockClear();
  });

  it("rejects invalid types and oversized identifiers before lookup", async () => {
    const invalidTypeResponse = await callRoute("news");
    const oversizedIdentifierResponse = await callRoute(
      "comic",
      "x".repeat(256)
    );

    expect(invalidTypeResponse.status).toBe(404);
    expect(oversizedIdentifierResponse.status).toBe(404);
    expect(mocks.getPostById).not.toHaveBeenCalled();
  });

  it("renders only content matching the requested type", async () => {
    mocks.getPostById.mockResolvedValue({
      coverImageObjectKey: null,
      imageObjectKeys: [],
      title: "Wrong type",
      type: "post",
    });

    const response = await callRoute("comic");

    expect(response.status).toBe(404);
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("uses the anonymous API's redacted cover", async () => {
    mocks.getPostById.mockResolvedValue({
      coverImageObjectKey: null,
      earlyAccess: { isRestrictedView: true },
      imageObjectKeys: [],
      title: "VIP Early Access",
      type: "comic",
    });

    const response = await callRoute("comic");

    expect(response.status).toBe(200);
    expect(mocks.getPostById).toHaveBeenCalledWith(
      { slug: "example", type: "comic" },
      { context: { cache: true } }
    );
    expect(mocks.render).toHaveBeenCalledWith({
      coverImageUrl: undefined,
      type: "comic",
    });
  });

  it("returns 404 for missing content and the static fallback for failures", async () => {
    mocks.getPostById.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "NOT_FOUND" })
    );
    const notFoundResponse = await callRoute("comic");
    expect(notFoundResponse.status).toBe(404);

    mocks.getPostById.mockRejectedValueOnce(new Error("unavailable"));
    const response = await callRoute("comic");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://nexustc18.com/og-image.png"
    );
  });
});
