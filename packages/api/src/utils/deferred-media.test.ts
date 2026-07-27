import {
  ADMIN_IMAGE_MAX_FILE_BYTES,
  COMIC_MEDIA_MAX_ITEMS,
} from "@repo/shared/media";
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

describe("deferred media input", () => {
  it("bounds pending files without changing existing-media selection limits", () => {
    const pending = Array.from({ length: 4 }, (_, index) => {
      const file = new File(["image"], `image-${index}.png`, {
        type: "image/png",
      });
      Object.defineProperty(file, "size", {
        value: ADMIN_IMAGE_MAX_FILE_BYTES,
      });
      return { file, kind: "pending" as const };
    });
    const existing = Array.from({ length: 96 }, (_, index) => ({
      kind: "existing" as const,
      mediaId: `media-${index}`,
    }));

    expect(
      deferredMediaSelectionInputSchema.safeParse([...existing, ...pending])
        .success
    ).toBe(true);
    expect(
      [pending, pending].every(
        (selection) =>
          deferredMediaSelectionInputSchema.safeParse(selection).success
      )
    ).toBe(true);

    const oversizedFile = new File(["image"], "oversized.png", {
      type: "image/png",
    });
    Object.defineProperty(oversizedFile, "size", {
      value: ADMIN_IMAGE_MAX_FILE_BYTES + 1,
    });
    expect(
      deferredMediaSelectionInputSchema.safeParse([
        { file: oversizedFile, kind: "pending" },
      ]).success
    ).toBe(false);

    const aggregateOverflow = Array.from({ length: 5 }, (_, index) => {
      const file = new File(["image"], `overflow-${index}.png`, {
        type: "image/png",
      });
      Object.defineProperty(file, "size", { value: 9 * 1024 * 1024 });
      return { file, kind: "pending" as const };
    });
    expect(
      deferredMediaSelectionInputSchema.safeParse(aggregateOverflow).success
    ).toBe(false);
  });
});
