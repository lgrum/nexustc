export const MEDIA_IMAGE_MIME_TYPES = [
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const COMIC_MEDIA_MAX_ITEMS = 1000;
export const COMIC_UPLOAD_BATCH_SIZE = 25;
export const COMIC_UPLOAD_CONCURRENCY = 4;
export const COMIC_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

export const MEDIA_OWNER_KINDS = [
  "Juego",
  "Comic",
  "Creador",
  "Emoji",
  "Sticker",
  "Emblema",
  "Anuncio",
  "Articulo",
] as const;

export type MediaOwnerKind = (typeof MEDIA_OWNER_KINDS)[number];
