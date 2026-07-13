import { uploadComicPages } from "@/lib/comic-page-upload";
import { isDeferredPendingMediaItem } from "@/lib/deferred-media";
import type { ComicDeferredMediaSelection } from "@/lib/deferred-media";
import { orpcClient } from "@/lib/orpc";
import { convertImage, uploadBlobWithProgress } from "@/lib/utils";

export async function uploadDeferredComicSelection(params: {
  onProgress?: (completed: number, total: number) => void;
  onSelectionChange: (selection: ComicDeferredMediaSelection) => void;
  selection: ComicDeferredMediaSelection;
  sessionId: string;
}) {
  let nextSelection = params.selection;
  const pendingItems = nextSelection.filter(isDeferredPendingMediaItem);
  if (pendingItems.length === 0) {
    return nextSelection;
  }

  const result = await uploadComicPages(pendingItems, {
    convert: async (file) => await convertImage(file, "webp", 0.82),
    createUploadUrls: async (files) =>
      await orpcClient.media.admin.createComicUploadUrls({
        objects: files.map((file) => ({ contentLength: file.size })),
        sessionId: params.sessionId,
      }),
    onChange: (states) => {
      const stateBySelectionId = new Map(
        states.map((state) => [state.selectionId, state])
      );
      nextSelection = nextSelection.map((selection) => {
        const state = stateBySelectionId.get(selection.selectionId);
        if (!state) {
          return selection;
        }
        if (state.status === "uploaded" && state.objectKey) {
          return {
            kind: "uploaded" as const,
            objectKey: state.objectKey,
            selectionId: state.selectionId,
          };
        }
        return selection.kind === "pending"
          ? { ...selection, objectKey: state.objectKey }
          : selection;
      });
      params.onSelectionChange(nextSelection);
    },
    onProgress: params.onProgress,
    upload: async (file, presignedUrl) =>
      await uploadBlobWithProgress(file, presignedUrl),
  });

  if (result.error) {
    throw result.error;
  }

  const failed = result.states.filter(
    (state) => state.status !== "uploaded"
  ).length;
  if (failed > 0) {
    throw new Error(`${failed} comic page(s) failed to upload`);
  }

  return nextSelection;
}
