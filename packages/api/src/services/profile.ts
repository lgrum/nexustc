import { and, eq, inArray, ne, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  patron,
  post,
  postBookmark,
  postRating,
  profileEmblemAssignment,
  profileEmblemDefinition,
  profileMediaAsset,
  profileRoleAssignment,
  profileRoleDefinition,
  profileSettings,
  profileSystemConfig,
  user,
} from "@repo/db/schema/app";
import { env } from "@repo/env";
import {
  PATRON_TIER_PROFILE_BADGES,
  ROLE_PROFILE_STYLES,
  userMeetsTierLevel,
} from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import {
  getProfileActivityVisibility,
  normalizeProfileVisibilityConfig,
  PROFILE_DEFAULTS,
  PROFILE_VISIBILITY_DEFAULTS,
} from "@repo/shared/profile";
import type {
  ProfileActivityCollection,
  ProfileActivityVisibility,
  ProfileVisibilityConfig,
} from "@repo/shared/profile";
import type {
  EffectiveProfileShowcase,
  ProfileCustomizationDraft,
} from "@repo/shared/profile-customization";

import { publicCatalogVisibilityCondition } from "../utils/early-access";
import { userIsNotActivelyBanned } from "../utils/user-ban";
import { getPublicWalletBalance } from "./eteris";
import {
  loadPublicFavoriteGamesShowcase,
  loadProfileCustomizationEditorState,
  resolvePublicProfileManifest,
} from "./profile-customization";
import type { resolveVirtualDefaultManifest } from "./profile-customization";
import { getPublicAccountLevel } from "./progression";
import { getStreakState } from "./streak";

type Database = typeof database;
export type ProfileEntitlementDb = Pick<Database, "query">;

export type ProfileEntitlements = {
  canUseAnimatedAvatar: boolean;
  canUseUploadedBanner: boolean;
  canUseAnimatedBanner: boolean;
  animatedAvatarRequiredTier: PatronTier;
  uploadedBannerRequiredTier: PatronTier;
  animatedBannerRequiredTier: PatronTier;
  overrideSource: "none" | "staff";
};

export type PublicProfileRole = {
  id: string;
  slug: string;
  name: string;
  description: string;
  priority: number;
  isExclusive: boolean;
  visualConfig: {
    baseColor: string;
    accentColor: string | null;
    textColor: string;
    glowColor: string | null;
  };
  icon: { objectKey: string; isAnimated: boolean } | null;
  overlay: { objectKey: string; isAnimated: boolean } | null;
};

export type PublicProfileEmblem = {
  id: string;
  slug: string;
  name: string;
  tooltip: string;
  priority: number;
  icon: { objectKey: string; isAnimated: boolean } | null;
};

export type ProfileSummary = {
  id: string;
  name: string;
  image: string | null;
  avatar: {
    objectKey: string;
    isAnimated: boolean;
    mimeType: string;
  } | null;
  avatarFallbackColor: string;
  href: string;
  patronBadge: string | null;
  patronTier: PatronTier;
  role: string;
  roleBadge: string | null;
  roleGradient: string | null;
  profileRoles: PublicProfileRole[];
  profileEmblems: PublicProfileEmblem[];
};

export type PublicProfile = ProfileSummary & {
  accountLevel: number | null;
  activityCounts: Record<ProfileActivityCollection, number | null>;
  createdAt: Date;
  currentStreak?: number;
  eterisBalance: string | null;
  banner: {
    mode: "color" | "image";
    color: string;
    asset: {
      objectKey: string;
      isAnimated: boolean;
      mimeType: string;
    } | null;
  };
  maxVisibleEmblems: number;
  visibility: ProfileActivityVisibility;
  manifest?: PublicProfileManifest;
};

export type PublicProfileShell = ProfileSummary & {
  accountLevel: number | null;
  banner: PublicProfile["banner"];
};

export type PublicProfileManifest = ReturnType<
  typeof resolveVirtualDefaultManifest
> & {
  shell: PublicProfileShell;
};

const STREAK_MILESTONES = [7, 30, 100, 365] as const;

