import { expect, test } from "vitest";

import { getCacheTagsForProcedure } from "./cache-tags";

test("invalidates home and catalog tags for post mutations", () => {
  expect(getCacheTagsForProcedure("post/admin/create")).toEqual([
    "catalog:games",
    "content",
    "home",
    "vip-feed",
  ]);
});

test("invalidates profile tags for profile mutations", () => {
  expect(getCacheTagsForProcedure("profile/updateAppearance")).toEqual([
    "profiles",
  ]);
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
