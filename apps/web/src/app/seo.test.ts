import { expect, test } from "vitest";

import robots from "./robots";
import {
  createContentMetadata,
  createPageMetadata,
  defaultOpenGraphImage,
  siteDescription,
  siteName,
  siteUrl,
} from "./seo";
import sitemap from "./sitemap";

test("builds default Open Graph metadata from the canonical site URL", () => {
  const metadata = createPageMetadata({ path: "/comics", title: "Comics" });

  expect(metadata.title).toBe(`Comics | ${siteName}`);
  expect(metadata.description).toBe(siteDescription);
  expect(metadata.alternates).toStrictEqual({
    canonical: `${siteUrl}/comics`,
  });
  expect(metadata.openGraph).toMatchObject({
    images: [{ url: defaultOpenGraphImage }],
    title: `Comics | ${siteName}`,
    url: `${siteUrl}/comics`,
  });
  expect(metadata.twitter).toMatchObject({
    card: "summary_large_image",
    images: [defaultOpenGraphImage],
  });
});

test("builds complete versioned share metadata for content", () => {
  const updatedAt = new Date("2026-07-15T12:00:00.000Z");
  const metadata = createContentMetadata({
    canonicalPath: "/comic/sample-comic/read",
    contentTitle: "Sample Comic",
    identifier: "sample-comic",
    pageTitle: "NeXusTC - Leer Sample Comic",
    type: "comic",
    updatedAt,
  });
  const imageUrl = `${siteUrl}/og/comic/sample-comic?v=${updatedAt.getTime()}`;
  const image = {
    alt: "C\u00F3mic: Sample Comic",
    height: 630,
    type: "image/png",
    url: imageUrl,
    width: 1200,
  };

  expect(metadata.alternates).toStrictEqual({
    canonical: `${siteUrl}/comic/sample-comic/read`,
  });
  expect(metadata.openGraph).toMatchObject({
    description: siteDescription,
    images: [image],
    siteName,
    title: "NeXusTC - Leer Sample Comic",
    type: "article",
    url: `${siteUrl}/comic/sample-comic/read`,
  });
  expect(metadata.twitter).toStrictEqual({
    card: "summary_large_image",
    description: siteDescription,
    images: [image],
    title: "NeXusTC - Leer Sample Comic",
  });
});

test("sitemap exposes public routes only", () => {
  const urls = sitemap().map((entry) => entry.url);

  expect(urls).toContain(siteUrl);
  expect(urls).toContain(`${siteUrl}/comics`);
  expect(urls).toContain(`${siteUrl}/news`);
  expect(urls.some((url) => url.includes("/admin"))).toBe(false);
  expect(urls.some((url) => url.includes("/api"))).toBe(false);
});

test("robots points at sitemap and blocks private surfaces", () => {
  expect(robots()).toStrictEqual({
    rules: [
      {
        allow: "/",
        disallow: ["/admin", "/api", "/auth", "/profile"],
        userAgent: "*",
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  });
});