export function resolveScalarProfileShowcases(
  configuration: ProfileCustomizationDraft,
  sources: {
    currentStreak: number | null;
    progression: Awaited<ReturnType<typeof getPublicAccountLevel>>;
    publicWallet: Awaited<ReturnType<typeof getPublicWalletBalance>>;
  }
) {
  const showcases: EffectiveProfileShowcase[] = [];
  for (const showcase of configuration.showcases) {
    if (!showcase.enabled) {
      continue;
    }
    const variant = showcase.variant === "compact" ? "compact" : "standard";
    if (showcase.type === "xp" && sources.progression) {
      showcases.push({
        accountLevel: sources.progression.level,
        currentLevelXp: sources.progression.currentLevelXp,
        nextLevelRequirement: sources.progression.nextLevelRequirement,
        order: showcase.order,
        progress: sources.progression.progress,
        rendererKey: "xp",
        type: "xp",
        variant,
        xpRemaining: sources.progression.xpRemaining,
      });
    } else if (showcase.type === "streak" && sources.currentStreak) {
      showcases.push({
        currentStreak: sources.currentStreak,
        nextMilestone:
          STREAK_MILESTONES.find(
            (milestone) => milestone > sources.currentStreak!
          ) ?? null,
        order: showcase.order,
        rendererKey: "streak",
        type: "streak",
        variant,
      });
    } else if (showcase.type === "eteris" && sources.publicWallet) {
      showcases.push({
        balance: sources.publicWallet.balance,
        order: showcase.order,
        rendererKey: "eteris",
        type: "eteris",
        variant,
      });
    }
  }
  return showcases;
}

export async function resolveIsolatedScalarProfileShowcases(
  configuration: Promise<ProfileCustomizationDraft>,
  sources: {
    currentStreak: Promise<number | null>;
    progression: Promise<Awaited<ReturnType<typeof getPublicAccountLevel>>>;
    publicWallet: Promise<Awaited<ReturnType<typeof getPublicWalletBalance>>>;
  }
) {
  const [configurationResult, progression, currentStreak, publicWallet] =
    await Promise.allSettled([
      configuration,
      sources.progression,
      sources.currentStreak,
      sources.publicWallet,
    ]);
  if (configurationResult.status === "rejected") {
    return [];
  }
  return resolveScalarProfileShowcases(configurationResult.value, {
    currentStreak:
      currentStreak.status === "fulfilled" ? currentStreak.value : null,
    progression: progression.status === "fulfilled" ? progression.value : null,
    publicWallet:
      publicWallet.status === "fulfilled" ? publicWallet.value : null,
  });
}

export async function getPublicScalarProfileShowcases(
  db: Database,
  userId: string
) {
  const settings = await getProfileSettingsForRead(db, userId);
  const visibility = resolveProfileVisibility(settings.visibilityConfig);
  const effectiveConfiguration = (async () => {
    const state = await loadProfileCustomizationEditorState(
      db,
      userId,
      settings.visibilityConfig
    );
    return state.effectiveConfiguration;
  })();
  return resolveIsolatedScalarProfileShowcases(effectiveConfiguration, {
    currentStreak: getPublicCurrentStreak(db, userId, visibility),
    progression: getPublicAccountLevel(db, userId),
    publicWallet: getPublicWalletBalance(db, userId),
  });
}

const PROFILE_ENTITLEMENT_RULES = {
  animatedAvatarRequiredTier: "level3",
  animatedBannerRequiredTier: "level8",
  uploadedBannerRequiredTier: "level5",
} as const satisfies Record<string, PatronTier>;

function clampVisibleRoles(roles: PublicProfileRole[]) {
  const sorted = [...roles].toSorted((a, b) => b.priority - a.priority);
  const topExclusive = sorted.find((role) => role.isExclusive);

  if (!topExclusive) {
    return sorted;
  }

  return [topExclusive];
}

function clampVisibleEmblems(
  emblems: PublicProfileEmblem[],
  maxVisibleEmblems: number
) {
  return [...emblems]
    .toSorted((a, b) => b.priority - a.priority)
    .slice(0, maxVisibleEmblems);
}

