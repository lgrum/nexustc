import { describe, expect, it } from "vitest";

import { InMemoryProfileMediaStorage } from "./profile-media-storage.test-support";

describe("InMemoryProfileMediaStorage", () => {
  it("issues create-only uploads and stores canonical objects", async () => {
    const storage = new InMemoryProfileMediaStorage();

    await expect(
      storage.issueUpload({
        contentLength: 3,
        contentType: "image/png",
        expiresIn: 300,
        objectKey: "profiles/temp/avatar/user-1/source.png",
      })
    ).resolves.toEqual({
      presignedUrl: "memory://profiles%2Ftemp%2Favatar%2Fuser-1%2Fsource.png",
    });

    await storage.putObject(
      "profiles/media/avatar/user-1/asset.webp",
      Buffer.from("webp"),
      "image/webp"
    );

    await expect(
      storage.readObject("profiles/media/avatar/user-1/asset.webp")
    ).resolves.toEqual({
      body: Buffer.from("webp"),
      contentLength: 4,
      contentType: "image/webp",
    });
  });

  it("records failed deletions without removing the object", async () => {
    const storage = new InMemoryProfileMediaStorage();
    storage.seed(
      "profiles/media/avatar/user-1/asset.webp",
      Buffer.from("webp"),
      "image/webp"
    );
    storage.failDeletionFor("profiles/media/avatar/user-1/asset.webp");

    await expect(
      storage.deleteObject("profiles/media/avatar/user-1/asset.webp")
    ).rejects.toThrow("Deletion failed");
    expect(storage.has("profiles/media/avatar/user-1/asset.webp")).toBeTruthy();
  });
});
