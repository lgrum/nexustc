import { uploadProfileMedia } from "./profile-media-upload";

const { uploadBlobWithProgress } = vi.hoisted(() => ({
  uploadBlobWithProgress: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({ uploadBlobWithProgress }));

describe(uploadProfileMedia, () => {
  it("forwards progress and the signed create-only header", async () => {
    const file = new Blob(["avatar"], { type: "image/webp" });
    const onProgress = vi.fn();

    await uploadProfileMedia(file, "https://uploads.test/object", onProgress);

    expect(uploadBlobWithProgress).toHaveBeenCalledWith(
      file,
      "https://uploads.test/object",
      onProgress,
      { "If-None-Match": "*" }
    );
  });

  it("forwards an omitted progress callback unchanged", async () => {
    const file = new Blob(["banner"], { type: "image/webp" });

    await uploadProfileMedia(file, "https://uploads.test/banner");

    expect(uploadBlobWithProgress).toHaveBeenCalledWith(
      file,
      "https://uploads.test/banner",
      undefined,
      { "If-None-Match": "*" }
    );
  });
});
