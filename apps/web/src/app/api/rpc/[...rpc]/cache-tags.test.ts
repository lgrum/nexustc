import { expect, test } from "vitest";

import {
  getCacheRevalidationProfile,
  getCacheTagsForProcedure,
} from "./cache-tags";

test("invalidates home and catalog tags for post mutations", () => {
  expect(getCacheTagsForProcedure("post/admin/create")).toEqual([
    "catalog:games",
    "content",
    "home",
    "vip-feed",
  ]);
});

test.each([
  "patreon/syncMembership",
  "profile/updateAppearance",
  "profile/updateVisibility",
  "rating/create",
  "rating/delete",
  "rating/deleteAny",
  "rating/update",
  "user/toggleBookmark",
])("invalidates profile tags for %s", (procedurePath) => {
  expect(getCacheTagsForProcedure(procedurePath)).toEqual(["profiles"]);
});

test.each([
  "comic/admin/delete",
  "comic/admin/edit",
  "post/admin/delete",
  "post/admin/edit",
])("invalidates news for %s", (procedurePath) => {
  expect(getCacheTagsForProcedure(procedurePath)).toContain("news");
});

test("does not invalidate cache tags for unknown procedures", () => {
  expect(getCacheTagsForProcedure("post/getRecent")).toEqual([]);
});

test("expires privacy-sensitive profile data immediately", () => {
  expect(getCacheRevalidationProfile("profile/updateVisibility")).toEqual({
    expire: 0,
  });
  expect(getCacheRevalidationProfile("profile/updateAppearance")).toBe("max");
});
