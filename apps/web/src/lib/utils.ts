import { env } from "@repo/env/client";
import type { ProfileCrop } from "@repo/shared/profile";
import { type ClassValue, clsx } from "clsx";
import type { FacehashProps } from "facehash";
import type { CSSProperties } from "react";
import { twMerge } from "tailwind-merge";

const defaultFacehashColors = [
  "#ef4444",
  "#f97316",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export const defaultFacehashProps: Omit<FacehashProps, "name"> = {
  colors: defaultFacehashColors,
  variant: "solid",
};

export function getFacehashProps(
  fallbackColor?: string | null
): Omit<FacehashProps, "name"> {
  if (!fallbackColor) {
    return defaultFacehashProps;
  }

  return {
    colors: [fallbackColor, ...defaultFacehashColors],
    variant: "solid",
  };
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uploadBlobWithProgress(
  blob: Blob,
  url: string,
  onProgress: (percent: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.setRequestHeader(
      "Content-Type",
      blob.type || "application/octet-stream"
    );
    xhr.send(blob);
  });
}

const extensionRegex = /\.\w+$/;
const formats = {
  jpeg: { type: "image/jpeg", extension: "jpg" },
  png: { type: "image/png", extension: "png" },
  gif: { type: "image/gif", extension: "gif" },
  webp: { type: "image/webp", extension: "webp" },
  avif: { type: "image/avif", extension: "avif" },
} as const;

export async function convertImage(
  file: File,
  format: keyof typeof formats = "avif",
  quality = 0.8
) {
  const selectedFormat = formats[format];
  const originalBitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = originalBitmap.width;
  canvas.height = originalBitmap.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context not available");
  }

  ctx.drawImage(originalBitmap, 0, 0);

  const convertedBlob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, selectedFormat.type, quality)
  );

  if (!convertedBlob) {
    throw new Error("Fallo al convertir imagen");
  }

  const convertedFile = new File(
    [convertedBlob],
    file.name.replace(extensionRegex, `.${selectedFormat.extension}`),
    { type: selectedFormat.type }
  );

  return convertedFile;
}

type Meta = {
  version?: string;
  adsLink?: string;
  premiumLink?: string;
};

export function parseMetaToObject(
  meta: {
    metaKey: string;
    metaValue: unknown;
  }[]
) {
  return meta.reduce((acc, curr) => {
    (acc as Record<string, unknown>)[curr.metaKey] = curr.metaValue;
    return acc;
  }, {} as Meta);
}

export function getCookie(name: string): string | null {
  const cookies = document.cookie.split("; ");
  for (const cookie of cookies) {
    const [key, value] = cookie.split("=");
    if (key === name) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

export function getBucketUrl(object: string) {
  if (object.startsWith("blob:")) {
    return object;
  }

  return `${env.VITE_ASSETS_BUCKET_URL}/${object}`;
}

const TIER_BREAKPOINTS = {
  0: "bg-gray-400",
  20: "bg-green-400",
  100: "bg-blue-400",
  500: "bg-purple-400",
  1000: "bg-amber-400",
};

export function getTierColor(favoriteCount: number) {
  let tierColor = "bg-gray-400"; // Default color

  for (const [threshold, color] of Object.entries(TIER_BREAKPOINTS)) {
    if (favoriteCount >= Number(threshold)) {
      tierColor = color;
    } else {
      break;
    }
  }

  return tierColor;
}

export function pickTextColor(
  rgb: [number, number, number]
): "black" | "white" {
  const [r, g, b] = rgb;

  // Perceptual luminance approximation
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;

  return yiq >= 128 ? "black" : "white";
}

const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
const resultRegex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

export function hexToRgb(hex: string): [number, number, number] | null {
  const newHex = hex.replace(
    shorthandRegex,
    (_m, r, g, b) => r + r + g + g + b + b
  );
  const result = resultRegex.exec(newHex);
  return result
    ? [
        Number.parseInt(result[1], 16),
        Number.parseInt(result[2], 16),
        Number.parseInt(result[3], 16),
      ]
    : null;
}

export function pickTextColorFromHex(
  hex: string | null | undefined
): "black" | "white" | undefined {
  if (!hex) {
    return;
  }

  const rgb = hexToRgb(hex);

  if (!rgb) {
    return;
  }

  return pickTextColor(rgb);
}

export function getProfileImageStyles(crop?: ProfileCrop | null) {
  if (!crop) {
    return undefined;
  }

  const scale = Math.max(1 / crop.width, 1 / crop.height);

  return {
    objectPosition: `${crop.x * 100}% ${crop.y * 100}%`,
    transform: `scale(${scale})`,
    transformOrigin: "center center",
  } satisfies CSSProperties;
}
