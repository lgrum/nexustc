import { MEDIA_IMAGE_MIME_TYPES } from "@repo/shared/media";
import sharp from "sharp";

const OPTIMIZED_IMAGE_MIME_TYPE = "image/webp";
const OPTIMIZED_IMAGE_EXTENSION = "webp";
const DEFAULT_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_FRAME_DIMENSION = 8192;
const MAX_FRAME_COUNT = 1000;
const MAX_DECODED_PIXELS = 40_000_000;
const SUPPORTED_IMAGE_MIME_TYPES = new Set<string>(MEDIA_IMAGE_MIME_TYPES);
type SupportedImageMimeType = (typeof MEDIA_IMAGE_MIME_TYPES)[number];
const SHARP_FORMAT_BY_MIME_TYPE = {
  "image/avif": "heif",
  "image/gif": "gif",
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
} satisfies Record<SupportedImageMimeType, string>;

export type OptimizedImageFile = {
  buffer: Buffer;
  durationMs: number | null;
  extension: typeof OPTIMIZED_IMAGE_EXTENSION;
  fileSizeBytes: number;
  height: number;
  isAnimated: boolean;
  mimeType: typeof OPTIMIZED_IMAGE_MIME_TYPE;
  width: number;
};

type OptimizeImageOptions = {
  maxSourceBytes?: number;
};

function assertSourceWithinLimit(
  sourceBytes: number,
  options?: OptimizeImageOptions
) {
  if (sourceBytes > (options?.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES)) {
    throw new Error("Image source exceeds byte limit");
  }
}

function isSupportedImageMimeType(
  mimeType: string
): mimeType is SupportedImageMimeType {
  return SUPPORTED_IMAGE_MIME_TYPES.has(mimeType);
}

export async function optimizeImageBuffer(
  source: Buffer,
  mimeType: string,
  options?: OptimizeImageOptions
): Promise<OptimizedImageFile> {
  if (!isSupportedImageMimeType(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }

  assertSourceWithinLimit(source.byteLength, options);

  const image = sharp(source, {
    animated: true,
    limitInputPixels: MAX_DECODED_PIXELS,
  });

  let metadata;
  try {
    metadata = await image.metadata();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Input image exceeds pixel limit"
    ) {
      throw new Error("Image decoded pixels exceed limit", { cause: error });
    }
    throw error;
  }

  if (metadata.format !== SHARP_FORMAT_BY_MIME_TYPE[mimeType]) {
    throw new Error("Invalid image data");
  }

  const { width } = metadata;
  const height = metadata.pageHeight ?? metadata.height;
  const frameCount = metadata.pages ?? 1;

  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    !width ||
    !height
  ) {
    throw new Error("Invalid image dimensions");
  }

  if (width > MAX_FRAME_DIMENSION || height > MAX_FRAME_DIMENSION) {
    throw new Error("Image frame dimensions exceed limit");
  }

  if (
    !Number.isSafeInteger(frameCount) ||
    frameCount < 1 ||
    frameCount > MAX_FRAME_COUNT
  ) {
    throw new Error("Image frame count exceeds limit");
  }

  const decodedPixels = width * height * frameCount;
  if (
    !Number.isSafeInteger(decodedPixels) ||
    decodedPixels > MAX_DECODED_PIXELS
  ) {
    throw new Error("Image decoded pixels exceed limit");
  }

  const isAnimated = frameCount > 1;
  const durationMs =
    isAnimated && metadata.delay
      ? metadata.delay.reduce((total, delay) => total + delay, 0)
      : null;
  let buffer = source;
  if (metadata.format === "webp") {
    await image.stats();
  } else {
    buffer = await image.webp({ quality: 80 }).toBuffer();
  }

  return {
    buffer,
    durationMs,
    extension: OPTIMIZED_IMAGE_EXTENSION,
    fileSizeBytes: buffer.byteLength,
    height,
    isAnimated,
    mimeType: OPTIMIZED_IMAGE_MIME_TYPE,
    width,
  };
}

export async function optimizeFile(
  file: File,
  options?: OptimizeImageOptions
): Promise<OptimizedImageFile> {
  assertSourceWithinLimit(file.size, options);

  return await optimizeImageBuffer(
    Buffer.from(await file.arrayBuffer()),
    file.type,
    options
  );
}
