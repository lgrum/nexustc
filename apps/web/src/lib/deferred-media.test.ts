import { COMIC_MEDIA_MAX_ITEMS } from "@repo/shared/media";
import { describe, expect, it } from "vitest";

import {
  comicMediaSelectionSchema,
  createDeferredMediaSelectionFromExistingIds,
  deferredMediaSelectionSchema,
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
    const pages = [
      {
        kind: "uploaded" as const,
        objectKey: "media/comic/c1/s1/page-2.webp",
        selectionId: "page-2",
      },
      {
        kind: "uploaded" as const,
        objectKey: "media/comic/c1/s1/page-1.webp",
        selectionId: "page-1",
      },
    ];

    expect(comicMediaSelectionSchema.parse(pages)).toEqual(pages);
    expect(deferredMediaSelectionSchema.safeParse(pages).success).toBe(false);
  });
});
