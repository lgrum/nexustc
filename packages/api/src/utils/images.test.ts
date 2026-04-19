import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { optimizeFile } from "./images";

async function createImageFile(type: "image/avif" | "image/png") {
  const image = sharp({
    create: {
      background: "#f97316",
      channels: 3,
      height: 32,
      width: 32,
    },
  });
  const buffer =
    type === "image/avif"
      ? await image.avif().toBuffer()
      : await image.png().toBuffer();

  return new File(
    [buffer],
    type === "image/avif" ? "image.avif" : "image.png",
    {
      type,
    }
  );
}

describe("optimizeFile", () => {
  it("converts PNG uploads to WebP", async () => {
    const result = await optimizeFile(await createImageFile("image/png"));
    const metadata = await sharp(result.buffer).metadata();

    expect(result.extension).toBe("webp");
    expect(result.mimeType).toBe("image/webp");
    expect(metadata.format).toBe("webp");
  });

  it("converts AVIF uploads to WebP", async () => {
    const result = await optimizeFile(await createImageFile("image/avif"));
    const metadata = await sharp(result.buffer).metadata();

    expect(result.extension).toBe("webp");
    expect(result.mimeType).toBe("image/webp");
    expect(metadata.format).toBe("webp");
  });
});
