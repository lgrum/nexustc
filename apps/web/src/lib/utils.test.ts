import { getPixelCropRegion } from "./utils";

vi.mock(import("@repo/env/client"), () => ({
  env: {
    VITE_ASSETS_BUCKET_URL: "https://assets.example.com",
    VITE_TURNSTILE_SITE_KEY: "test-site-key",
  },
}));

describe(getPixelCropRegion, () => {
  it("converts percent crop values into pixel bounds", () => {
    expect(
      getPixelCropRegion(1000, 800, {
        height: 40,
        width: 50,
        x: 12.5,
        y: 25,
      })
    ).toStrictEqual({
      height: 320,
      width: 500,
      x: 125,
      y: 200,
    });
  });

  it("clamps crop bounds so they stay inside the image", () => {
    expect(
      getPixelCropRegion(400, 200, {
        height: 40,
        width: 20,
        x: 90,
        y: 75,
      })
    ).toStrictEqual({
      height: 50,
      width: 40,
      x: 360,
      y: 150,
    });
  });

  it("always returns at least one pixel in each dimension", () => {
    expect(
      getPixelCropRegion(640, 160, {
        height: 0.01,
        width: 0.01,
        x: 0,
        y: 0,
      })
    ).toStrictEqual({
      height: 1,
      width: 1,
      x: 0,
      y: 0,
    });
  });
});
