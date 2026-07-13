import { COMIC_MEDIA_MAX_ITEMS } from "@repo/shared/media";
import { describe, expect, it } from "vitest";

import {
  comicMediaSelectionInputSchema,
  deferredMediaSelectionInputSchema,
} from "./deferred-media";

describe("comic media input", () => {
  it("accepts 1000 ordered media IDs while retaining the standard 100-item limit", () => {
    const pages = Array.from({ length: COMIC_MEDIA_MAX_ITEMS }, (_, index) => ({
      kind: "existing" as const,
      mediaId: `page-${index}`,
    }));

    expect(comicMediaSelectionInputSchema.parse(pages)).toEqual(pages);
    expect(
      comicMediaSelectionInputSchema.safeParse([
        ...pages,
        { kind: "existing", mediaId: "overflow" },
      ]).success
    ).toBe(false);
    expect(deferredMediaSelectionInputSchema.safeParse(pages).success).toBe(
      false
    );
  });

  it("accepts ordered session uploads only for comics", () => {
    const pages = [
      { kind: "uploaded" as const, objectKey: "media/comic/c1/s1/page-2.webp" },
      { kind: "uploaded" as const, objectKey: "media/comic/c1/s1/page-1.webp" },
    ];

    expect(comicMediaSelectionInputSchema.parse(pages)).toEqual(pages);
    expect(deferredMediaSelectionInputSchema.safeParse(pages).success).toBe(
      false
    );
  });

  it("rejects server-proxied comic page files", () => {
    const page = new File(["page"], "page.webp", { type: "image/webp" });

    expect(
      comicMediaSelectionInputSchema.safeParse([
        { file: page, kind: "pending" },
      ]).success
    ).toBe(false);
  });
});