export async function getUserPatronTier(
  db: ProfileEntitlementDb,
  userId: string
) {
  const patronRecord = await db.query.patron.findFirst({
    columns: { isActivePatron: true, tier: true },
    where: eq(patron.userId, userId),
  });

  if (!patronRecord?.isActivePatron) {
    return "none" as PatronTier;
  }

  return patronRecord.tier;
}

export function getProfileEntitlementsForTier(
  tier: PatronTier
): Omit<ProfileEntitlements, "overrideSource"> {
  return {
    animatedAvatarRequiredTier:
      PROFILE_ENTITLEMENT_RULES.animatedAvatarRequiredTier,
    animatedBannerRequiredTier:
      PROFILE_ENTITLEMENT_RULES.animatedBannerRequiredTier,
    canUseAnimatedAvatar: userMeetsTierLevel(
      { tier },
      PROFILE_ENTITLEMENT_RULES.animatedAvatarRequiredTier
    ),
    canUseAnimatedBanner: userMeetsTierLevel(
      { tier },
      PROFILE_ENTITLEMENT_RULES.animatedBannerRequiredTier
    ),
    canUseUploadedBanner: userMeetsTierLevel(
      { tier },
      PROFILE_ENTITLEMENT_RULES.uploadedBannerRequiredTier
    ),
    uploadedBannerRequiredTier:
      PROFILE_ENTITLEMENT_RULES.uploadedBannerRequiredTier,
  };
}

export async function getProfileEntitlements(
  db: ProfileEntitlementDb,
  userId: string,
  role?: string | null
): Promise<ProfileEntitlements> {
  if (role && role !== "user") {
    return {
      animatedAvatarRequiredTier:
        PROFILE_ENTITLEMENT_RULES.animatedAvatarRequiredTier,
      animatedBannerRequiredTier:
        PROFILE_ENTITLEMENT_RULES.animatedBannerRequiredTier,
      canUseAnimatedAvatar: true,
      canUseAnimatedBanner: true,
      canUseUploadedBanner: true,
      overrideSource: "staff",
      uploadedBannerRequiredTier:
        PROFILE_ENTITLEMENT_RULES.uploadedBannerRequiredTier,
    };
  }

  const tier = await getUserPatronTier(db, userId);

  return {
    ...getProfileEntitlementsForTier(tier),
    overrideSource: "none",
  };
}

export function resolveProfileVisibility(
  value: unknown
): ProfileVisibilityConfig {
  return normalizeProfileVisibilityConfig(value);
}

export async function getResolvedProfileVisibility(
  db: Database,
  userId: string
): Promise<ProfileVisibilityConfig> {
  const settings = await db.query.profileSettings.findFirst({
    columns: { visibilityConfig: true },
    where: eq(profileSettings.userId, userId),
  });

  return resolveProfileVisibility(settings?.visibilityConfig);
}

export async function canReadPublicProfileActivity(
  db: Database,
  userId: string,
  collection: ProfileActivityCollection
) {
  const visibility = await getResolvedProfileVisibility(db, userId);
  return visibility[collection];
}

export async function getPublicProfileActivityCounts(
  db: Database,
  userId: string,
  visibility: ProfileActivityVisibility,
  now = new Date()
): Promise<Record<ProfileActivityCollection, number | null>> {
  const favoriteCountPromise = visibility.favorites
    ? db
        .select({ count: sql<number>`COUNT(*)::integer` })
        .from(postBookmark)
        .innerJoin(user, eq(user.id, postBookmark.userId))
        .innerJoin(post, eq(post.id, postBookmark.postId))
        .where(
          and(
            eq(postBookmark.userId, userId),
            eq(post.status, "publish"),
            publicCatalogVisibilityCondition(now),
            userIsNotActivelyBanned(now)
          )
        )
    : null;
  const reviewCountPromise = visibility.reviews
    ? db
        .select({ count: sql<number>`COUNT(*)::integer` })
        .from(postRating)
        .innerJoin(user, eq(user.id, postRating.userId))
        .innerJoin(post, eq(post.id, postRating.postId))
        .where(
          and(
            eq(postRating.userId, userId),
            ne(postRating.review, ""),
            eq(post.status, "publish"),
            publicCatalogVisibilityCondition(now),
            userIsNotActivelyBanned(now)
          )
        )
    : null;
  const [favoriteCountRows, reviewCountRows] = await Promise.all([
    favoriteCountPromise,
    reviewCountPromise,
  ]);

  return {
    favorites: visibility.favorites
      ? (favoriteCountRows?.[0]?.count ?? 0)
      : null,
    reviews: visibility.reviews ? (reviewCountRows?.[0]?.count ?? 0) : null,
  };
}

