import { and, asc, eq, exists, inArray, lte, not, or } from "@repo/db";
import {
  media,
  profileEmblemDefinition,
  profileMediaAsset,
  profileMediaDeletion,
  profileRoleDefinition,
  profileSettings,
  user,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { MANAGED_PROFILE_MEDIA_SLOTS } from "@repo/shared/profile";
import type { ProfileMediaSlot } from "@repo/shared/profile";
import type { RedisClientType } from "redis";

import type { Context } from "../context";
import { optimizeImageBuffer } from "../utils/images";
import {
  consumeProfileMediaUploadIntent,
  createProfileMediaUploadIntent,
  deleteProfileMediaUploadIntent,
  getProfileMediaUploadCooldownKey,
  PROFILE_MEDIA_UPLOAD_COOLDOWN_SECONDS,
  reserveProfileMediaUploadCooldown,
} from "../utils/profile-media-cooldown";
import {
  getObjectExtension,
  getProfileEntitlements,
  PROFILE_MEDIA_MAX_BYTES,
  validateProfileMediaUpload,
} from "./profile";
import type { ProfileMediaStorage } from "./profile-media-storage";

export const PROFILE_MEDIA_OWNER_SOURCE_MAX_BYTES = 40 * 1024 * 1024;
export const PROFILE_MEDIA_PERMANENT_PREFIX = "profiles/media";
export const PROFILE_MEDIA_TEMPORARY_PREFIX = "profiles/temp";
const CLEANUP_BATCH_SIZE = 2;
const MANAGED_MEDIA_GRACE_MS = 24 * 60 * 60 * 1000;

type ProfileMediaDb = Pick<
  Context["db"],
  "delete" | "insert" | "query" | "select" | "transaction" | "update"
>;
type ProfileMediaActor = {
  id: string;
  role?: string | null;
};
type UploadInput = {
  contentLength: number;
  contentType: string;
  slot: ProfileMediaSlot;
};
type FinalizeInput = UploadInput & {
  objectKey: string;
};
type FinalizeProfileMediaParams = {
  actor: ProfileMediaActor;
  cache: RedisClientType;
  db: ProfileMediaDb;
  input: FinalizeInput;
  onCleanupError?: (error: unknown, objectKey: string) => void;
  storage: ProfileMediaStorage;
};

export type ProfileMediaErrorCode =
  | "ANIMATION_NOT_ALLOWED"
  | "BANNER_NOT_ALLOWED"
  | "INVALID_INTENT"
  | "INVALID_MEDIA"
  | "INVALID_OBJECT_KEY"
  | "OUTPUT_TOO_LARGE"
  | "RATE_LIMITED"
  | "SOURCE_METADATA_MISMATCH"
  | "SOURCE_TOO_LARGE";

export class ProfileMediaError extends Error {
  readonly code: ProfileMediaErrorCode;
  readonly data?: { retryAfter?: number };

  constructor(
    code: ProfileMediaErrorCode,
    data?: { retryAfter?: number },
    options?: ErrorOptions
  ) {
    super(code, options);
    this.name = "ProfileMediaError";
    this.code = code;
    this.data = data;
  }
}

function getSourceLimit(actor: ProfileMediaActor) {
  return actor.role === "owner"
    ? PROFILE_MEDIA_OWNER_SOURCE_MAX_BYTES
    : PROFILE_MEDIA_MAX_BYTES;
}

function isManagedProfileMediaSlot(
  slot: ProfileMediaSlot
): slot is (typeof MANAGED_PROFILE_MEDIA_SLOTS)[number] {
  return MANAGED_PROFILE_MEDIA_SLOTS.includes(
    slot as (typeof MANAGED_PROFILE_MEDIA_SLOTS)[number]
  );
}

function getTemporaryPrefix(actor: ProfileMediaActor, slot: ProfileMediaSlot) {
  return `${PROFILE_MEDIA_TEMPORARY_PREFIX}/${slot}/${actor.id}/`;
}

function getTemporaryObjectKey(actor: ProfileMediaActor, input: UploadInput) {
  return `${getTemporaryPrefix(actor, input.slot)}${generateId()}.${getObjectExtension(input.contentType)}`;
}

function getPermanentObjectKey(
  actor: ProfileMediaActor,
  slot: ProfileMediaSlot
) {
  return `${PROFILE_MEDIA_PERMANENT_PREFIX}/${slot}/${actor.id}/${generateId()}.webp`;
}

function translateValidationError(error: unknown): ProfileMediaError | null {
  if (!(error instanceof Error)) {
    return new ProfileMediaError("INVALID_MEDIA");
  }
  if (error.message === "BANNER_UPLOAD_NOT_ALLOWED") {
    return new ProfileMediaError("BANNER_NOT_ALLOWED", undefined, {
      cause: error,
    });
  }
  if (
    error.message === "ANIMATED_AVATAR_NOT_ALLOWED" ||
    error.message === "ANIMATED_BANNER_NOT_ALLOWED"
  ) {
    return new ProfileMediaError("ANIMATION_NOT_ALLOWED", undefined, {
      cause: error,
    });
  }
  if (error.message === "FILE_TOO_LARGE") {
    return new ProfileMediaError("OUTPUT_TOO_LARGE", undefined, {
      cause: error,
    });
  }
  if (
    error.message === "Image source exceeds byte limit" ||
    error.message === "IMAGE_TOO_SMALL" ||
    error.message === "ANIMATION_TOO_LONG" ||
    error.message === "Invalid image data" ||
    error.message === "Invalid image dimensions" ||
    error.message === "Image frame dimensions exceed limit" ||
    error.message === "Image frame count exceeds limit" ||
    error.message === "Image decoded pixels exceed limit" ||
    error.message.includes("unsupported image format")
  ) {
    return new ProfileMediaError("INVALID_MEDIA", undefined, { cause: error });
  }
  return null;
}

async function bestEffortDelete(
  storage: ProfileMediaStorage,
  objectKey: string,
  onCleanupError?: (error: unknown, objectKey: string) => void
) {
  try {
    await storage.deleteObject(objectKey);
  } catch (error) {
    onCleanupError?.(error, objectKey);
  }
}

async function retireAssets(
  tx: Pick<ProfileMediaDb, "delete" | "insert" | "query">,
  assetIds: string[]
) {
  if (assetIds.length === 0) {
    return;
  }
  const assets = await tx.query.profileMediaAsset.findMany({
    columns: { id: true, objectKey: true },
    where: inArray(profileMediaAsset.id, [...new Set(assetIds)]),
  });
  if (assets.length === 0) {
    return;
  }

  const sharedObjects = await tx.query.media.findMany({
    columns: { objectKey: true },
    where: inArray(
      media.objectKey,
      assets.map(({ objectKey }) => objectKey)
    ),
  });
  const sharedObjectKeys = new Set(
    sharedObjects.map(({ objectKey }) => objectKey)
  );
  const deletions = assets
    .filter(({ objectKey }) => !sharedObjectKeys.has(objectKey))
    .map(({ objectKey }) => ({ objectKey }));
  if (deletions.length > 0) {
    await tx
      .insert(profileMediaDeletion)
      .values(deletions)
      .onConflictDoNothing();
  }
  await tx.delete(profileMediaAsset).where(
    inArray(
      profileMediaAsset.id,
      assets.map(({ id }) => id)
    )
  );
}

async function findUnreferencedAssetIds(
  tx: Pick<ProfileMediaDb, "query">,
  assetIds: string[]
) {
  const candidates = [...new Set(assetIds)];
  if (candidates.length === 0) {
    return [];
  }
  const [settings, roles, emblems] = await Promise.all([
    tx.query.profileSettings.findMany({
      columns: { bannerAssetId: true },
      where: inArray(profileSettings.bannerAssetId, candidates),
    }),
    tx.query.profileRoleDefinition.findMany({
      columns: { iconAssetId: true, overlayAssetId: true },
      where: (table, { or: orWhere }) =>
        orWhere(
          inArray(table.iconAssetId, candidates),
          inArray(table.overlayAssetId, candidates)
        ),
    }),
    tx.query.profileEmblemDefinition.findMany({
      columns: { iconAssetId: true },
      where: (table) => inArray(table.iconAssetId, candidates),
    }),
  ]);
  const referenced = new Set(
    [
      ...settings.map(({ bannerAssetId }) => bannerAssetId),
      ...roles.flatMap(({ iconAssetId, overlayAssetId }) => [
        iconAssetId,
        overlayAssetId,
      ]),
      ...emblems.map(({ iconAssetId }) => iconAssetId),
    ].filter((id): id is string => id !== null)
  );
  return candidates.filter((id) => !referenced.has(id));
}

export async function cleanupProfileMediaDeletions(params: {
  db: ProfileMediaDb;
  now?: Date;
  onCleanupError?: (error: unknown, objectKey: string) => void;
  storage: ProfileMediaStorage;
}) {
  const now = params.now ?? new Date();
  let rows: { objectKey: string; retryCount: number }[];
  try {
    rows = await params.db.query.profileMediaDeletion.findMany({
      columns: { objectKey: true, retryCount: true },
      limit: CLEANUP_BATCH_SIZE,
      orderBy: [
        asc(profileMediaDeletion.retryAfter),
        asc(profileMediaDeletion.createdAt),
      ],
      where: lte(profileMediaDeletion.retryAfter, now),
    });
  } catch (error) {
    params.onCleanupError?.(error, "profile-media-deletion-ledger");
    return;
  }

  // ponytail: opportunistic batch only; add a scheduled sweep if backlog or latency grows.
  for (const row of rows) {
    try {
      await params.storage.deleteObject(row.objectKey);
      await params.db
        .delete(profileMediaDeletion)
        .where(eq(profileMediaDeletion.objectKey, row.objectKey));
    } catch (error) {
      const retryCount = row.retryCount + 1;
      await params.db
        .update(profileMediaDeletion)
        .set({
          retryAfter: new Date(
            now.getTime() + Math.min(2 ** retryCount * 60_000, 86_400_000)
          ),
          retryCount,
        })
        .where(eq(profileMediaDeletion.objectKey, row.objectKey))
        .catch((updateError: unknown) =>
          params.onCleanupError?.(updateError, row.objectKey)
        );
      params.onCleanupError?.(error, row.objectKey);
    }
  }
}

async function cleanupUnassignedManagedProfileMedia(params: {
  db: ProfileMediaDb;
  now?: Date;
  onCleanupError?: (error: unknown, objectKey: string) => void;
}) {
  const now = params.now ?? new Date();
  const cutoff = new Date(now.getTime() - MANAGED_MEDIA_GRACE_MS);
  try {
    await params.db.transaction(async (tx) => {
      const staleAssets = await tx.query.profileMediaAsset.findMany({
        columns: { createdAt: true, id: true },
        limit: CLEANUP_BATCH_SIZE,
        orderBy: asc(profileMediaAsset.createdAt),
        where: and(
          inArray(profileMediaAsset.slot, [...MANAGED_PROFILE_MEDIA_SLOTS]),
          eq(profileMediaAsset.validationStatus, "ready"),
          lte(profileMediaAsset.createdAt, cutoff),
          not(
            exists(
              tx
                .select({ id: profileRoleDefinition.id })
                .from(profileRoleDefinition)
                .where(
                  or(
                    eq(profileRoleDefinition.iconAssetId, profileMediaAsset.id),
                    eq(
                      profileRoleDefinition.overlayAssetId,
                      profileMediaAsset.id
                    )
                  )
                )
            )
          ),
          not(
            exists(
              tx
                .select({ id: profileEmblemDefinition.id })
                .from(profileEmblemDefinition)
                .where(
                  eq(profileEmblemDefinition.iconAssetId, profileMediaAsset.id)
                )
            )
          )
        ),
      });
      await retireAssets(
        tx,
        staleAssets
          .filter(({ createdAt }) => createdAt <= cutoff)
          .map(({ id }) => id)
      );
    });
  } catch (error) {
    params.onCleanupError?.(error, "unassigned-profile-media");
  }
}

export async function issueProfileMediaUpload(params: {
  actor: ProfileMediaActor;
  cache: RedisClientType;
  db: ProfileMediaDb;
  input: UploadInput;
  onCleanupError?: (error: unknown, objectKey: string) => void;
  storage: ProfileMediaStorage;
}) {
  const { actor, cache, db, input, storage } = params;
  if (input.contentLength > getSourceLimit(actor)) {
    throw new ProfileMediaError("SOURCE_TOO_LARGE");
  }
  const entitlements = await getProfileEntitlements(db, actor.id, actor.role);
  if (input.slot === "banner" && !entitlements.canUseUploadedBanner) {
    throw new ProfileMediaError("BANNER_NOT_ALLOWED");
  }
  if (input.slot === "avatar" || input.slot === "banner") {
    const cooldown = await reserveProfileMediaUploadCooldown(
      cache,
      getProfileMediaUploadCooldownKey(actor.id, input.slot)
    );
    if (!cooldown.reserved) {
      throw new ProfileMediaError("RATE_LIMITED", {
        retryAfter: cooldown.retryAfter,
      });
    }
  }

  const objectKey = getTemporaryObjectKey(actor, input);
  const created = await createProfileMediaUploadIntent(cache, {
    ...input,
    issuedToUserId: actor.id,
    objectKey,
  });
  if (!created) {
    throw new Error("Could not reserve Profile Media upload intent");
  }

  try {
    const { presignedUrl } = await storage.issueUpload({
      ...input,
      expiresIn: PROFILE_MEDIA_UPLOAD_COOLDOWN_SECONDS,
      objectKey,
    });
    if (isManagedProfileMediaSlot(input.slot)) {
      await cleanupUnassignedManagedProfileMedia(params);
    }
    await cleanupProfileMediaDeletions(params);
    return { objectKey, presignedUrl };
  } catch (error) {
    await deleteProfileMediaUploadIntent(cache, objectKey).catch(
      (cleanupError: unknown) =>
        params.onCleanupError?.(cleanupError, objectKey)
    );
    throw error;
  }
}

export async function finalizeProfileMediaUpload(
  params: FinalizeProfileMediaParams
) {
  const { actor, cache, db, input, storage } = params;
  if (!input.objectKey.startsWith(getTemporaryPrefix(actor, input.slot))) {
    throw new ProfileMediaError("INVALID_OBJECT_KEY");
  }
  const intent = await consumeProfileMediaUploadIntent(cache, input.objectKey);
  if (!intent) {
    throw new ProfileMediaError("INVALID_INTENT");
  }
  if (
    intent.issuedToUserId !== actor.id ||
    intent.slot !== input.slot ||
    intent.objectKey !== input.objectKey ||
    intent.contentType !== input.contentType ||
    intent.contentLength !== input.contentLength
  ) {
    await bestEffortDelete(storage, input.objectKey, params.onCleanupError);
    throw new ProfileMediaError("INVALID_INTENT");
  }

  const source = await storage.readObject(input.objectKey);
  if (
    source.contentLength !== input.contentLength ||
    source.contentType !== input.contentType ||
    source.body.byteLength !== input.contentLength
  ) {
    await bestEffortDelete(storage, input.objectKey, params.onCleanupError);
    throw new ProfileMediaError("SOURCE_METADATA_MISMATCH");
  }

  const entitlements = await getProfileEntitlements(db, actor.id, actor.role);
  let optimized: Awaited<ReturnType<typeof optimizeImageBuffer>>;
  try {
    optimized = await optimizeImageBuffer(source.body, source.contentType, {
      maxSourceBytes: getSourceLimit(actor),
    });
    if (optimized.fileSizeBytes > PROFILE_MEDIA_MAX_BYTES) {
      throw new Error("FILE_TOO_LARGE");
    }
    validateProfileMediaUpload({
      contentType: optimized.mimeType,
      entitlements,
      slot: input.slot,
      validation: optimized,
    });
  } catch (error) {
    await bestEffortDelete(storage, input.objectKey, params.onCleanupError);
    throw translateValidationError(error) ?? error;
  }

  const objectKey = getPermanentObjectKey(actor, input.slot);
  await storage.putObject(objectKey, optimized.buffer, optimized.mimeType);

  let asset: typeof profileMediaAsset.$inferSelect | undefined;
  try {
    asset = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(profileMediaAsset)
        .values({
          durationMs: optimized.durationMs,
          fileSizeBytes: optimized.fileSizeBytes,
          height: optimized.height,
          isAnimated: optimized.isAnimated,
          mimeType: optimized.mimeType,
          objectKey,
          ownerUserId: actor.id,
          slot: input.slot,
          validationStatus: "ready",
          width: optimized.width,
        })
        .returning();
      if (!created) {
        throw new Error("Could not persist Profile Media");
      }

      if (input.slot === "avatar") {
        const [current] = await tx
          .select({ image: user.image })
          .from(user)
          .where(eq(user.id, actor.id))
          .for("update");
        await tx
          .update(user)
          .set({ image: objectKey })
          .where(eq(user.id, actor.id));
        if (current?.image) {
          const obsolete = await tx.query.profileMediaAsset.findFirst({
            columns: { id: true },
            where: eq(profileMediaAsset.objectKey, current.image),
          });
          await retireAssets(tx, obsolete ? [obsolete.id] : []);
        }
      } else if (input.slot === "banner") {
        await tx
          .insert(profileSettings)
          .values({ userId: actor.id })
          .onConflictDoNothing();
        const [current] = await tx
          .select({ bannerAssetId: profileSettings.bannerAssetId })
          .from(profileSettings)
          .where(eq(profileSettings.userId, actor.id))
          .for("update");
        await tx
          .update(profileSettings)
          .set({ bannerAssetId: created.id, bannerMode: "image" })
          .where(eq(profileSettings.userId, actor.id));
        await retireAssets(
          tx,
          current?.bannerAssetId ? [current.bannerAssetId] : []
        );
      }
      return created;
    });
  } catch (error) {
    await bestEffortDelete(storage, objectKey, params.onCleanupError);
    throw error;
  }

  await bestEffortDelete(storage, input.objectKey, params.onCleanupError);
  if (isManagedProfileMediaSlot(input.slot)) {
    await cleanupUnassignedManagedProfileMedia(params);
  }
  await cleanupProfileMediaDeletions(params);
  return asset;
}

