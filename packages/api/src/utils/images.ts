import {
  ADMIN_IMAGE_MAX_DECODED_PIXELS,
  ADMIN_IMAGE_MAX_DIMENSION,
  ADMIN_IMAGE_MAX_FILES,
  ADMIN_IMAGE_MAX_FILE_BYTES,
  ADMIN_IMAGE_MAX_SELECTION_BYTES,
  MEDIA_IMAGE_MIME_TYPES,
} from "@repo/shared/media";
import sharp from "sharp";
import z from "zod";

const OPTIMIZED_IMAGE_MIME_TYPE = "image/webp";
const OPTIMIZED_IMAGE_EXTENSION = "webp";
const MAX_FRAME_COUNT = 1000;
const SUPPORTED_IMAGE_MIME_TYPES = new Set<string>(MEDIA_IMAGE_MIME_TYPES);
type SupportedImageMimeType = (typeof MEDIA_IMAGE_MIME_TYPES)[number];
const SHARP_FORMAT_BY_MIME_TYPE = {
  "image/avif": "heif",
  "image/gif": "gif",
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
} satisfies Record<SupportedImageMimeType, string>;

export const adminImageFileSchema = z
  .file()
  .mime([...MEDIA_IMAGE_MIME_TYPES])
  .max(ADMIN_IMAGE_MAX_FILE_BYTES);

export const adminImageFilesSchema = z
  .array(adminImageFileSchema)
  .min(1)
  .max(ADMIN_IMAGE_MAX_FILES)
  .refine(
    (files) =>
      files.reduce((total, file) => total + file.size, 0) <=
      ADMIN_IMAGE_MAX_SELECTION_BYTES
  );

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
  if (sourceBytes > (options?.maxSourceBytes ?? ADMIN_IMAGE_MAX_FILE_BYTES)) {
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
    limitInputPixels: ADMIN_IMAGE_MAX_DECODED_PIXELS,
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

  if (width > ADMIN_IMAGE_MAX_DIMENSION || height > ADMIN_IMAGE_MAX_DIMENSION) {
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
    decodedPixels > ADMIN_IMAGE_MAX_DECODED_PIXELS
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
