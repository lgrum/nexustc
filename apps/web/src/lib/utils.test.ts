vi.mock("@repo/env", () => ({
  env: {
    NEXT_PUBLIC_ASSETS_BUCKET_URL: "https://assets.example.com",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "test-site-key",
  },
}));

const { getDeterministicHue, getPixelCropRegion, uploadBlobWithProgress } =
  await import("./utils");

it("sends upload precondition headers", async () => {
  const setRequestHeader = vi.spyOn(
    XMLHttpRequest.prototype,
    "setRequestHeader"
  );
  vi.spyOn(XMLHttpRequest.prototype, "send").mockImplementation(
    function send() {
      Object.defineProperty(this, "status", { value: 200 });
      this.dispatchEvent(new Event("load"));
    }
  );

  await uploadBlobWithProgress(
    new Blob(["page"], { type: "image/webp" }),
    "https://uploads.test/page.webp",
    undefined,
    { "If-None-Match": "*" }
  );

  expect(setRequestHeader).toHaveBeenCalledWith("If-None-Match", "*");
  vi.restoreAllMocks();
});

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

describe(getDeterministicHue, () => {
  it("returns the same hue for equivalent labels", () => {
    expect(getDeterministicHue(" Visual Novel ")).toBe(
      getDeterministicHue("visual novel")
    );
  });

  it("keeps hues inside the valid range", () => {
    const hue = getDeterministicHue("Aventura");

    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });

  it("spreads different labels across distinct hues", () => {
    const hues = [
      "RPG",
      "Visual Novel",
      "Sandbox",
      "Accion",
      "Aventura",
      "Simulacion",
      "Anime",
      "Horror",
      "Romance",
      "Estrategia",
    ].map((label) => getDeterministicHue(label));

    expect(new Set(hues).size).toBe(hues.length);
  });
});