export async function removeUserProfileMedia(params: {
  actor: ProfileMediaActor;
  avatarFallbackColor?: string;
  bannerColor?: string;
  db: ProfileMediaDb;
  onCleanupError?: (error: unknown, objectKey: string) => void;
  slot: "avatar" | "banner";
  storage: ProfileMediaStorage;
}) {
  await params.db.transaction(async (tx) => {
    if (params.slot === "avatar") {
      const [current] = await tx
        .select({ image: user.image })
        .from(user)
        .where(eq(user.id, params.actor.id))
        .for("update");
      await tx
        .update(user)
        .set({ image: null })
        .where(eq(user.id, params.actor.id));
      const asset = current?.image
        ? await tx.query.profileMediaAsset.findFirst({
            columns: { id: true },
            where: and(
              eq(profileMediaAsset.objectKey, current.image),
              eq(profileMediaAsset.ownerUserId, params.actor.id)
            ),
          })
        : null;
      await retireAssets(tx, asset ? [asset.id] : []);
    } else {
      await tx
        .insert(profileSettings)
        .values({ userId: params.actor.id })
        .onConflictDoNothing();
      const [current] = await tx
        .select({ bannerAssetId: profileSettings.bannerAssetId })
        .from(profileSettings)
        .where(eq(profileSettings.userId, params.actor.id))
        .for("update");
      await tx
        .update(profileSettings)
        .set({
          bannerAssetId: null,
          bannerColor: params.bannerColor,
          bannerMode: "color",
        })
        .where(eq(profileSettings.userId, params.actor.id));
      if (params.avatarFallbackColor) {
        await tx
          .update(user)
          .set({ avatarFallbackColor: params.avatarFallbackColor })
          .where(eq(user.id, params.actor.id));
      }
      await retireAssets(
        tx,
        current?.bannerAssetId ? [current.bannerAssetId] : []
      );
    }
  });
  await cleanupProfileMediaDeletions(params);
}

export async function changeManagedProfileMedia<T>(params: {
  db: ProfileMediaDb;
  mutate: (
    tx: Parameters<Parameters<ProfileMediaDb["transaction"]>[0]>[0]
  ) => Promise<{ retiredAssetIds: string[]; value: T }>;
  now?: Date;
  onCleanupError?: (error: unknown, objectKey: string) => void;
  storage: ProfileMediaStorage;
}) {
  const value = await params.db.transaction(async (tx) => {
    const change = await params.mutate(tx);
    const obsolete = await findUnreferencedAssetIds(tx, change.retiredAssetIds);
    await retireAssets(tx, obsolete);
    return change.value;
  });
  await cleanupUnassignedManagedProfileMedia(params);
  await cleanupProfileMediaDeletions(params);
  return value;
}
