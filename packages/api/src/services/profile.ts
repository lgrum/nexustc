import { GetObjectCommand } from "@aws-sdk/client-s3";
import { type db as database, eq, inArray } from "@repo/db";
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
import { PATRON_TIERS, type PatronTier } from "@repo/shared/constants";
import {
  PROFILE_DEFAULTS,
  type ProfileCrop,
  type ProfileMediaSlot,
} from "@repo/shared/profile";
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
  visualConfig: {
    glowColor: string | null;
    backgroundColor: string | null;
  };
  icon: { objectKey: string; isAnimated: boolean } | null;
};

export type ProfileSummary = {
  id: string;
  name: string;
  image: string | null;
  avatar: {
    objectKey: string;
    crop: ProfileCrop | null;
    isAnimated: boolean;
    mimeType: string;
  } | null;
  avatarFallbackColor: string;
  href: string;
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
      crop: ProfileCrop | null;
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
};

const STAFF_OVERRIDE_ROLES = new Set(["owner", "admin", "moderator"]);

const PROFILE_ENTITLEMENT_RULES = {
  animatedAvatarRequiredTier: "level3",
  uploadedBannerRequiredTier: "level5",
  animatedBannerRequiredTier: "level8",
} as const satisfies Record<string, PatronTier>;

const SLOT_LIMITS = {
  avatar: {
    staticBytes: 1024 * 512,
    animatedBytes: 1024 * 1024 * 1.5,
    maxDurationMs: 6000,
    minWidth: 128,
    minHeight: 128,
  },
  banner: {
    staticBytes: 1024 * 1024 * 1.5,
    animatedBytes: 1024 * 1024 * 3,
    maxDurationMs: 8000,
    minWidth: 640,
    minHeight: 160,
  },
  "role-icon": {
    staticBytes: 1024 * 512,
    animatedBytes: 1024 * 1024,
    maxDurationMs: 6000,
    minWidth: 32,
    minHeight: 32,
  },
  "role-overlay": {
    staticBytes: 1024 * 512,
    animatedBytes: 1024 * 1024,
    maxDurationMs: 6000,
    minWidth: 32,
    minHeight: 32,
  },
  "emblem-icon": {
    staticBytes: 1024 * 512,
    animatedBytes: 1024 * 1024,
    maxDurationMs: 6000,
    minWidth: 32,
    minHeight: 32,
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
  const sorted = [...roles].sort((a, b) => b.priority - a.priority);
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
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxVisibleEmblems);
}

function getEffectiveTierLevel(tier: PatronTier) {
  return PATRON_TIERS[tier].level;
}

export async function getUserPatronTier(db: Database, userId: string) {
  const patronRecord = await db.query.patron.findFirst({
    where: eq(patron.userId, userId),
    columns: { tier: true, isActivePatron: true },
  });

  if (!patronRecord?.isActivePatron) {
    return "none" as PatronTier;
  }

  return patronRecord.tier;
}

export async function getProfileEntitlements(
  db: Database,
  userId: string,
  role?: string | null
): Promise<ProfileEntitlements> {
  if (role && STAFF_OVERRIDE_ROLES.has(role)) {
    return {
      canUseAnimatedAvatar: true,
      canUseUploadedBanner: true,
      canUseAnimatedBanner: true,
      animatedAvatarRequiredTier:
        PROFILE_ENTITLEMENT_RULES.animatedAvatarRequiredTier,
      uploadedBannerRequiredTier:
        PROFILE_ENTITLEMENT_RULES.uploadedBannerRequiredTier,
      animatedBannerRequiredTier:
        PROFILE_ENTITLEMENT_RULES.animatedBannerRequiredTier,
      overrideSource: "staff",
    };
  }

  const tier = await getUserPatronTier(db, userId);
  const tierLevel = getEffectiveTierLevel(tier);

  return {
    canUseAnimatedAvatar:
      tierLevel >=
      getEffectiveTierLevel(
        PROFILE_ENTITLEMENT_RULES.animatedAvatarRequiredTier
      ),
    canUseUploadedBanner:
      tierLevel >=
      getEffectiveTierLevel(
        PROFILE_ENTITLEMENT_RULES.uploadedBannerRequiredTier
      ),
    canUseAnimatedBanner:
      tierLevel >=
      getEffectiveTierLevel(
        PROFILE_ENTITLEMENT_RULES.animatedBannerRequiredTier
      ),
    animatedAvatarRequiredTier:
      PROFILE_ENTITLEMENT_RULES.animatedAvatarRequiredTier,
    uploadedBannerRequiredTier:
      PROFILE_ENTITLEMENT_RULES.uploadedBannerRequiredTier,
    animatedBannerRequiredTier:
      PROFILE_ENTITLEMENT_RULES.animatedBannerRequiredTier,
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
      userId,
      bannerColor: PROFILE_DEFAULTS.bannerColor,
      bannerMode: "color",
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
    width,
    height,
    isAnimated,
    durationMs,
  } satisfies ProfileMediaValidation;
}

