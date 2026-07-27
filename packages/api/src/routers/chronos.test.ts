import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "../context";

const mocks = vi.hoisted(() => ({
  generateId: vi.fn(),
  optimizeFile: vi.fn(),
  s3Send: vi.fn(),
  userHasPermission: vi.fn(),
}));

vi.mock("@orpc/experimental-pino", () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn() }),
}));
vi.mock("@repo/auth", () => ({
  auth: { api: { userHasPermission: mocks.userHasPermission } },
}));
vi.mock("@repo/db/utils", () => ({ generateId: mocks.generateId }));
vi.mock(import("../utils/images"), async (importOriginal) => ({
  ...(await importOriginal()),
  optimizeFile: mocks.optimizeFile,
}));
vi.mock("../utils/s3", () => ({
  getS3Client: () => ({ send: mocks.s3Send }),
}));

const { default: chronosRouter } = await import("./chronos");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userHasPermission.mockResolvedValue({ success: true });
});

describe("Chronos image upload", () => {
  it("processes one file at a time and returns keys in input order", async () => {
    let activeOptimizers = 0;
    let maximumActiveOptimizers = 0;
    const events: string[] = [];
    mocks.generateId
      .mockReturnValueOnce("object-1")
      .mockReturnValueOnce("object-2");
    mocks.optimizeFile.mockImplementation(async (file: File) => {
      activeOptimizers += 1;
      maximumActiveOptimizers = Math.max(
        maximumActiveOptimizers,
        activeOptimizers
      );
      events.push(`optimize:${file.name}:start`);
      await Promise.resolve();
      events.push(`optimize:${file.name}:end`);
      activeOptimizers -= 1;
      return {
        buffer: Buffer.from(file.name),
        extension: "webp",
        mimeType: "image/webp",
      };
    });
    mocks.s3Send.mockImplementation(async (command) => {
      events.push(`upload:${command.input.Key}`);
      await Promise.resolve();
      return {};
    });
    const context = {
      db: {},
      headers: new Headers(),
      session: { user: { id: "owner-1", role: "owner" } },
    } as unknown as Context;

    const result = await call(
      chronosRouter.uploadImages,
      {
        files: [
          new File(["a"], "a.png", { type: "image/png" }),
          new File(["b"], "b.png", { type: "image/png" }),
        ],
        type: "markdown",
      },
      { context }
    );

    expect(maximumActiveOptimizers).toBe(1);
    expect(events).toEqual([
      "optimize:a.png:start",
      "optimize:a.png:end",
      "upload:images/chronos/markdown/object-1.webp",
      "optimize:b.png:start",
      "optimize:b.png:end",
      "upload:images/chronos/markdown/object-2.webp",
    ]);
    expect(result).toEqual([
      "images/chronos/markdown/object-1.webp",
      "images/chronos/markdown/object-2.webp",
    ]);
  });
});
