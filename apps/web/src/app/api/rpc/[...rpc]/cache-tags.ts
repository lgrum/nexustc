export const cacheTagsByMutation = new Map<string, readonly string[]>([
  ["collectiblesAdmin/characters/create", ["cards"]],
  ["collectiblesAdmin/characters/update", ["cards"]],
  ["collectiblesAdmin/characters/retire", ["cards"]],
  ["collectiblesAdmin/series/create", ["cards"]],
  ["collectiblesAdmin/series/update", ["cards"]],
  ["collectiblesAdmin/series/retire", ["cards"]],
  ["collectiblesAdmin/templates/saveDraft", ["cards"]],
  ["collectiblesAdmin/templates/publish", ["cards"]],
  ["collectiblesAdmin/templates/retire", ["cards"]],
  ["collectiblesAdmin/templates/disable", ["cards"]],
  ["collectiblesAdmin/templates/restore", ["cards"]],
  ["collectiblesAdmin/templates/correct", ["cards"]],
  ["collectiblesAdmin/packs/templates/create", ["packs"]],
  ["collectiblesAdmin/packs/templates/saveDraft", ["packs"]],
  ["collectiblesAdmin/packs/templates/retire", ["packs"]],
  ["collectiblesAdmin/packs/revisions/saveDraft", ["packs"]],
  [
    "collectiblesAdmin/packs/revisions/publish",
    ["packs", "card-shop", "gachapon"],
  ],
  ["collectiblesAdmin/shop/create", ["card-shop", "packs"]],
  ["collectiblesAdmin/shop/update", ["card-shop", "packs"]],
  ["collectiblesAdmin/shop/enable", ["card-shop", "packs"]],
  ["collectiblesAdmin/shop/disable", ["card-shop", "packs"]],
  ["collectiblesAdmin/shop/restock", ["card-shop", "packs"]],
  ["collectiblesAdmin/shop/reduceQuota", ["card-shop", "packs"]],
  ["collectiblesAdmin/gacha/create", ["gachapon", "packs"]],
  ["collectiblesAdmin/gacha/update", ["gachapon", "packs"]],
  ["collectiblesAdmin/gacha/transition", ["gachapon", "packs"]],
  ["gacha/activate", ["gachapon", "packs"]],
  ["cardShop/purchase", ["card-shop"]],
  ["comic/admin/create", ["catalog:comics", "content", "home", "vip-feed"]],
  [
    "comic/admin/delete",
    ["catalog:comics", "content", "home", "news", "profiles", "vip-feed"],
  ],
  [
    "comic/admin/edit",
    ["catalog:comics", "content", "home", "news", "profiles", "vip-feed"],
  ],
  ["chronos/update", ["chronos"]],
  ["engagementQuestion/create", ["content"]],
  ["engagementQuestion/delete", ["content"]],
  ["engagementQuestion/edit", ["content"]],
  ["extras/createTutorial", ["tutorials"]],
  ["extras/deleteTutorial", ["tutorials"]],
  ["notification/admin/archive", ["news"]],
  ["notification/admin/createNewsArticle", ["news"]],
  ["notification/followContent", ["profiles"]],
  ["patreon/admin/reconcileMemberships", ["profiles"]],
  ["patreon/syncMembership", ["profiles"]],
  ["profileCatalogAdmin/decorations/publish", ["profiles"]],
  ["profileCatalogAdmin/purchases/correct", ["catalog:profile", "profiles"]],
  ["profileCatalogAdmin/grants/grant", ["catalog:profile", "profiles"]],
  ["profileCatalogAdmin/grants/revoke", ["catalog:profile", "profiles"]],
  ["profileCatalogAdmin/lifecycle/archive", ["catalog:profile", "profiles"]],
  ["profileCatalogAdmin/lifecycle/deleteDraft", ["catalog:profile"]],
  ["profileCatalogAdmin/lifecycle/disable", ["catalog:profile", "profiles"]],
  ["profileCatalogAdmin/lifecycle/restore", ["catalog:profile", "profiles"]],
  ["profileCatalogAdmin/lifecycle/rollback", ["catalog:profile", "profiles"]],
  ["profileCatalogAdmin/entitlements/publishLayoutRequirement", ["profiles"]],
  ["profileCatalogAdmin/entitlements/publishShowcaseRequirement", ["profiles"]],
  ["profileCatalogAdmin/skins/publish", ["profiles"]],
  ["post/admin/create", ["catalog:games", "content", "home", "vip-feed"]],
  [
    "post/admin/delete",
    ["catalog:games", "content", "home", "news", "profiles", "vip-feed"],
  ],
  [
    "post/admin/edit",
    ["catalog:games", "content", "home", "news", "profiles", "vip-feed"],
  ],
  ["post/admin/uploadFeaturedPosts", ["home"]],
  ["post/admin/uploadWeeklyPosts", ["home"]],
  ["post/deleteComment", ["profiles"]],
  ["post/deleteOwnComment", ["profiles"]],
  ["post/createComment", ["profiles"]],
  ["profile/finalizeUpload", ["profiles"]],
  ["profile/removeAvatar", ["profiles"]],
  ["profile/removeBanner", ["profiles"]],
  ["profile/purchaseCatalogItem", ["catalog:profile", "profiles"]],
  ["profile/saveCustomization", ["profiles"]],
  ["profile/updateAppearance", ["profiles"]],
  ["profile/updateVisibility", ["profiles"]],
  ["progression/owner/adjustXp", ["profiles"]],
  ["progression/admin/decideCase", ["profiles"]],
  ["eteris/owner/adjust", ["profiles"]],
  ["eteris/owner/reconcileWallet", ["profiles"]],
  ["eteris/setPublicBalance", ["profiles"]],
  ["rating/create", ["profiles"]],
  ["rating/delete", ["profiles"]],
  ["rating/deleteAny", ["profiles"]],
  ["rating/update", ["profiles"]],
  ["profileAdmin/assignments/setUserAssignments", ["profiles"]],
  ["profileAdmin/emblems/create", ["profiles"]],
  ["profileAdmin/emblems/delete", ["profiles"]],
  ["profileAdmin/emblems/update", ["profiles"]],
  ["profileAdmin/roles/create", ["profiles"]],
  ["profileAdmin/roles/delete", ["profiles"]],
  ["profileAdmin/roles/update", ["profiles"]],
  ["siteConfig/updateMarquee", ["site-config"]],
  ["streak/completeStepUp", ["profiles"]],
  ["streak/declareProtectionWindow", ["profiles"]],
  ["streak/setTimezone", ["profiles"]],
  ["staticPage/update", ["static-pages"]],
  ["term/create", ["catalog:comics", "catalog:games", "content", "home"]],
  ["term/delete", ["catalog:comics", "catalog:games", "content", "home"]],
  ["term/edit", ["catalog:comics", "catalog:games", "content", "home"]],
  ["user/admin/banUser", ["profiles"]],
  ["user/admin/unbanUser", ["profiles"]],
  ["user/admin/setRole", ["profiles"]],
  ["user/toggleBookmark", ["profiles"]],
]);

