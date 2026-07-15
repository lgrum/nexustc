import { expect, test } from "vitest";

import robots from "./robots";
import {
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