export async function getPublicCurrentStreak(
  db: Database,
  userId: string,
  visibility: ProfileVisibilityConfig,
  now = new Date()
) {
  if (!visibility.streak) {
    return null;
  }

  const publicAccount = await db.query.user.findFirst({
    columns: { id: true },
    where: and(eq(user.id, userId), userIsNotActivelyBanned(now)),
  });
  if (!publicAccount) {
    return null;
  }

  const state = await getStreakState(db, userId, now);
  return state.available && state.initialized && state.currentStreak > 0
    ? state.currentStreak
    : null;
}

export async function getPublicCurrentStreakForUser(
  db: Database,
  userId: string,
  now = new Date()
) {
  const visibility = await getResolvedProfileVisibility(db, userId);
  return getPublicCurrentStreak(db, userId, visibility, now);
}

export async function getOrCreateProfileSettings(db: Database, userId: string) {
  const existing = await db.query.profileSettings.findFirst({
    where: eq(profileSettings.userId, userId),
  });

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(profileSettings)
    .values({
      bannerColor: PROFILE_DEFAULTS.bannerColor,
      bannerMode: "color",
      userId,
      visibilityConfig: {
        ...PROFILE_VISIBILITY_DEFAULTS,
        reserved: {},
      },
    })
    .returning();

  return created!;
}

export async function getProfileSettingsForRead(db: Database, userId: string) {
  const existing = await db.query.profileSettings.findFirst({
    where: eq(profileSettings.userId, userId),
  });

  return (
    existing ?? {
      bannerAssetId: null,
      bannerColor: PROFILE_DEFAULTS.bannerColor,
      bannerMode: "color" as const,
      visibilityConfig: {
        ...PROFILE_VISIBILITY_DEFAULTS,
        reserved: {},
      },
    }
  );
}

export async function getOrCreateProfileSystemConfig(db: Database) {
  const existing = await db.query.profileSystemConfig.findFirst({
    where: eq(profileSystemConfig.id, "default"),
  });

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(profileSystemConfig)
    .values({
      id: "default",
      maxVisibleEmblems: PROFILE_DEFAULTS.maxVisibleEmblems,
    })
    .returning();

  return created!;
}

async function getProfileSystemConfigForRead(db: Database) {
  return (
    (await db.query.profileSystemConfig.findFirst({
      where: eq(profileSystemConfig.id, "default"),
    })) ?? { maxVisibleEmblems: PROFILE_DEFAULTS.maxVisibleEmblems }
  );
}

function getMediaAssetsByIds(db: Database, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  return db.query.profileMediaAsset.findMany({
    where: inArray(profileMediaAsset.id, ids),
  });
}

