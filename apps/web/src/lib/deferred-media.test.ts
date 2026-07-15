import { COMIC_MEDIA_MAX_ITEMS } from "@repo/shared/media";
import { describe, expect, it } from "vitest";

import {
  comicMediaSelectionSchema,
  createComicMediaSelectionInput,
  createDeferredMediaSelectionFromExistingIds,
  deferredMediaSelectionSchema,
  resetComicUploadSessionSelection,
} from "./deferred-media";

describe("comic media selection", () => {
  it("accepts 1000 pages without changing their explicit order", () => {
    const mediaIds = Array.from(
      { length: COMIC_MEDIA_MAX_ITEMS },
      (_, index) => `page-${COMIC_MEDIA_MAX_ITEMS - index}`
    );
    const result = comicMediaSelectionSchema.parse(
      createDeferredMediaSelectionFromExistingIds(mediaIds)
    );

    expect(result.map((item) => item.mediaId)).toEqual(mediaIds);
    expect(
      comicMediaSelectionSchema.safeParse([
        ...result,
        {
          kind: "existing",
          mediaId: "overflow",
          selectionId: "existing:overflow",
        },
      ]).success
    ).toBe(false);
    expect(deferredMediaSelectionSchema.safeParse(result).success).toBe(false);
  });

  it("keeps uploaded object keys in explicit page order", () => {
    const page2 = new File(["2"], "page-2.webp", { type: "image/webp" });
    const page1 = new File(["1"], "page-1.webp", { type: "image/webp" });
    const pages = [
      {
        file: page2,
        kind: "uploaded" as const,
        objectKey: "media/comic/c1/s1/page-2.webp",
        previewUrl: "blob:page-2",
        selectionId: "page-2",
      },
      {
        file: page1,
        kind: "uploaded" as const,
        objectKey: "media/comic/c1/s1/page-1.webp",
        previewUrl: "blob:page-1",
        selectionId: "page-1",
      },
    ];

    expect(comicMediaSelectionSchema.parse(pages)).toEqual(pages);
    expect(deferredMediaSelectionSchema.safeParse(pages).success).toBe(false);
    expect(resetComicUploadSessionSelection(pages)).toEqual([
      {
        file: page2,
        kind: "pending",
        previewUrl: "blob:page-2",
        selectionId: "page-2",
      },
      {
        file: page1,
        kind: "pending",
        previewUrl: "blob:page-1",
        selectionId: "page-1",
      },
    ]);
    expect(
      resetComicUploadSessionSelection([
        {
          file: page1,
          kind: "pending",
          objectKey: "media/comic/c1/expired/1.webp",
          previewUrl: "blob:page-1",
          selectionId: "page-1",
        },
      ])[0]
    ).not.toHaveProperty("objectKey");
    expect(createComicMediaSelectionInput(pages)).toEqual([
      {
        kind: "uploaded",
        objectKey: "media/comic/c1/s1/page-2.webp",
      },
      {
        kind: "uploaded",
        objectKey: "media/comic/c1/s1/page-1.webp",
      },
    ]);
  });
});
