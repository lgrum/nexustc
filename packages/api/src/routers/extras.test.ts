import { afterEach, describe, expect, it, vi } from "vitest";

import { getAliasFromUrl } from "../utils/shortener-alias";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe(getAliasFromUrl, () => {
  it("fetches HTML titles only from approved HTTPS hosts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<html><title>Mi Cómic Especial</title></html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getAliasFromUrl("https://www.mediafire.com/file/abc")
    ).resolves.toMatch(/^mi-comic-especial-[A-Za-z0-9]{9}$/);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://www.mediafire.com/file/abc"),
      expect.objectContaining({ redirect: "manual" })
    );
  });

  it("does not fetch unapproved, insecure, or credentialed URLs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const url of [
      "https://mediafire.com.evil.example/file/abc",
      "https://127.0.0.1/internal",
      "http://mediafire.com/file/abc",
      "https://user:password@gofile.io/d/abc",
    ]) {
      await expect(getAliasFromUrl(url)).resolves.toBeUndefined();
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("continues without an alias for redirects or non-HTML responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { location: "http://127.0.0.1/internal" },
          status: 302,
        })
      )
      .mockResolvedValueOnce(
        new Response("{}", {
          headers: { "content-type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getAliasFromUrl("https://gofile.io/d/redirect")
    ).resolves.toBeUndefined();
    await expect(
      getAliasFromUrl("https://gofile.io/d/json")
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects oversized HTML responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<title>Too large</title>", {
          headers: {
            "content-length": String(64 * 1024 + 1),
            "content-type": "text/html",
          },
        })
      )
    );

    await expect(
      getAliasFromUrl("https://gofile.io/d/large")
    ).resolves.toBeUndefined();
  });
});
