import {
  ADMIN_IMAGE_MAX_FILES,
  ADMIN_IMAGE_MAX_FILE_BYTES,
  ADMIN_IMAGE_MAX_SELECTION_BYTES,
} from "@repo/shared/media";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import {
  adminImageFileSchema,
  adminImageFilesSchema,
  optimizeFile,
  optimizeImageBuffer,
} from "./images";

const STATIC_FORMATS = [
  ["image/avif", "avif"],
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
] as const;

async function createStaticImage(
  format: (typeof STATIC_FORMATS)[number][1],
  width = 32,
  height = 32
) {
  const image = sharp({
    create: {
      background: "#f97316",
      channels: 3,
      height,
      width,
    },
  });

  return await image[format]().toBuffer();
}

async function createAnimatedGif({
  frameCount = 2,
  frameHeight = 2,
  frameWidth = 2,
}: {
  frameCount?: number;
  frameHeight?: number;
  frameWidth?: number;
} = {}) {
  const frameBytes = frameHeight * frameWidth * 3;
  const pixels = Buffer.alloc(frameBytes * frameCount);

  for (let frame = 0; frame < frameCount; frame += 1) {
    pixels.fill(
      frame % 2 === 0 ? 32 : 224,
      frame * frameBytes,
      (frame + 1) * frameBytes
    );
  }

  return await sharp(pixels, {
    raw: {
      channels: 3,
      height: frameHeight * frameCount,
      pageHeight: frameHeight,
      width: frameWidth,
    },
  })
    .gif({ delay: Array.from({ length: frameCount }, () => 120), loop: 3 })
    .toBuffer();
}

function createFileWithSize(size: number, type = "image/png") {
  const file = new File(["image"], "image.png", { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

describe("image optimizer", () => {
  it.each(STATIC_FORMATS)(
    "canonicalizes %s source bytes",
    async (mimeType, format) => {
      const source = await createStaticImage(format);
      const result = await optimizeImageBuffer(source, mimeType);

      expect(result).toMatchObject({
        durationMs: null,
        extension: "webp",
        fileSizeBytes: result.buffer.byteLength,
        height: 32,
        isAnimated: false,
        mimeType: "image/webp",
        width: 32,
      });
      const metadata = await sharp(result.buffer).metadata();
      expect(metadata.format).toBe("webp");

      if (mimeType === "image/webp") {
        expect(result.buffer).toEqual(source);
      }
    }
  );

  it("preserves GIF animation timing and looping in canonical WebP", async () => {
    const source = await createAnimatedGif();
    const result = await optimizeImageBuffer(source, "image/gif");
    const metadata = await sharp(result.buffer, { animated: true }).metadata();

    expect(result).toMatchObject({
      durationMs: 240,
      extension: "webp",
      fileSizeBytes: result.buffer.byteLength,
      height: 2,
      isAnimated: true,
      mimeType: "image/webp",
      width: 2,
    });
    expect(metadata).toMatchObject({
      delay: [120, 120],
      format: "webp",
      loop: 3,
      pageHeight: 2,
      pages: 2,
    });
  });

  it("keeps the existing File interface on the shared processing path", async () => {
    const source = await createStaticImage("png");
    const result = await optimizeFile(
      new File([source], "image.png", { type: "image/png" })
    );

    expect(result).toMatchObject({
      height: 32,
      mimeType: "image/webp",
      width: 32,
    });
  });

  it("rejects unsupported MIME types before inspecting bytes", async () => {
    await expect(
      optimizeImageBuffer(Buffer.from("not an image"), "image/svg+xml")
    ).rejects.toThrow("Unsupported image type");
  });

  it("rejects invalid image bytes deterministically", async () => {
    await expect(
      optimizeImageBuffer(Buffer.from("not an image"), "image/png")
    ).rejects.toThrow();
  });

  it("rejects truncated WebP instead of retaining it", async () => {
    const source = await createStaticImage("webp");

    await expect(
      optimizeImageBuffer(
        source.subarray(0, source.byteLength - 10),
        "image/webp"
      )
    ).rejects.toThrow();
  });

  it("rejects source bytes above the caller's limit", async () => {
    const source = await createStaticImage("png");

    await expect(
      optimizeImageBuffer(source, "image/png", {
        maxSourceBytes: source.byteLength - 1,
      })
    ).rejects.toThrow("Image source exceeds byte limit");
  });

  it("rejects oversized files before reading their bytes", async () => {
    const file = createFileWithSize(ADMIN_IMAGE_MAX_FILE_BYTES + 1);
    const arrayBuffer = vi.fn();
    Object.defineProperty(file, "arrayBuffer", {
      value: arrayBuffer,
    });

    await expect(optimizeFile(file)).rejects.toThrow(
      "Image source exceeds byte limit"
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects oversized frame dimensions", async () => {
    const source = await createStaticImage("png", 8193, 1);

    await expect(optimizeImageBuffer(source, "image/png")).rejects.toThrow(
      "Image frame dimensions exceed limit"
    );
  });

  it("rejects excessive animation frame counts", async () => {
    const source = await createAnimatedGif({
      frameCount: 1001,
      frameHeight: 1,
      frameWidth: 1,
    });

    await expect(optimizeImageBuffer(source, "image/gif")).rejects.toThrow(
      "Image frame count exceeds limit"
    );
  });

  it("rejects decoded-pixel overflow", async () => {
    const source = await createAnimatedGif({
      frameCount: 2,
      frameHeight: 4000,
      frameWidth: 6000,
    });

    await expect(optimizeImageBuffer(source, "image/gif")).rejects.toThrow(
      "Image decoded pixels exceed limit"
    );
  });
});

describe("admin image input", () => {
  it("enforces the shared MIME and per-file byte limits", () => {
    expect(
      adminImageFileSchema.safeParse(
        createFileWithSize(ADMIN_IMAGE_MAX_FILE_BYTES)
      ).success
    ).toBe(true);
    expect(
      adminImageFileSchema.safeParse(
        createFileWithSize(ADMIN_IMAGE_MAX_FILE_BYTES + 1)
      ).success
    ).toBe(false);
    expect(
      adminImageFileSchema.safeParse(createFileWithSize(1, "image/svg+xml"))
        .success
    ).toBe(false);
  });

  it("enforces file-count and aggregate-selection byte limits", () => {
    const maximumSelection = Array.from(
      { length: ADMIN_IMAGE_MAX_FILES },
      (_, index) =>
        createFileWithSize(
          index < 4 ? ADMIN_IMAGE_MAX_FILE_BYTES : 0,
          "image/png"
        )
    );

    expect(maximumSelection.reduce((total, file) => total + file.size, 0)).toBe(
      ADMIN_IMAGE_MAX_SELECTION_BYTES
    );
    expect(adminImageFilesSchema.safeParse(maximumSelection).success).toBe(
      true
    );
    expect(
      adminImageFilesSchema.safeParse([
        ...maximumSelection,
        createFileWithSize(0),
      ]).success
    ).toBe(false);
    expect(
      adminImageFilesSchema.safeParse(
        Array.from({ length: 5 }, () => createFileWithSize(9 * 1024 * 1024))
      ).success
    ).toBe(false);
  });
});
