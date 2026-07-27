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
  getLogger: () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn() }),
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

const { default: mediaRouter } = await import("./media");

function createContext(returnRowsInReverse = false) {
  let insertedValues: { folderId: string | null; objectKey: string }[] = [];
  const returning = vi.fn(() => {
    const values = returnRowsInReverse
      ? insertedValues.toReversed()
      : insertedValues;
    return Promise.resolve(
      values.map((value) => ({
        createdAt: new Date(0),
        folderId: value.folderId,
        id: `row:${value.objectKey}`,
        objectKey: value.objectKey,
      }))
    );
  });
  const values = vi.fn(
    (nextValues: { folderId: string | null; objectKey: string }[]) => {
      insertedValues = nextValues;
      return { returning };
    }
  );
  const db = {
    insert: vi.fn(() => ({ values })),
    query: { mediaFolder: { findFirst: vi.fn() } },
  };

  return {
    context: {
      db,
      headers: new Headers(),
      session: { user: { id: "owner-1", role: "owner" } },
    } as unknown as Context,
    db,
    values,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userHasPermission.mockResolvedValue({ success: true });
});

describe("admin media upload", () => {
  it("optimizes and uploads one file at a time while preserving input order", async () => {
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
    const { context, values } = createContext(true);
    const files = [
      new File(["a"], "a.png", { type: "image/png" }),
      new File(["b"], "b.png", { type: "image/png" }),
    ];

    const result = await call(mediaRouter.admin.upload, { files }, { context });

    expect(maximumActiveOptimizers).toBe(1);
    expect(events).toEqual([
      "optimize:a.png:start",
      "optimize:a.png:end",
      "upload:media/object-1.webp",
      "optimize:b.png:start",
      "optimize:b.png:end",
      "upload:media/object-2.webp",
    ]);
    expect(values).toHaveBeenCalledTimes(1);
    expect(result.map((item) => item.objectKey)).toEqual([
      "media/object-1.webp",
      "media/object-2.webp",
    ]);
  });

  it("cleans up earlier uploads when a later upload fails", async () => {
    mocks.generateId
      .mockReturnValueOnce("object-1")
      .mockReturnValueOnce("object-2");
    mocks.optimizeFile.mockImplementation((file: File) =>
      Promise.resolve({
        buffer: Buffer.from(file.name),
        extension: "webp",
        mimeType: "image/webp",
      })
    );
    mocks.s3Send.mockImplementation((command) => {
      if (command.input.Key === "media/object-2.webp") {
        return Promise.reject(new Error("upload failed"));
      }
      return Promise.resolve({});
    });
    const { context, db } = createContext();

    await expect(
      call(
        mediaRouter.admin.upload,
        {
          files: [
            new File(["a"], "a.png", { type: "image/png" }),
            new File(["b"], "b.png", { type: "image/png" }),
          ],
        },
        { context }
      )
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(db.insert).not.toHaveBeenCalled();
    expect(
      mocks.s3Send.mock.calls.find(([command]) => command.input.Delete)?.[0]
        .input.Delete.Objects
    ).toEqual([{ Key: "media/object-1.webp" }]);
  });
});
