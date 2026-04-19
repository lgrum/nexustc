import sharp from "sharp";

const OPTIMIZED_IMAGE_MIME_TYPE = "image/webp";
const OPTIMIZED_IMAGE_EXTENSION = "webp";
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type OptimizedImageFile = {
  buffer: Buffer;
  extension: typeof OPTIMIZED_IMAGE_EXTENSION;
  mimeType: typeof OPTIMIZED_IMAGE_MIME_TYPE;
};

export async function optimizeFile(file: File): Promise<OptimizedImageFile> {
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const image =
    file.type === "image/gif"
      ? sharp(arrayBuffer, { animated: true })
      : sharp(arrayBuffer);

  return {
    buffer: await image.webp({ quality: 80 }).toBuffer(),
    extension: OPTIMIZED_IMAGE_EXTENSION,
    mimeType: OPTIMIZED_IMAGE_MIME_TYPE,
  };
}
