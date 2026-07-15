import { uploadBlobWithProgress } from "@/lib/utils";

export function uploadProfileMedia(
  file: Blob,
  url: string,
  onProgress?: (percent: number) => void
) {
  return uploadBlobWithProgress(file, url, onProgress, {
    "If-None-Match": "*",
  });
}
