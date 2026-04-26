import { GetObjectCommand } from "@aws-sdk/client-s3";
import { and, eq, inArray, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  patron,
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
  userMeetsTierLevel,
} from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import { PROFILE_DEFAULTS } from "@repo/shared/profile";
import type { ProfileMediaSlot } from "@repo/shared/profile";
import sharp from "sharp";

import { getS3Client } from "../utils/s3";

type Database = typeof database;

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
  profileRoles: PublicProfileRole[];
  profileEmblems: PublicProfileEmblem[];
};

export type PublicProfile = ProfileSummary & {
  createdAt: Date;
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
};

export type ProfileMediaValidation = {
  width: number;
  height: number;
  durationMs: number | null;
  isAnimated: boolean;
  fileSizeBytes: number;
};

const STAFF_OVERRIDE_ROLES = new Set(["owner", "admin", "moderator"]);

const PROFILE_ENTITLEMENT_RULES = {
  animatedAvatarRequiredTier: "level3",
  animatedBannerRequiredTier: "level8",
  uploadedBannerRequiredTier: "level5",
} as const satisfies Record<string, PatronTier>;

const SLOT_LIMITS = {
  avatar: {
    animatedBytes: 1024 * 1024 * 1.5,
    maxDurationMs: 6000,
    minHeight: 64,
    minWidth: 64,
    staticBytes: 1024 * 512,
  },
  banner: {
    animatedBytes: 1024 * 1024 * 3,
    maxDurationMs: 8000,
    minHeight: 64,
    minWidth: 128,
    staticBytes: 1024 * 1024 * 1.5,
  },
  "emblem-icon": {
    animatedBytes: 1024 * 1024,
    maxDurationMs: 6000,
    minHeight: 32,
    minWidth: 32,
    staticBytes: 1024 * 512,
  },
  "role-icon": {
    animatedBytes: 1024 * 1024,
    maxDurationMs: 6000,
    minHeight: 32,
    minWidth: 32,
    staticBytes: 1024 * 512,
  },
  "role-overlay": {
    animatedBytes: 1024 * 1024,
    maxDurationMs: 6000,
    minHeight: 32,
    minWidth: 32,
    staticBytes: 1024 * 512,
  },
} as const;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

export async function getUserPatronTier(db: Database, userId: string) {
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
  db: Database,
  userId: string,
  role?: string | null
): Promise<ProfileEntitlements> {
  if (role && STAFF_OVERRIDE_ROLES.has(role)) {
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
      visibilityConfig: { reserved: {} },
    })
    .returning();

  return created!;
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

export function getObjectExtension(contentType: string) {
  const extension = MIME_EXTENSIONS[contentType];

  if (!extension) {
    throw new Error("UNSUPPORTED_CONTENT_TYPE");
  }

  return extension;
}

export function inferAnimationDurationMs(metadata: sharp.Metadata) {
  if (!metadata.delay) {
    return null;
  }

  if (Array.isArray(metadata.delay)) {
    return metadata.delay.reduce((sum, frameDelay) => sum + frameDelay, 0);
  }

  return metadata.delay;
}

async function readAssetBuffer(objectKey: string) {
  const output = await getS3Client().send(
    new GetObjectCommand({
      Bucket: env.R2_ASSETS_BUCKET_NAME,
      Key: objectKey,
    })
  );

  if (!output.Body) {
    throw new Error("ASSET_NOT_FOUND");
  }

  const body = await output.Body.transformToByteArray();
  return Buffer.from(body);
}

export async function inspectProfileMediaAsset(objectKey: string) {
  const buffer = await readAssetBuffer(objectKey);
  const metadata = await sharp(buffer, { animated: true }).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const isAnimated = (metadata.pages ?? 1) > 1;
  const durationMs = inferAnimationDurationMs(metadata);

  if (!(width > 0 && height > 0)) {
    throw new Error("INVALID_IMAGE_DIMENSIONS");
  }

  return {
    durationMs,
    fileSizeBytes: buffer.length,
    height,
    isAnimated,
    width,
  } satisfies ProfileMediaValidation;
}

export function validateProfileMediaUpload({
  slot,
  contentType,
  validation,
  entitlements,
}: {
  slot: ProfileMediaSlot;
  contentType: string;
  validation: ProfileMediaValidation;
  entitlements: ProfileEntitlements;
}) {
  if (!(contentType in MIME_EXTENSIONS)) {
    throw new Error("UNSUPPORTED_CONTENT_TYPE");
  }

  const limits = SLOT_LIMITS[slot];
  const maxBytes = validation.isAnimated
    ? limits.animatedBytes
    : limits.staticBytes;

  if (validation.fileSizeBytes > maxBytes) {
    throw new Error("FILE_TOO_LARGE");
  }

  if (
    validation.width < limits.minWidth ||
    validation.height < limits.minHeight
  ) {
    throw new Error("IMAGE_TOO_SMALL");
  }

  if (
    validation.isAnimated &&
    validation.durationMs !== null &&
    validation.durationMs > limits.maxDurationMs
  ) {
    throw new Error("ANIMATION_TOO_LONG");
  }

  if (
    slot === "avatar" &&
    validation.isAnimated &&
    !entitlements.canUseAnimatedAvatar
  ) {
    throw new Error("ANIMATED_AVATAR_NOT_ALLOWED");
  }

  if (slot === "banner") {
    if (!entitlements.canUseUploadedBanner) {
      throw new Error("BANNER_UPLOAD_NOT_ALLOWED");
    }

    if (validation.isAnimated && !entitlements.canUseAnimatedBanner) {
      throw new Error("ANIMATED_BANNER_NOT_ALLOWED");
    }
  }
}

function getMediaAssetsByIds(db: Database, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  return db.query.profileMediaAsset.findMany({
    where: inArray(profileMediaAsset.id, ids),
  });
}

export async function buildProfileSummaries(db: Database, userIds: string[]) {
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
          sql`${user.banned} IS DISTINCT FROM true`
        ),
      }),
      getOrCreateProfileSystemConfig(db),
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
      profileEmblems: clampVisibleEmblems(
        emblemGroups.get(currentUser.id) ?? [],
        systemConfig.maxVisibleEmblems
      ),
      profileRoles: clampVisibleRoles(resolvedRoles),
    } satisfies ProfileSummary;
  });
}

export async function getPublicProfile(db: Database, userId: string) {
  const [summary] = await buildProfileSummaries(db, [userId]);

  if (!summary) {
    return null;
  }

  const [settings, currentUser, systemConfig] = await Promise.all([
    getOrCreateProfileSettings(db, userId),
    db.query.user.findFirst({
      columns: { createdAt: true },
      where: and(
        eq(user.id, userId),
        sql`${user.banned} IS DISTINCT FROM true`
      ),
    }),
    getOrCreateProfileSystemConfig(db),
  ]);

  if (!currentUser) {
    return null;
  }

  const bannerAsset = settings.bannerAssetId
    ? await db.query.profileMediaAsset.findFirst({
        where: eq(profileMediaAsset.id, settings.bannerAssetId),
      })
    : null;

  return {
    ...summary,
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
    createdAt: currentUser.createdAt,
    maxVisibleEmblems: systemConfig.maxVisibleEmblems,
  } satisfies PublicProfile;
}
