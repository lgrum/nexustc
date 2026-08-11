export const cacheTagsByMutation = new Map<string, readonly string[]>([
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
  ["user/toggleBookmark", ["profiles"]],
]);

export function getCacheTagsForProcedure(
  procedurePath: string,
  options?: { responseBody?: unknown; userId?: string }
) {
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
  return procedurePath === "profile/updateVisibility" ||
    procedurePath === "eteris/setPublicBalance"
    ? ({ expire: 0 } as const)
    : "max";
}
