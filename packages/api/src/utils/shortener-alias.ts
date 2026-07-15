import { customAlphabet } from "nanoid/non-secure";

const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  9
);

const HTML_TITLE_REGEX = /<title[^>]*>([\s\S]*?)<\/title>/i;
const MAX_ALIAS_HTML_BYTES = 64 * 1024;
const META_TITLE_REGEXES = [
  /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']title["'][^>]*>/i,
] as const;
const TITLE_ALIAS_HOSTS = new Set([
  "gofile.io",
  "mediafire.com",
  "www.gofile.io",
  "www.mediafire.com",
]);

const decodeHtmlEntities = (value: string): string =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");

const normalizeAlias = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036F]/g, "")
    .replaceAll(/[^a-zA-Z0-9\s-]/g, " ")
    .trim()
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-")
    .toLowerCase()
    .slice(0, 20);

  return normalized.length > 0 ? normalized : undefined;
};

const getTitleMatch = (html: string): string | null => {
  for (const regex of META_TITLE_REGEXES) {
    const match = html.match(regex)?.[1];

    if (match) {
      return decodeHtmlEntities(match).trim();
    }
  }

  const titleMatch = html.match(HTML_TITLE_REGEX)?.[1];
  return titleMatch ? decodeHtmlEntities(titleMatch).trim() : null;
};

const readLimitedHtml = async (response: Response): Promise<string | null> => {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_ALIAS_HTML_BYTES) {
    return null;
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return html + decoder.decode();
    }

    receivedBytes += value.byteLength;
    if (receivedBytes > MAX_ALIAS_HTML_BYTES) {
      await reader.cancel();
      return null;
    }

    html += decoder.decode(value, { stream: true });
  }
};

export const getAliasFromUrl = async (
  url: string
): Promise<string | undefined> => {
  try {
    const target = new URL(url);
    if (
      target.protocol !== "https:" ||
      target.username !== "" ||
      target.password !== "" ||
      !TITLE_ALIAS_HOSTS.has(target.hostname.toLowerCase())
    ) {
      return undefined;
    }

    const response = await fetch(target, {
      headers: {
        accept: "text/html",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });

    if (
      !response.ok ||
      response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase() !== "text/html"
    ) {
      return undefined;
    }

    const html = await readLimitedHtml(response);
    const title =
      html === null ? undefined : normalizeAlias(getTitleMatch(html));
    return title ? `${title}-${nanoid()}` : undefined;
  } catch {
    return undefined;
  }
};
