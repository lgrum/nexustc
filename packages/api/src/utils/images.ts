import sharp from "sharp";

export async function optimizeImageToWebp(file: File): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();

  if (file.type === "image/avif") {
    const image = sharp(arrayBuffer);
    return image.webp({ quality: 80 }).toBuffer();
  }

  if (file.type === "image/webp") {
    const image = sharp(arrayBuffer);
    return image.webp({ quality: 80 }).toBuffer();
  }

  if (file.type === "image/jpeg") {
    const image = sharp(arrayBuffer);
    return image.webp({ quality: 80 }).toBuffer();
  }

  if (file.type === "image/png") {
    const image = sharp(arrayBuffer);
    return image.webp({ quality: 80 }).toBuffer();
  }

  if (file.type === "image/gif") {
    const image = sharp(arrayBuffer, { animated: true });
    return image.webp({ quality: 80 }).toBuffer();
  }

  throw new Error(`Unsupported file type: ${file.type}`);
}
