// @vitest-environment node

import sharp from "sharp";
import { expect, test } from "vitest";

import { renderContentOpenGraphImage } from "./content-og-image";

test("renders a coverless image as a 1200 by 630 PNG", async () => {
  const response = await renderContentOpenGraphImage({
    type: "comic",
  });
  const image = new DataView(await response.arrayBuffer());

  expect(response.headers.get("content-type")).toBe("image/png");
  expect(image.getUint32(16)).toBe(1200);
  expect(image.getUint32(20)).toBe(630);
});

test("renders a WebP cover as a PNG", async () => {
  const cover = Buffer.from(
    "UklGRjQAAABXRUJQVlA4ICgAAABwAQCdASoCAAIAAUAmJaACdAFAAAD++nlf/xDn9bf9ymxSVer0NAAA",
    "base64"
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => Promise.resolve(new Response(cover));

  try {
    const response = await renderContentOpenGraphImage({
      coverImageUrl: "https://assets.example/cover.webp",
      type: "post",
    });
    const { data, info } = await sharp(await response.arrayBuffer())
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const brightnessAt = (y: number) => {
      const offset = (y * info.width + 600) * info.channels;
      return data[offset] + data[offset + 1] + data[offset + 2];
    };

    expect(response.headers.get("content-type")).toBe("image/png");
    expect(brightnessAt(80)).toBeGreaterThan(brightnessAt(550) + 40);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
