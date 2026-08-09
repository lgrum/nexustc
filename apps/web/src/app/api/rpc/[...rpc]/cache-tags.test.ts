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
  "patreon/admin/reconcileMemberships",
  "patreon/syncMembership",
  "profile/updateAppearance",
  "profile/updateVisibility",
  "post/deleteComment",
  "post/deleteOwnComment",
  "post/toggleCommentLike",
  "progression/admin/decideCase",
  "progression/getMine",
  "progression/owner/adjustXp",
  "eteris/getMine",
  "eteris/owner/adjust",
  "eteris/owner/reconcileWallet",
  "eteris/setPublicBalance",
  "rating/create",
  "rating/delete",
  "rating/deleteAny",
  "rating/toggleReviewLike",
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
])("invalidates news and profiles for %s", (procedurePath) => {
  expect(getCacheTagsForProcedure(procedurePath)).toEqual(
    expect.arrayContaining(["news", "profiles"])
  );
});

test("does not invalidate cache tags for unknown procedures", () => {
  expect(getCacheTagsForProcedure("post/getRecent")).toEqual([]);
});

test("invalidates only the affected profile after a comic checkpoint changes its level", () => {
  expect(
    getCacheTagsForProcedure("comicProgress/update", {
      responseBody: { json: { publicProfileChanged: true } },
      userId: "user-1",
    })
  ).toEqual(["profile:user-1"]);
  expect(
    getCacheTagsForProcedure("comicProgress/update", {
      responseBody: { json: { publicProfileChanged: false } },
      userId: "user-1",
    })
  ).toEqual([]);
  expect(
    getCacheTagsForProcedure("comicProgress/update", {
      responseBody: { json: { publicProfileChanged: true } },
    })
  ).toEqual([]);
});

test("expires privacy-sensitive profile data immediately", () => {
  expect(getCacheRevalidationProfile("profile/updateVisibility")).toEqual({
    expire: 0,
  });
  expect(getCacheRevalidationProfile("profile/updateAppearance")).toBe("max");
  expect(getCacheRevalidationProfile("eteris/setPublicBalance")).toEqual({
    expire: 0,
  });
});
