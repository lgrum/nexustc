import type { MetadataRoute } from "next";

import { siteUrl } from "./seo";

const routes = [
  "",
  "/about",
  "/chronos",
  "/comics",
  "/forgot-password",
  "/juegos",
  "/legal",
  "/memberships",
  "/news",
  "/privacy",
  "/reset-password",
  "/review-guidelines",
  "/terms",
  "/tutorials",
  "/vip",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return routes.map((route) => ({
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1 : 0.7,
    url: `${siteUrl}${route}`,
  }));
}
