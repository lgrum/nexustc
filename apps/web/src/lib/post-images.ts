export type ThumbnailImageCount = 1 | 4;

export function getThumbnailImageObjectKeys(
  imageObjectKeys: string[] | null | undefined,
  thumbnailImageCount: number | null | undefined = 4,
  coverImageObjectKey?: string | null
) {
  const imageLimit = thumbnailImageCount === 1 ? 1 : 4;

  return getGalleryImageObjectKeys(imageObjectKeys, coverImageObjectKey).slice(
    0,
    imageLimit
  );
}

export function getGalleryImageObjectKeys(
  imageObjectKeys: string[] | null | undefined,
  coverImageObjectKey?: string | null
) {
  if (!coverImageObjectKey) {
    return imageObjectKeys ?? [];
  }

  return (imageObjectKeys ?? []).filter(
    (image) => image !== coverImageObjectKey
  );
}

export function getCoverImageObjectKey(
  imageObjectKeys: string[] | null | undefined,
  coverImageObjectKey?: string | null
) {
  return coverImageObjectKey ?? imageObjectKeys?.[0] ?? null;
}
