// @vitest-environment node

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { os } from "@orpc/server";
import { ADMIN_RPC_BODY_MAX_BYTES } from "@repo/shared/media";
import { revalidateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as route from "./route";

const procedure = vi.hoisted(() => vi.fn(() => "ok"));

vi.mock("@orpc/experimental-pino", () => ({
  LoggingHandlerPlugin: class {
    init = vi.fn();
  },
}));
vi.mock("@repo/api/context", () => ({ createContext: vi.fn(() => ({})) }));
vi.mock("@repo/env", () => ({
  env: { BETTER_AUTH_SECRET: "test-integrity-secret" },
}));
vi.mock("@repo/api/routers/index", () => ({
  appRouter: { ping: os.handler(procedure) },
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("./cache-tags", () => ({ getCacheTagsForProcedure: vi.fn(() => []) }));

const createClient = (headers?: Record<string, string>) =>
  createORPCClient(
    new RPCLink({
      fetch: (request) => route.POST(request),
      headers,
      url: "http://localhost/api/rpc",
    })
  ) as { ping: () => Promise<string> };

describe("RPC route", () => {
  beforeEach(() => {
    procedure.mockClear();
    vi.mocked(revalidateTag).mockClear();
  });

  it("exports only POST", () => {
    expect(Object.keys(route)).toEqual(["POST"]);
  });

  it("configures the agreed 96 MiB production ceiling", () => {
    expect(ADMIN_RPC_BODY_MAX_BYTES).toBe(96 * 1024 * 1024);
  });

  it("rejects requests without the CSRF header", async () => {
    await expect(createClient().ping()).rejects.toMatchObject({ status: 403 });
    expect(procedure).not.toHaveBeenCalled();
  });

  it("accepts requests with the CSRF header", async () => {
    await expect(createClient({ "x-csrf-token": "orpc" }).ping()).resolves.toBe(
      "ok"
    );
    expect(procedure).toHaveBeenCalledTimes(1);
  });

  it("revalidates profiles attached to committed mutation failures", async () => {
    procedure.mockImplementationOnce(() => {
      throw Object.assign(new Error("XP_PROJECTION_MISMATCH"), {
        profileUserIds: ["user-1", null, "user-2"],
      });
    });
    vi.spyOn(console, "error").mockImplementationOnce(() => {});

    await expect(
      createClient({ "x-csrf-token": "orpc" }).ping()
    ).rejects.toThrow();

    expect(revalidateTag).toHaveBeenCalledWith("profile:user-1", "max");
    expect(revalidateTag).toHaveBeenCalledWith("profile:user-2", "max");
  });

  it("issues a secure first-party integrity device cookie", async () => {
    const response = await route.POST(
      new Request("http://localhost/api/rpc/ping", {
        body: "{}",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": "orpc",
        },
        method: "POST",
      })
    );

    expect(response.headers.get("set-cookie")).toMatch(
      /^ntc_device=.+; Path=\/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax$/
    );
  });

  it("rejects a declared body above the gross-body limit", async () => {
    const response = await route.POST(
      new Request("http://localhost/api/rpc/ping", {
        body: "{}",
        headers: {
          "content-length": String(ADMIN_RPC_BODY_MAX_BYTES + 1),
          "content-type": "application/json",
          "x-csrf-token": "orpc",
        },
        method: "POST",
      })
    );

    expect(response.status).toBe(413);
    expect(procedure).not.toHaveBeenCalled();
  });

  it("rejects a streamed body above the gross-body limit", async () => {
    const chunk = new Uint8Array(ADMIN_RPC_BODY_MAX_BYTES + 1);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });
    const response = await route.POST(
      new Request("http://localhost/api/rpc/ping", {
        body,
        duplex: "half",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": "orpc",
        },
        method: "POST",
      } as RequestInit & { duplex: "half" })
    );

    expect(response.status).toBe(413);
    expect(procedure).not.toHaveBeenCalled();
  });
});
