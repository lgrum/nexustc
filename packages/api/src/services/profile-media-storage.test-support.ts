import type {
  ProfileMediaObject,
  ProfileMediaStorage,
} from "./profile-media-storage";

export class InMemoryProfileMediaStorage implements ProfileMediaStorage {
  readonly #deletionFailures = new Set<string>();
  readonly #objects = new Map<string, ProfileMediaObject>();
  readonly issuedUploads: string[] = [];

  deleteObject(objectKey: string): Promise<void> {
    if (this.#deletionFailures.has(objectKey)) {
      return Promise.reject(new Error(`Deletion failed: ${objectKey}`));
    }
    this.#objects.delete(objectKey);
    return Promise.resolve();
  }

  failDeletionFor(objectKey: string) {
    this.#deletionFailures.add(objectKey);
  }

  has(objectKey: string) {
    return this.#objects.has(objectKey);
  }

  issueUpload(input: {
    contentLength: number;
    contentType: string;
    expiresIn: number;
    objectKey: string;
  }): Promise<{ presignedUrl: string }> {
    this.issuedUploads.push(input.objectKey);
    return Promise.resolve({
      presignedUrl: `memory://${encodeURIComponent(input.objectKey)}`,
    });
  }

  putObject(
    objectKey: string,
    body: Buffer,
    contentType: string
  ): Promise<void> {
    if (this.#objects.has(objectKey)) {
      return Promise.reject(new Error(`Object already exists: ${objectKey}`));
    }
    this.seed(objectKey, body, contentType);
    return Promise.resolve();
  }

  readObject(objectKey: string): Promise<ProfileMediaObject> {
    const object = this.#objects.get(objectKey);
    if (!object) {
      return Promise.reject(new Error(`Object not found: ${objectKey}`));
    }
    return Promise.resolve({ ...object, body: Buffer.from(object.body) });
  }

  seed(objectKey: string, body: Buffer, contentType: string) {
    this.#objects.set(objectKey, {
      body: Buffer.from(body),
      contentLength: body.byteLength,
      contentType,
    });
  }
}
