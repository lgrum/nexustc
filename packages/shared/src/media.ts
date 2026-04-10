export const MEDIA_IMAGE_MIME_TYPES = [
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MEDIA_OWNER_KINDS = [
  "Juego",
  "Comic",
  "Emoji",
  "Sticker",
  "Anuncio",
  "Articulo",
] as const;

export type MediaOwnerKind = (typeof MEDIA_OWNER_KINDS)[number];
