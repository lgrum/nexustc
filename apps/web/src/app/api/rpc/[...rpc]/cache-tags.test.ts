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
  "notification/followContent",
  "profile/updateAppearance",
  "profile/updateVisibility",
  "post/deleteComment",
  "post/deleteOwnComment",
  "post/createComment",
  "progression/admin/decideCase",
  "progression/owner/adjustXp",
  "eteris/owner/adjust",
  "eteris/owner/reconcileWallet",
  "eteris/setPublicBalance",
  "rating/create",
  "rating/delete",
  "rating/deleteAny",
  "rating/update",
  "streak/completeStepUp",
  "streak/declareProtectionWindow",
  "streak/setTimezone",
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

test("invalidates the public card catalog and affected detail after card governance", () => {
  expect(
    getCacheTagsForProcedure("collectiblesAdmin/templates/publish")
  ).toEqual(["cards"]);
  expect(
    getCacheTagsForProcedure("collectiblesAdmin/templates/correct", {
      responseBody: { json: { templateId: "template-1", version: 3 } },
    })
  ).toEqual(["cards", "card:template-1"]);
  expect(
    getCacheRevalidationProfile("collectiblesAdmin/templates/disable")
  ).toEqual({
    expire: 0,
  });
});

test("invalidates public Packs and their detail after revision publication", () => {
  expect(
    getCacheTagsForProcedure("collectiblesAdmin/packs/revisions/publish", {
      responseBody: {
        json: { templateId: "pack-1", revisionId: "revision-1" },
      },
    })
  ).toEqual(["packs", "pack:pack-1", "card-shop", "gachapon"]);
  expect(
    getCacheRevalidationProfile("collectiblesAdmin/packs/revisions/publish")
  ).toEqual({
    expire: 0,
  });
});

test("invalidates Gachapon machines when their configuration or Pack Revision changes", () => {
  expect(getCacheTagsForProcedure("gacha/activate")).toEqual([
    "gachapon",
    "packs",
  ]);
  expect(
    getCacheTagsForProcedure("collectiblesAdmin/gacha/update", {
      responseBody: { json: { id: "machine-1", version: 3 } },
    })
  ).toEqual(["gachapon", "gachapon:machine-1", "packs"]);
  expect(
    getCacheTagsForProcedure("collectiblesAdmin/packs/revisions/publish", {
      responseBody: {
        json: { templateId: "pack-1", revisionId: "revision-1" },
      },
    })
  ).toEqual(["packs", "pack:pack-1", "card-shop", "gachapon"]);
});

test("invalidates a Pack detail when its template draft changes", () => {
  expect(
    getCacheTagsForProcedure("collectiblesAdmin/packs/templates/saveDraft", {
      responseBody: { json: { id: "pack-1", version: 4 } },
    })
  ).toEqual(["packs", "pack:pack-1"]);
});

test("invalidates the public shop and Pack catalog after an offer mutation", () => {
  expect(
    getCacheTagsForProcedure("collectiblesAdmin/shop/update", {
      responseBody: { json: { id: "offer-1", version: 3 } },
    })
  ).toEqual(["card-shop", "packs"]);
  expect(getCacheTagsForProcedure("cardShop/purchase")).toEqual(["card-shop"]);
});

test("expires public profiles immediately after customization publication", () => {
  expect(getCacheRevalidationProfile("profile/saveCustomization")).toEqual({
    expire: 0,
  });
});

test("refreshes catalog entitlement immediately after a purchase", () => {
  expect(getCacheTagsForProcedure("profile/purchaseCatalogItem")).toEqual([
    "catalog:profile",
    "profiles",
  ]);
  expect(getCacheRevalidationProfile("profile/purchaseCatalogItem")).toEqual({
    expire: 0,
  });
});

test.each([
  "profileCatalogAdmin/purchases/correct",
  "profileCatalogAdmin/grants/grant",
  "profileCatalogAdmin/grants/revoke",
])("refreshes editor and public entitlement immediately after %s", (path) => {
  expect(getCacheTagsForProcedure(path)).toEqual([
    "catalog:profile",
    "profiles",
  ]);
  expect(getCacheRevalidationProfile(path)).toEqual({ expire: 0 });
});

test.each([
  "profileCatalogAdmin/decorations/publish",
  "profileCatalogAdmin/entitlements/publishLayoutRequirement",
  "profileCatalogAdmin/entitlements/publishShowcaseRequirement",
  "profileCatalogAdmin/lifecycle/archive",
  "profileCatalogAdmin/lifecycle/disable",
  "profileCatalogAdmin/lifecycle/restore",
  "profileCatalogAdmin/lifecycle/rollback",
  "profileCatalogAdmin/skins/publish",
])("invalidates catalog and public profiles immediately after %s", (path) => {
  expect(getCacheTagsForProcedure(path)).toContain("profiles");
  expect(getCacheRevalidationProfile(path)).toEqual({ expire: 0 });
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
