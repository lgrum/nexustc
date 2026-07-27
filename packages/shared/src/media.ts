export const MEDIA_IMAGE_MIME_TYPES = [
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ADMIN_IMAGE_MAX_FILES = 12;
export const ADMIN_IMAGE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ADMIN_IMAGE_MAX_SELECTION_BYTES = 40 * 1024 * 1024;
export const ADMIN_IMAGE_MAX_DIMENSION = 8192;
export const ADMIN_IMAGE_MAX_DECODED_PIXELS = 40_000_000;
export const ADMIN_RPC_BODY_MAX_BYTES = 96 * 1024 * 1024;

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
