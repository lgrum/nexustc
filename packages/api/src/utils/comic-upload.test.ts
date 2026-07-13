import { COMIC_UPLOAD_MAX_BYTES } from "@repo/shared/media";
import { describe, expect, it } from "vitest";

import {
  getComicUploadPrefix,
  isValidComicUploadObject,
  ownsComicUploadKeys,
} from "./comic-upload";

describe("comic upload validation", () => {
  it("only accepts keys belonging to the reserved comic upload session", () => {
    const ownPrefix = getComicUploadPrefix("comic-1", "session-1");

    expect(
      ownsComicUploadKeys("comic-1", "session-1", [
        `${ownPrefix}page-1.webp`,
        `${ownPrefix}page-2.webp`,
      ])
    ).toBe(true);
    expect(
      ownsComicUploadKeys("comic-1", "session-1", [
        `${ownPrefix}page-1.webp`,
        `${getComicUploadPrefix("comic-1", "session-2")}page-2.webp`,
      ])
    ).toBe(false);
  });

  it("requires a non-empty WebP within the size limit", () => {
    expect(
      isValidComicUploadObject({
        contentLength: COMIC_UPLOAD_MAX_BYTES,
        contentType: "image/webp",
      })
    ).toBe(true);
    expect(
      isValidComicUploadObject({
        contentLength: COMIC_UPLOAD_MAX_BYTES + 1,
        contentType: "image/webp",
      })
    ).toBe(false);
    expect(
      isValidComicUploadObject({
        contentLength: 100,
        contentType: "image/png",
      })
    ).toBe(false);
    expect(
      isValidComicUploadObject({
        contentLength: 0,
        contentType: "image/webp",
      })
    ).toBe(false);
  });
});