export function getCacheTagsForProcedure(
  procedurePath: string,
  options?: { responseBody?: unknown; userId?: string }
) {
  if (procedurePath.startsWith("collectiblesAdmin/")) {
    if (procedurePath.includes("/shop/")) {
      return ["card-shop", "packs"];
    }
    if (procedurePath.includes("/gacha/")) {
      const responseBody = options?.responseBody;
      const output =
        responseBody &&
        typeof responseBody === "object" &&
        "json" in responseBody
          ? responseBody.json
          : responseBody;
      const machineId =
        output &&
        typeof output === "object" &&
        "id" in output &&
        typeof output.id === "string"
          ? output.id
          : undefined;
      return machineId
        ? ["gachapon", `gachapon:${machineId}`, "packs"]
        : ["gachapon", "packs"];
    }
    const responseBody = options?.responseBody;
    const output =
      responseBody && typeof responseBody === "object" && "json" in responseBody
        ? responseBody.json
        : responseBody;
    if (output && typeof output === "object") {
      const templateId =
        "templateId" in output && typeof output.templateId === "string"
          ? output.templateId
          : "id" in output && typeof output.id === "string"
            ? output.id
            : undefined;
      const isPack = procedurePath.includes("/packs/");
      const scope = isPack ? "packs" : "cards";
      const tags = templateId
        ? [scope, `${isPack ? "pack" : "card"}:${templateId}`]
        : [scope];
      if (procedurePath === "collectiblesAdmin/packs/revisions/publish") {
        tags.push("card-shop");
        tags.push("gachapon");
      }
      return tags;
    }
    return (
      cacheTagsByMutation.get(procedurePath) ??
      (procedurePath.includes("/packs/") ? ["packs"] : ["cards"])
    );
  }
  if (
    procedurePath === "comicProgress/update" ||
    procedurePath === "eteris/getMine" ||
    procedurePath === "post/editOwnComment" ||
    procedurePath === "post/toggleCommentLike" ||
    procedurePath === "progression/getMine" ||
    procedurePath === "rating/toggleReviewLike"
  ) {
    if (!(options?.responseBody && typeof options.responseBody === "object")) {
      return [];
    }
    const output =
      "json" in options.responseBody
        ? options.responseBody.json
        : options.responseBody;
    if (!(output && typeof output === "object")) {
      return [];
    }
    const profileUserId =
      procedurePath === "comicProgress/update"
        ? options.userId
        : "profileUserId" in output && typeof output.profileUserId === "string"
          ? output.profileUserId
          : undefined;
    return profileUserId &&
      typeof output === "object" &&
      "publicProfileChanged" in output &&
      output.publicProfileChanged === true
      ? [`profile:${profileUserId}`]
      : [];
  }
  return cacheTagsByMutation.get(procedurePath) ?? [];
}

export function getCacheRevalidationProfile(procedurePath: string) {
  if (procedurePath.startsWith("collectiblesAdmin/")) {
    return { expire: 0 } as const;
  }
  return procedurePath === "patreon/admin/reconcileMemberships" ||
    procedurePath === "patreon/syncMembership" ||
    procedurePath === "profileCatalogAdmin/decorations/publish" ||
    procedurePath === "profileCatalogAdmin/purchases/correct" ||
    procedurePath === "profileCatalogAdmin/grants/grant" ||
    procedurePath === "profileCatalogAdmin/grants/revoke" ||
    procedurePath === "profileCatalogAdmin/lifecycle/archive" ||
    procedurePath === "profileCatalogAdmin/lifecycle/disable" ||
    procedurePath === "profileCatalogAdmin/lifecycle/restore" ||
    procedurePath === "profileCatalogAdmin/lifecycle/rollback" ||
    procedurePath ===
      "profileCatalogAdmin/entitlements/publishLayoutRequirement" ||
    procedurePath ===
      "profileCatalogAdmin/entitlements/publishShowcaseRequirement" ||
    procedurePath === "profileCatalogAdmin/skins/publish" ||
    procedurePath === "profile/updateVisibility" ||
    procedurePath === "profile/purchaseCatalogItem" ||
    procedurePath === "profile/saveCustomization" ||
    procedurePath === "eteris/setPublicBalance" ||
    procedurePath === "user/admin/setRole"
    ? ({ expire: 0 } as const)
    : "max";
}
