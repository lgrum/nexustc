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
  "progression/admin/decideCase",
  "progression/owner/adjustXp",
  "eteris/owner/adjust",
  "eteris/owner/reconcileWallet",
  "eteris/setPublicBalance",
  "rating/create",
  "rating/delete",
  "rating/deleteAny",
  "rating/update",
  "user/admin/banUser",
  "user/admin/unbanUser",
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

test.each(["post/toggleCommentLike", "rating/toggleReviewLike"])(
  "invalidates only the rewarded author's profile after %s changes Account Level",
  (procedurePath) => {
    expect(
      getCacheTagsForProcedure(procedurePath, {
        responseBody: {
          json: {
            profileUserId: "author-1",
            publicProfileChanged: true,
          },
        },
      })
    ).toEqual(["profile:author-1"]);
    expect(
      getCacheTagsForProcedure(procedurePath, {
        responseBody: {
          json: {
            profileUserId: "author-1",
            publicProfileChanged: false,
          },
        },
      })
    ).toEqual([]);
  }
);

test.each(["eteris/getMine", "post/editOwnComment", "progression/getMine"])(
  "invalidates only the affected profile after %s changes public data",
  (procedurePath) => {
    expect(
      getCacheTagsForProcedure(procedurePath, {
        responseBody: {
          json: {
            profileUserId: "user-1",
            publicProfileChanged: true,
          },
        },
      })
    ).toEqual(["profile:user-1"]);
    expect(
      getCacheTagsForProcedure(procedurePath, {
        responseBody: {
          json: {
            profileUserId: "user-1",
            publicProfileChanged: false,
          },
        },
      })
    ).toEqual([]);
  }
);

test("expires privacy-sensitive profile data immediately", () => {
  expect(getCacheRevalidationProfile("profile/updateVisibility")).toEqual({
    expire: 0,
  });
  expect(getCacheRevalidationProfile("profile/updateAppearance")).toBe("max");
  expect(getCacheRevalidationProfile("eteris/setPublicBalance")).toEqual({
    expire: 0,
  });
});
