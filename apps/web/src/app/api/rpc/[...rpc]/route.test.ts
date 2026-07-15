import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { os } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as route from "./route";

const procedure = vi.hoisted(() => vi.fn(() => "ok"));

vi.mock("@orpc/experimental-pino", () => ({
  LoggingHandlerPlugin: class {
    init = vi.fn();
  },
}));
vi.mock("@repo/api/context", () => ({ createContext: vi.fn(() => ({})) }));
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
  });

  it("exports only POST", () => {
    expect(Object.keys(route)).toEqual(["POST"]);
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
});