export async function buildProfileSummaries(
  db: Database,
  userIds: string[],
  asOf = new Date()
) {
  if (userIds.length === 0) {
    return [] satisfies ProfileSummary[];
  }

  const uniqueUserIds = [...new Set(userIds)];
  const [users, systemConfig, settings, patronRows, roleRows, emblemRows] =
    await Promise.all([
      db.query.user.findMany({
        columns: {
          avatarFallbackColor: true,
          id: true,
          image: true,
          name: true,
          role: true,
        },
        where: and(
          inArray(user.id, uniqueUserIds),
          userIsNotActivelyBanned(asOf)
        ),
      }),
      getProfileSystemConfigForRead(db),
      db.query.profileSettings.findMany({
        columns: {
          bannerAssetId: true,
          bannerColor: true,
          bannerMode: true,
          userId: true,
        },
        where: inArray(profileSettings.userId, uniqueUserIds),
      }),
      db.query.patron.findMany({
        columns: {
          isActivePatron: true,
          tier: true,
          userId: true,
        },
        where: inArray(patron.userId, uniqueUserIds),
      }),
      db
        .select({
          assignmentVisible: profileRoleAssignment.isVisible,
          description: profileRoleDefinition.description,
          endsAt: profileRoleAssignment.endsAt,
          iconAssetId: profileRoleDefinition.iconAssetId,
          id: profileRoleDefinition.id,
          isActive: profileRoleDefinition.isActive,
          isExclusive: profileRoleDefinition.isExclusive,
          isVisible: profileRoleDefinition.isVisible,
          name: profileRoleDefinition.name,
          overlayAssetId: profileRoleDefinition.overlayAssetId,
          priority: profileRoleDefinition.priority,
          slug: profileRoleDefinition.slug,
          startsAt: profileRoleAssignment.startsAt,
          userId: profileRoleAssignment.userId,
          visualConfig: profileRoleDefinition.visualConfig,
        })
        .from(profileRoleAssignment)
        .innerJoin(
          profileRoleDefinition,
          eq(profileRoleDefinition.id, profileRoleAssignment.roleDefinitionId)
        )
        .where(inArray(profileRoleAssignment.userId, uniqueUserIds)),
      db
        .select({
          assignmentVisible: profileEmblemAssignment.isVisible,
          endsAt: profileEmblemAssignment.endsAt,
          iconAssetId: profileEmblemDefinition.iconAssetId,
          id: profileEmblemDefinition.id,
          isActive: profileEmblemDefinition.isActive,
          isVisible: profileEmblemDefinition.isVisible,
          name: profileEmblemDefinition.name,
          priority: profileEmblemDefinition.priority,
          slug: profileEmblemDefinition.slug,
          startsAt: profileEmblemAssignment.startsAt,
          tooltip: profileEmblemDefinition.tooltip,
          userId: profileEmblemAssignment.userId,
        })
        .from(profileEmblemAssignment)
        .innerJoin(
          profileEmblemDefinition,
          eq(
            profileEmblemDefinition.id,
            profileEmblemAssignment.emblemDefinitionId
          )
        )
        .where(inArray(profileEmblemAssignment.userId, uniqueUserIds)),
    ]);

  const assetIds = [
    ...new Set(
      [...settings, ...roleRows, ...emblemRows]
        .flatMap((row) => {
          if ("bannerAssetId" in row) {
            return row.bannerAssetId ? [row.bannerAssetId] : [];
          }

          if ("overlayAssetId" in row) {
            return [row.iconAssetId, row.overlayAssetId].filter(Boolean);
          }

          return [row.iconAssetId].filter(Boolean);
        })
        // oxlint-disable-next-line unicorn/prefer-native-coercion-functions: the type guard is necessary
        .filter((value): value is string => Boolean(value))
    ),
  ];

  const avatarObjectKeys = users
    .map((currentUser) => currentUser.image)
    // oxlint-disable-next-line unicorn/prefer-native-coercion-functions: see above
    .filter((value): value is string => Boolean(value));

  const [mediaAssets, avatarAssets] = await Promise.all([
    getMediaAssetsByIds(db, assetIds),
    avatarObjectKeys.length > 0
      ? db.query.profileMediaAsset.findMany({
          where: inArray(profileMediaAsset.objectKey, avatarObjectKeys),
        })
      : [],
  ]);
  const mediaAssetMap = new Map(mediaAssets.map((asset) => [asset.id, asset]));
  const avatarAssetMap = new Map(
    avatarAssets.map((asset) => [asset.objectKey, asset])
  );
  const roleDefinitionMap = new Map(roleRows.map((row) => [row.slug, row]));
  const patronTierMap = new Map(
    patronRows.map((row) => [
      row.userId,
      row.isActivePatron ? row.tier : ("none" as PatronTier),
    ])
  );
  const now = Date.now();
  const roleGroups = new Map<string, PublicProfileRole[]>();
  const emblemGroups = new Map<string, PublicProfileEmblem[]>();

  for (const row of roleRows) {
    if (!(row.assignmentVisible && row.isVisible && row.isActive)) {
      continue;
    }

    if (
      (row.startsAt && row.startsAt.getTime() > now) ||
      (row.endsAt && row.endsAt.getTime() < now)
    ) {
      continue;
    }

    const iconAsset = row.iconAssetId
      ? mediaAssetMap.get(row.iconAssetId)
      : null;
    const overlayAsset = row.overlayAssetId
      ? mediaAssetMap.get(row.overlayAssetId)
      : null;
    const role = {
      description: row.description,
      icon: iconAsset
        ? { isAnimated: iconAsset.isAnimated, objectKey: iconAsset.objectKey }
        : null,
      id: row.id,
      isExclusive: row.isExclusive,
      name: row.name,
      overlay: overlayAsset
        ? {
            isAnimated: overlayAsset.isAnimated,
            objectKey: overlayAsset.objectKey,
          }
        : null,
      priority: row.priority,
      slug: row.slug,
      visualConfig: row.visualConfig,
    } satisfies PublicProfileRole;
    const group = roleGroups.get(row.userId) ?? [];
    group.push(role);
    roleGroups.set(row.userId, group);
  }

  for (const row of emblemRows) {
    if (!(row.assignmentVisible && row.isVisible && row.isActive)) {
      continue;
    }

    if (
      (row.startsAt && row.startsAt.getTime() > now) ||
      (row.endsAt && row.endsAt.getTime() < now)
    ) {
      continue;
    }

    const iconAsset = row.iconAssetId
      ? mediaAssetMap.get(row.iconAssetId)
      : null;
    const emblem = {
      icon: iconAsset
        ? { isAnimated: iconAsset.isAnimated, objectKey: iconAsset.objectKey }
        : null,
      id: row.id,
      name: row.name,
      priority: row.priority,
      slug: row.slug,
      tooltip: row.tooltip,
    } satisfies PublicProfileEmblem;
    const group = emblemGroups.get(row.userId) ?? [];
    group.push(emblem);
    emblemGroups.set(row.userId, group);
  }

  return users.map((currentUser) => {
    const fallbackRole = roleDefinitionMap.get(currentUser.role ?? "user");
    const currentRoles = roleGroups.get(currentUser.id) ?? [];
    const resolvedRoles =
      currentRoles.length > 0
        ? currentRoles
        : fallbackRole && currentUser.role !== "user"
          ? [
              {
                description: fallbackRole.description,
                icon: fallbackRole.iconAssetId
                  ? (() => {
                      const asset = mediaAssetMap.get(fallbackRole.iconAssetId);
                      return asset
                        ? {
                            isAnimated: asset.isAnimated,
                            objectKey: asset.objectKey,
                          }
                        : null;
                    })()
                  : null,
                id: fallbackRole.id,
                isExclusive: fallbackRole.isExclusive,
                name: fallbackRole.name,
                overlay: fallbackRole.overlayAssetId
                  ? (() => {
                      const asset = mediaAssetMap.get(
                        fallbackRole.overlayAssetId
                      );
                      return asset
                        ? {
                            isAnimated: asset.isAnimated,
                            objectKey: asset.objectKey,
                          }
                        : null;
                    })()
                  : null,
                priority: fallbackRole.priority,
                slug: fallbackRole.slug,
                visualConfig: fallbackRole.visualConfig,
              },
            ]
          : [];

    const patronTier = patronTierMap.get(currentUser.id) ?? "none";
    const roleStyle =
      currentUser.role === "user"
        ? null
        : ROLE_PROFILE_STYLES[currentUser.role];

    return {
      avatar: currentUser.image
        ? (() => {
            const asset = avatarAssetMap.get(currentUser.image);
            return asset
              ? {
                  isAnimated: asset.isAnimated,
                  mimeType: asset.mimeType,
                  objectKey: asset.objectKey,
                }
              : {
                  isAnimated: false,
                  mimeType: "image/webp",
                  objectKey: currentUser.image,
                };
          })()
        : null,
      avatarFallbackColor:
        currentUser.avatarFallbackColor ?? PROFILE_DEFAULTS.avatarFallbackColor,
      href: `/user/${currentUser.id}`,
      id: currentUser.id,
      image: currentUser.image,
      name: currentUser.name,
      patronBadge: PATRON_TIER_PROFILE_BADGES[patronTier],
      patronTier,
      role: currentUser.role,
      roleBadge: roleStyle?.badge ?? null,
      roleGradient: roleStyle?.gradient ?? null,
      profileEmblems: clampVisibleEmblems(
        emblemGroups.get(currentUser.id) ?? [],
        systemConfig.maxVisibleEmblems
      ),
      profileRoles: clampVisibleRoles(resolvedRoles),
    } satisfies ProfileSummary;
  });
}

