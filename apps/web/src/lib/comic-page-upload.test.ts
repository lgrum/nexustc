import { describe, expect, it, vi } from "vitest";

import {
  COMIC_UPLOAD_BATCH_SIZE,
  COMIC_UPLOAD_CONCURRENCY,
  sortComicFiles,
  uploadComicPages,
} from "./comic-page-upload";

const pageNumberRegex = /\d+/;

const createItems = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    file: new File([`${index}`], `page-${index + 1}.png`, {
      type: "image/png",
    }),
    selectionId: `page-${index + 1}`,
  }));

const createDependencies = () => ({
  convert: vi.fn((file: File) => Promise.resolve(file)),
  createUploadUrls: vi.fn(
    (
      items: { file: File; objectKey?: string }[]
    ): Promise<{ objectKey: string; presignedUrl: string | null }[]> =>
      Promise.resolve(
        items.map(({ file, objectKey }) => ({
          objectKey: objectKey ?? `uploads/${file.name}.webp`,
          presignedUrl: `https://uploads.test/${file.name}`,
        }))
      )
  ),
  upload: vi.fn(() => Promise.resolve()),
});

describe("comic page uploads", () => {
  it("naturally sorts filenames", () => {
    const files = ["page-10.png", "page-2.png", "page-1.png"].map(
      (name) => new File([name], name, { type: "image/png" })
    );

    expect(sortComicFiles(files).map((file) => file.name)).toEqual([
      "page-1.png",
      "page-2.png",
      "page-10.png",
    ]);
  });

  it("caps concurrency and preserves page order when uploads finish out of order", async () => {
    const dependencies = createDependencies();
    let active = 0;
    let peak = 0;
    dependencies.upload.mockImplementation(async (file) => {
      active += 1;
      peak = Math.max(peak, active);
      const pageNumber = Number(file.name.match(pageNumberRegex)?.[0] ?? 0);
      await new Promise((resolve) => setTimeout(resolve, 12 - pageNumber));
      active -= 1;
    });

    const result = await uploadComicPages(createItems(10), dependencies);

    expect(peak).toBe(COMIC_UPLOAD_CONCURRENCY);
    expect(result.states.map((item) => item.selectionId)).toEqual(
      createItems(10).map((item) => item.selectionId)
    );
    expect(result.states.every((item) => item.status === "uploaded")).toBe(
      true
    );
  });

  it("batches URL creation", async () => {
    const dependencies = createDependencies();
    await uploadComicPages(createItems(60), dependencies);

    expect(
      dependencies.createUploadUrls.mock.calls.map(([files]) => files.length)
    ).toEqual([COMIC_UPLOAD_BATCH_SIZE, COMIC_UPLOAD_BATCH_SIZE, 10]);
  });

  it("keeps a failed page retryable without disturbing successful pages", async () => {
    const dependencies = createDependencies();
    dependencies.upload.mockRejectedValueOnce(new Error("offline"));

    const first = await uploadComicPages(createItems(3), dependencies);

    expect(first.states.map((item) => item.status)).toEqual([
      "failed",
      "uploaded",
      "uploaded",
    ]);
    expect(first.states.map((item) => item.selectionId)).toEqual([
      "page-1",
      "page-2",
      "page-3",
    ]);
    expect(first.states[0]?.objectKey).toBe("uploads/page-1.png.webp");

    const retryDependencies = createDependencies();
    const retry = await uploadComicPages(
      first.states.filter((item) => item.status === "failed"),
      retryDependencies
    );

    expect(retryDependencies.upload).toHaveBeenCalledTimes(1);
    expect(retryDependencies.createUploadUrls).toHaveBeenCalledWith([
      {
        file: first.states[0]?.file,
        objectKey: "uploads/page-1.png.webp",
      },
    ]);
    expect(retry.states[0]?.status).toBe("uploaded");

    const storedDependencies = createDependencies();
    storedDependencies.createUploadUrls.mockImplementation((items) =>
      Promise.resolve(
        items.map(({ objectKey }) => ({
          objectKey: objectKey ?? "",
          presignedUrl: null,
        }))
      )
    );
    const storedRetry = await uploadComicPages(
      first.states.filter((item) => item.status === "failed"),
      storedDependencies
    );

    expect(storedDependencies.upload).not.toHaveBeenCalled();
    expect(storedRetry.states[0]?.status).toBe("uploaded");
  });

  it("reports conversion failures against the correct page", async () => {
    const dependencies = createDependencies();
    dependencies.convert.mockRejectedValueOnce(new Error("corrupt image"));
    const progress = vi.fn();

    const result = await uploadComicPages(createItems(3), {
      ...dependencies,
      onProgress: progress,
    });

    expect(result.states.map((item) => item.status)).toEqual([
      "failed",
      "uploaded",
      "uploaded",
    ]);
    expect(progress).toHaveBeenLastCalledWith(3, 3);
  });
});
