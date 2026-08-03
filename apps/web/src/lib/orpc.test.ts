import { afterEach, describe, expect, it, vi } from "vitest";

import { getClientErrorMessage } from "./client-error";
import { createQueryClient, getBrowserORPCUrl, orpcClient } from "./orpc";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({ toast: { error: toastError } }));

afterEach(() => {
  toastError.mockClear();
  vi.restoreAllMocks();
});

it("suppresses global toasts for background reconciliation failures", async () => {
  const queryClient = createQueryClient();

  await expect(
    queryClient.fetchQuery({
      meta: { suppressErrorToast: true },
      queryFn: () => Promise.reject(new Error("offline")),
      queryKey: ["app-theme", "mine"],
      retry: false,
    })
  ).rejects.toThrow("offline");
  expect(toastError).not.toHaveBeenCalled();
});

it("deduplicates matching global query errors", async () => {
  const queryClient = createQueryClient();
  const failedQuery = (queryKey: string[]) =>
    queryClient.fetchQuery({
      queryFn: () => Promise.reject(new Error("Not Found")),
      queryKey,
      retry: false,
    });

  await Promise.allSettled([
    failedQuery(["post", "recent"]),
    failedQuery(["term", "popular-tags"]),
  ]);

  expect(toastError).toHaveBeenCalledTimes(2);
  expect(toastError).toHaveBeenNthCalledWith(
    1,
    "Not Found",
    expect.objectContaining({ id: "query-error:Not Found" })
  );
  expect(toastError).toHaveBeenNthCalledWith(
    2,
    "Not Found",
    expect.objectContaining({ id: "query-error:Not Found" })
  );
});

describe("getClientErrorMessage", () => {
  it("uses explicit server error messages", () => {
    const error = Object.assign(new Error("Tu mensaje parece spam."), {
      code: "BAD_REQUEST",
    });

    expect(getClientErrorMessage(error)).toBe("Tu mensaje parece spam.");
  });

  it("uses data messages when available", () => {
    expect(
      getClientErrorMessage({
        code: "BAD_REQUEST",
        data: { message: "Mensaje desde data." },
        message: "BAD_REQUEST",
      })
    ).toBe("Mensaje desde data.");
  });

  it("maps code-only oRPC errors to readable text", () => {
    expect(getClientErrorMessage(new Error("RATE_LIMITED"))).toBe(
      "Estas realizando demasiadas acciones seguidas. Espera un momento e intentalo de nuevo."
    );
  });

  it("falls back for unknown values", () => {
    expect(getClientErrorMessage(null, "No se pudo guardar.")).toBe(
      "No se pudo guardar."
    );
  });
});

describe("getBrowserORPCUrl", () => {
  it("uses the current origin for browser RPC calls", () => {
    expect(getBrowserORPCUrl()).toBe(`${window.location.origin}/api/rpc`);
  });
});

describe("browser RPC transport", () => {
  it("sends the CSRF header", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 500 }));

    await expect(orpcClient.chronos.getCurrent()).rejects.toBeDefined();

    const request = fetchSpy.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    expect((request as Request).headers.get("x-csrf-token")).toBe("orpc");
  });
});
