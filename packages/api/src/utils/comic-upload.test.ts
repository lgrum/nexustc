import { COMIC_UPLOAD_MAX_BYTES } from "@repo/shared/media";
import { describe, expect, it } from "vitest";

import {
  getComicUploadPrefix,
  getUnreferencedComicUploadKeys,
  isValidComicUploadObject,
  isWebpHeader,
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

  it("keeps persisted pages while selecting upload-session orphans", () => {
    expect(
      getUnreferencedComicUploadKeys(
        ["page-1.webp", "unused.webp", "page-2.webp"],
        ["page-1.webp", "page-2.webp"]
      )
    ).toEqual(["unused.webp"]);
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

  it("checks the uploaded bytes for a supported WebP header", () => {
    const header = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
      0x38, 0x58,
    ]);

    expect(isWebpHeader(header)).toBe(true);
    expect(isWebpHeader(new Uint8Array(header).fill(0, 8, 12))).toBe(false);
    expect(isWebpHeader(header.slice(0, 12))).toBe(false);
  });
});