export async function getPublicProfile(
  db: Database,
  userId: string,
  {
    customizationEnabled = env.PROFILE_CUSTOMIZATION_ENABLED,
    includeCurrentStreak = true,
  }: {
    customizationEnabled?: boolean;
    includeCurrentStreak?: boolean;
  } = {}
) {
  const now = new Date();
  const [summary] = await buildProfileSummaries(db, [userId], now);

  if (!summary) {
    return null;
  }

  const [settings, currentUser, systemConfig] = await Promise.all([
    getProfileSettingsForRead(db, userId),
    db.query.user.findFirst({
      columns: { createdAt: true },
      where: and(eq(user.id, userId), userIsNotActivelyBanned(now)),
    }),
    getProfileSystemConfigForRead(db),
  ]);

  if (!currentUser) {
    return null;
  }

  const profileVisibility = resolveProfileVisibility(settings.visibilityConfig);
  const visibility = getProfileActivityVisibility(profileVisibility);
  const [
    bannerAsset,
    activityCounts,
    currentStreak,
    progression,
    publicWallet,
    selectedCustomization,
    favoriteGames,
  ] = await Promise.all([
    settings.bannerAssetId
      ? db.query.profileMediaAsset.findFirst({
          where: eq(profileMediaAsset.id, settings.bannerAssetId),
        })
      : null,
    getPublicProfileActivityCounts(db, userId, visibility, now),
    includeCurrentStreak
      ? getPublicCurrentStreak(db, userId, profileVisibility, now)
      : null,
    getPublicAccountLevel(db, userId, now),
    customizationEnabled
      ? Promise.resolve(null)
      : getPublicWalletBalance(db, userId, now),
    customizationEnabled
      ? loadProfileCustomizationEditorState(
          db,
          userId,
          settings.visibilityConfig
        )
      : null,
    customizationEnabled
      ? loadPublicFavoriteGamesShowcase(db, userId)
      : Promise.resolve([]),
  ]);

  const shell = {
    ...summary,
    accountLevel: progression?.level ?? null,
    banner: {
      asset: bannerAsset
        ? {
            isAnimated: bannerAsset.isAnimated,
            mimeType: bannerAsset.mimeType,
            objectKey: bannerAsset.objectKey,
          }
        : null,
      color: settings.bannerColor,
      mode: settings.bannerMode,
    },
  } satisfies PublicProfileShell;

  return {
    ...summary,
    accountLevel: shell.accountLevel,
    activityCounts,
    banner: shell.banner,
    createdAt: currentUser.createdAt,
    ...(currentStreak === null ? {} : { currentStreak }),
    eterisBalance: publicWallet?.balance ?? null,
    maxVisibleEmblems: systemConfig.maxVisibleEmblems,
    ...(() => {
      const manifest = resolvePublicProfileManifest({
        activityCounts,
        customizationEnabled,
        favoriteGames,
        decorations: selectedCustomization?.decorations,
        selectedConfiguration:
          selectedCustomization && !selectedCustomization.isVirtual
            ? selectedCustomization.effectiveConfiguration
            : undefined,
        skins: selectedCustomization?.skins,
        visibility: settings.visibilityConfig,
      });
      return manifest ? { manifest: { ...manifest, shell } } : {};
    })(),
    visibility,
  } satisfies PublicProfile;
}
