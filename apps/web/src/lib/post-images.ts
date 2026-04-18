export function getDisplayImageObjectKeys(
  imageObjectKeys: string[] | null | undefined,
  coverImageObjectKey?: string | null
) {
  const images = imageObjectKeys ?? [];

  if (!coverImageObjectKey) {
    return images;
  }

  return [
    coverImageObjectKey,
    ...images.filter((image) => image !== coverImageObjectKey),
  ];
}

export function getCoverImageObjectKey(
  imageObjectKeys: string[] | null | undefined,
  coverImageObjectKey?: string | null
) {
  return coverImageObjectKey ?? imageObjectKeys?.[0] ?? null;
}
