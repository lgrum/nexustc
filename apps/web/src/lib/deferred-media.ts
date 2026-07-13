import {
  COMIC_MEDIA_MAX_ITEMS,
  MEDIA_IMAGE_MIME_TYPES,
} from "@repo/shared/media";
import {
  comicCreateSchema,
  comicEditSchema,
  globalAnnouncementSchema,
  newsArticleCreateSchema,
  postCreateSchema,
  postEditSchema,
} from "@repo/shared/schemas";
import z from "zod";

export const deferredExistingMediaItemSchema = z.object({
  kind: z.literal("existing"),
  mediaId: z.string().min(1),
  objectKey: z.string().min(1).optional(),
  selectionId: z.string().min(1),
});

export const deferredPendingMediaItemSchema = z.object({
  file: z.file().mime([...MEDIA_IMAGE_MIME_TYPES]),
  kind: z.literal("pending"),
  objectKey: z.string().min(1).optional(),
  previewUrl: z.string().min(1),
  selectionId: z.string().min(1),
});

export const deferredUploadedMediaItemSchema = z.object({
  kind: z.literal("uploaded"),
  objectKey: z.string().min(1),
  selectionId: z.string().min(1),
});

export const deferredMediaItemSchema = z.discriminatedUnion("kind", [
  deferredExistingMediaItemSchema,
  deferredPendingMediaItemSchema,
]);

export const comicMediaItemSchema = z.discriminatedUnion("kind", [
  deferredExistingMediaItemSchema,
  deferredPendingMediaItemSchema,
  deferredUploadedMediaItemSchema,
]);

export const deferredMediaSelectionSchema = z
  .array(deferredMediaItemSchema)
  .max(100);

export const comicMediaSelectionSchema = z
  .array(comicMediaItemSchema)
  .max(COMIC_MEDIA_MAX_ITEMS);

export const requiredSingleDeferredMediaSelectionSchema =
  deferredMediaSelectionSchema.min(1).max(1);

export const optionalSingleDeferredMediaSelectionSchema =
  deferredMediaSelectionSchema.max(1);

export type DeferredExistingMediaItem = z.infer<
  typeof deferredExistingMediaItemSchema
>;
export type DeferredPendingMediaItem = z.infer<
  typeof deferredPendingMediaItemSchema
>;
export type DeferredMediaItem = z.infer<typeof deferredMediaItemSchema>;
export type DeferredMediaSelection = z.infer<
  typeof deferredMediaSelectionSchema
>;
export type ComicDeferredMediaItem = z.infer<typeof comicMediaItemSchema>;
export type ComicDeferredMediaSelection = z.infer<
  typeof comicMediaSelectionSchema
>;

type MediaLibraryLookup = {
  objectKey: string;
};

export const postAdminFormSchema = postCreateSchema
  .omit({ coverMediaIds: true, mediaIds: true })
  .extend({
    coverImageSelection: optionalSingleDeferredMediaSelectionSchema,
    mediaSelection: deferredMediaSelectionSchema,
  });

export const postAdminEditFormSchema = postEditSchema
  .omit({ coverMediaIds: true, mediaIds: true })
  .extend({
    coverImageSelection: optionalSingleDeferredMediaSelectionSchema,
    mediaSelection: deferredMediaSelectionSchema,
  });

export const comicAdminFormSchema = comicCreateSchema
  .omit({ coverMediaIds: true, mediaIds: true })
  .extend({
    comicUploadSessionId: z.string().min(1).optional(),
    coverImageSelection: optionalSingleDeferredMediaSelectionSchema,
    mediaSelection: comicMediaSelectionSchema,
  });

export const comicAdminEditFormSchema = comicEditSchema
  .omit({ coverMediaIds: true, mediaIds: true })
  .extend({
    comicUploadSessionId: z.string().min(1).optional(),
    coverImageSelection: optionalSingleDeferredMediaSelectionSchema,
    mediaSelection: comicMediaSelectionSchema,
  });

export const globalAnnouncementFormSchema = globalAnnouncementSchema
  .omit({ imageObjectKey: true })
  .extend({
    imageSelection: optionalSingleDeferredMediaSelectionSchema,
  });

export const newsArticleFormSchema = newsArticleCreateSchema
  .omit({ bannerImageObjectKey: true })
  .extend({
    bannerImageSelection: optionalSingleDeferredMediaSelectionSchema,
  });

export function createExistingDeferredMediaItem(
  mediaId: string
): DeferredExistingMediaItem {
  return {
    kind: "existing",
    mediaId,
    selectionId: `existing:${mediaId}`,
  };
}

export function createPendingDeferredMediaItem(
  file: File
): DeferredPendingMediaItem {
  return {
    file,
    kind: "pending",
    previewUrl: URL.createObjectURL(file),
    selectionId: crypto.randomUUID(),
  };
}

export function createDeferredMediaSelectionFromExistingIds(
  mediaIds: string[]
): DeferredMediaSelection {
  return mediaIds.map((mediaId) => createExistingDeferredMediaItem(mediaId));
}

export function createComicDeferredMediaSelectionFromExistingIds(
  mediaIds: string[]
): ComicDeferredMediaSelection {
  return mediaIds.map((mediaId) => createExistingDeferredMediaItem(mediaId));
}

export function createDeferredMediaSelectionFromExistingId(
  mediaId: string | null | undefined
): DeferredMediaSelection {
  return mediaId ? [createExistingDeferredMediaItem(mediaId)] : [];
}

export const EMPTY_DEFERRED_MEDIA_SELECTION: DeferredMediaSelection = [];

export function createEmptyDeferredMediaSelection(): DeferredMediaSelection {
  return [];
}

export function createEmptyComicDeferredMediaSelection(): ComicDeferredMediaSelection {
  return [];
}

export function createDeferredMediaItemsFromFiles(
  files: File[]
): DeferredMediaSelection {
  return files.map((file) => createPendingDeferredMediaItem(file));
}

export function isDeferredPendingMediaItem(
  item: ComicDeferredMediaItem
): item is DeferredPendingMediaItem {
  return item.kind === "pending";
}

export function getDeferredMediaPreviewSource(
  item: ComicDeferredMediaItem,
  mediaById: Map<string, MediaLibraryLookup>
) {
  if (item.kind === "pending") {
    return item.previewUrl;
  }

  if (item.kind === "uploaded") {
    return item.objectKey;
  }

  return item.objectKey ?? mediaById.get(item.mediaId)?.objectKey ?? null;
}

export function getDeferredMediaPreviewSources(
  items: ComicDeferredMediaSelection,
  mediaById: Map<string, MediaLibraryLookup>
) {
  return items
    .map((item) => getDeferredMediaPreviewSource(item, mediaById))
    .filter((source): source is string => source !== null);
}

export function revokeDeferredMediaPreviewUrls(
  items: ComicDeferredMediaSelection
) {
  for (const item of items) {
    if (item.kind === "pending") {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
}