export function validateProfileMediaUpload({
  slot,
  contentType,
  fileSizeBytes,
  validation,
  entitlements,
}: {
  slot: ProfileMediaSlot;
  contentType: string;
  fileSizeBytes: number;
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

  if (fileSizeBytes > maxBytes) {
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
  const [users, systemConfig, settings, roleRows, emblemRows] =
    await Promise.all([
      db.query.user.findMany({
        where: inArray(user.id, uniqueUserIds),
        columns: {
          id: true,
          name: true,
          image: true,
          role: true,
          avatarFallbackColor: true,
        },
      }),
      getOrCreateProfileSystemConfig(db),
      db.query.profileSettings.findMany({
        where: inArray(profileSettings.userId, uniqueUserIds),
        columns: {
          userId: true,
          bannerAssetId: true,
          bannerColor: true,
          bannerMode: true,
        },
      }),
      db
        .select({
          userId: profileRoleAssignment.userId,
          assignmentVisible: profileRoleAssignment.isVisible,
          startsAt: profileRoleAssignment.startsAt,
          endsAt: profileRoleAssignment.endsAt,
          id: profileRoleDefinition.id,
          slug: profileRoleDefinition.slug,
          name: profileRoleDefinition.name,
          description: profileRoleDefinition.description,
          priority: profileRoleDefinition.priority,
          isExclusive: profileRoleDefinition.isExclusive,
          isVisible: profileRoleDefinition.isVisible,
          isActive: profileRoleDefinition.isActive,
          visualConfig: profileRoleDefinition.visualConfig,
          iconAssetId: profileRoleDefinition.iconAssetId,
          overlayAssetId: profileRoleDefinition.overlayAssetId,
        })
        .from(profileRoleAssignment)
        .innerJoin(
          profileRoleDefinition,
          eq(profileRoleDefinition.id, profileRoleAssignment.roleDefinitionId)
        )
        .where(inArray(profileRoleAssignment.userId, uniqueUserIds)),
      db
        .select({
          userId: profileEmblemAssignment.userId,
          assignmentVisible: profileEmblemAssignment.isVisible,
          startsAt: profileEmblemAssignment.startsAt,
          endsAt: profileEmblemAssignment.endsAt,
          id: profileEmblemDefinition.id,
          slug: profileEmblemDefinition.slug,
          name: profileEmblemDefinition.name,
          tooltip: profileEmblemDefinition.tooltip,
          priority: profileEmblemDefinition.priority,
          isVisible: profileEmblemDefinition.isVisible,
          isActive: profileEmblemDefinition.isActive,
          visualConfig: profileEmblemDefinition.visualConfig,
          iconAssetId: profileEmblemDefinition.iconAssetId,
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
        .filter((value): value is string => Boolean(value))
    ),
  ];

  const avatarObjectKeys = users
    .map((currentUser) => currentUser.image)
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
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      priority: row.priority,
      isExclusive: row.isExclusive,
      visualConfig: row.visualConfig,
      icon: iconAsset
        ? { objectKey: iconAsset.objectKey, isAnimated: iconAsset.isAnimated }
        : null,
      overlay: overlayAsset
        ? {
            objectKey: overlayAsset.objectKey,
            isAnimated: overlayAsset.isAnimated,
          }
        : null,
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
      id: row.id,
      slug: row.slug,
      name: row.name,
      tooltip: row.tooltip,
      priority: row.priority,
      visualConfig: row.visualConfig,
      icon: iconAsset
        ? { objectKey: iconAsset.objectKey, isAnimated: iconAsset.isAnimated }
        : null,
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
                id: fallbackRole.id,
                slug: fallbackRole.slug,
                name: fallbackRole.name,
                description: fallbackRole.description,
                priority: fallbackRole.priority,
                isExclusive: fallbackRole.isExclusive,
                visualConfig: fallbackRole.visualConfig,
                icon: fallbackRole.iconAssetId
                  ? (() => {
                      const asset = mediaAssetMap.get(fallbackRole.iconAssetId);
                      return asset
                        ? {
                            objectKey: asset.objectKey,
                            isAnimated: asset.isAnimated,
                          }
                        : null;
                    })()
                  : null,
                overlay: fallbackRole.overlayAssetId
                  ? (() => {
                      const asset = mediaAssetMap.get(
                        fallbackRole.overlayAssetId
                      );
                      return asset
                        ? {
                            objectKey: asset.objectKey,
                            isAnimated: asset.isAnimated,
                          }
                        : null;
                    })()
                  : null,
              },
            ]
          : [];

    return {
      id: currentUser.id,
      name: currentUser.name,
      image: currentUser.image,
      avatar: currentUser.image
        ? (() => {
            const asset = avatarAssetMap.get(currentUser.image);
            return asset
              ? {
                  objectKey: asset.objectKey,
                  crop: asset.crop,
                  isAnimated: asset.isAnimated,
                  mimeType: asset.mimeType,
                }
              : {
                  objectKey: currentUser.image,
                  crop: null,
                  isAnimated: false,
                  mimeType: "image/webp",
                };
          })()
        : null,
      avatarFallbackColor:
        currentUser.avatarFallbackColor ?? PROFILE_DEFAULTS.avatarFallbackColor,
      href: `/user/${currentUser.id}`,
      profileRoles: clampVisibleRoles(resolvedRoles),
      profileEmblems: clampVisibleEmblems(
        emblemGroups.get(currentUser.id) ?? [],
        systemConfig.maxVisibleEmblems
      ),
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
      where: eq(user.id, userId),
      columns: { createdAt: true },
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
    createdAt: currentUser.createdAt,
    banner: {
      mode: settings.bannerMode,
      color: settings.bannerColor,
      asset: bannerAsset
        ? {
            objectKey: bannerAsset.objectKey,
            crop: bannerAsset.crop,
            isAnimated: bannerAsset.isAnimated,
            mimeType: bannerAsset.mimeType,
          }
        : null,
    },
    maxVisibleEmblems: systemConfig.maxVisibleEmblems,
  } satisfies PublicProfile;
}
