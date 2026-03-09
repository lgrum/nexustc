import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/env/client", () => ({
  env: {
    VITE_ASSETS_BUCKET_URL: "https://assets.example.com",
    VITE_TURNSTILE_SITE_KEY: "test-site-key",
  },
}));

import { getPixelCropRegion } from "./utils";

describe("getPixelCropRegion", () => {
  it("converts percent crop values into pixel bounds", () => {
    expect(
      getPixelCropRegion(1000, 800, {
        x: 12.5,
        y: 25,
        width: 50,
        height: 40,
      })
    ).toEqual({
      x: 125,
      y: 200,
      width: 500,
      height: 320,
    });
  });

  it("clamps crop bounds so they stay inside the image", () => {
    expect(
      getPixelCropRegion(400, 200, {
        x: 90,
        y: 75,
        width: 20,
        height: 40,
      })
    ).toEqual({
      x: 360,
      y: 150,
      width: 40,
      height: 50,
    });
  });

  it("always returns at least one pixel in each dimension", () => {
    expect(
      getPixelCropRegion(640, 160, {
        x: 0,
        y: 0,
        width: 0.01,
        height: 0.01,
      })
    ).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });
});
