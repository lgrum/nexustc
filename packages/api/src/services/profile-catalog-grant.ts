import { and, eq, sql } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  profileCatalogAudit,
  profileCatalogItem,
  profileCatalogOwnership,
  user,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";

type Database = typeof database;

type GrantInput = {
  actorUserId: string;
  itemId: string;
  reason: string;
  sourceReference: string;
  userId: string;
};

type RevokeInput = {
  actorUserId: string;
  grantId: string;
  reason: string;
};

type ProfileCatalogGrantErrorCode =
  | "ACTIVE_GRANT_EXISTS"
  | "GRANT_NOT_FOUND"
  | "ITEM_UNAVAILABLE"
  | "SOURCE_REFERENCE_CONFLICT"
  | "USER_NOT_FOUND";

export class ProfileCatalogGrantError extends Error {
  readonly code: ProfileCatalogGrantErrorCode;

  constructor(code: ProfileCatalogGrantErrorCode, message: string) {
    super(message);
    this.name = "ProfileCatalogGrantError";
    this.code = code;
  }
}

function grantSnapshot(input: {
  grantedAt: Date;
  grantedByUserId: string | null;
  grantId: string;
  grantReason: string | null;
  itemId: string;
  revokedAt?: Date | null;
  revokedByUserId?: string | null;
  revokeReason?: string | null;
  sourceReference: string;
  userId: string;
}) {
  return {
    grantedAt: input.grantedAt.toISOString(),
    grantedByUserId: input.grantedByUserId,
    grantId: input.grantId,
    itemId: input.itemId,
    reason: input.grantReason,
    revokedAt: input.revokedAt?.toISOString() ?? null,
    revokedByUserId: input.revokedByUserId ?? null,
    revokeReason: input.revokeReason ?? null,
    sourceReference: input.sourceReference,
    sourceType: "grant",
    userId: input.userId,
  };
}

export function grantProfileCatalogItem(db: Database, input: GrantInput) {
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select({
        currentPublishedRevisionId:
          profileCatalogItem.currentPublishedRevisionId,
        id: profileCatalogItem.id,
        lifecycle: profileCatalogItem.lifecycle,
        stableKey: profileCatalogItem.stableKey,
      })
      .from(profileCatalogItem)
      .where(eq(profileCatalogItem.id, input.itemId))
      .for("update");
    const sourceGrant = await tx.query.profileCatalogOwnership.findFirst({
      where: eq(profileCatalogOwnership.sourceReference, input.sourceReference),
    });
    if (sourceGrant) {
      if (
        sourceGrant.sourceType === "grant" &&
        sourceGrant.userId === input.userId &&
        sourceGrant.catalogItemId === input.itemId &&
        sourceGrant.revokedAt === null
      ) {
        return {
          effectivePermanentEntitlement: true,
          grantId: sourceGrant.id,
          itemId: input.itemId,
          replayed: true,
          userId: input.userId,
        };
      }
      throw new ProfileCatalogGrantError(
        "SOURCE_REFERENCE_CONFLICT",
        "La referencia de origen ya pertenece a otra concesión."
      );
    }

    if (
      !item ||
      item.lifecycle !== "active" ||
      !item.currentPublishedRevisionId
    ) {
      throw new ProfileCatalogGrantError(
        "ITEM_UNAVAILABLE",
        "El elemento no está disponible para nuevas concesiones."
      );
    }

    const target = await tx.query.user.findFirst({
      columns: { id: true },
      where: eq(user.id, input.userId),
    });
    if (!target) {
      throw new ProfileCatalogGrantError(
        "USER_NOT_FOUND",
        "La cuenta de destino no existe."
      );
    }

    const activeGrant = await tx.query.profileCatalogOwnership.findFirst({
      columns: { id: true },
      where: and(
        eq(profileCatalogOwnership.userId, input.userId),
        eq(profileCatalogOwnership.catalogItemId, input.itemId),
        eq(profileCatalogOwnership.sourceType, "grant"),
        sql`${profileCatalogOwnership.revokedAt} IS NULL`
      ),
    });
    if (activeGrant) {
      throw new ProfileCatalogGrantError(
        "ACTIVE_GRANT_EXISTS",
        "La cuenta ya tiene una concesión activa para este elemento."
      );
    }

    const grantedAt = new Date();
    const grantId = generateId();
    const snapshot = grantSnapshot({
      grantedAt,
      grantedByUserId: input.actorUserId,
      grantId,
      grantReason: input.reason,
      itemId: input.itemId,
      sourceReference: input.sourceReference,
      userId: input.userId,
    });
    await tx.insert(profileCatalogOwnership).values({
      catalogItemId: input.itemId,
      grantedAt,
      grantedByUserId: input.actorUserId,
      grantReason: input.reason,
      id: grantId,
      sourceReference: input.sourceReference,
      sourceType: "grant",
      userId: input.userId,
    });
    await tx.insert(profileCatalogAudit).values({
      action: "grant-permanent-access",
      actorUserId: input.actorUserId,
      after: snapshot,
      before: null,
      note: input.reason,
      targetId: grantId,
      targetKind: "profile-catalog-ownership",
    });

    return {
      effectivePermanentEntitlement: true,
      grantId,
      itemId: input.itemId,
      replayed: false,
      userId: input.userId,
    };
  });
}

export function revokeProfileCatalogGrant(db: Database, input: RevokeInput) {
  return db.transaction(async (tx) => {
    const revokedAt = new Date();
    const [grant] = await tx
      .update(profileCatalogOwnership)
      .set({
        revokedAt,
        revokedByUserId: input.actorUserId,
        revokeReason: input.reason,
      })
      .where(
        and(
          eq(profileCatalogOwnership.id, input.grantId),
          eq(profileCatalogOwnership.sourceType, "grant"),
          sql`${profileCatalogOwnership.revokedAt} IS NULL`
        )
      )
      .returning({
        catalogItemId: profileCatalogOwnership.catalogItemId,
        grantedAt: profileCatalogOwnership.grantedAt,
        grantedByUserId: profileCatalogOwnership.grantedByUserId,
        grantReason: profileCatalogOwnership.grantReason,
        id: profileCatalogOwnership.id,
        sourceReference: profileCatalogOwnership.sourceReference,
        userId: profileCatalogOwnership.userId,
      });
    if (!grant) {
      throw new ProfileCatalogGrantError(
        "GRANT_NOT_FOUND",
        "La concesión activa no existe."
      );
    }

    const before = grantSnapshot({
      grantedAt: grant.grantedAt,
      grantedByUserId: grant.grantedByUserId,
      grantId: grant.id,
      grantReason: grant.grantReason,
      itemId: grant.catalogItemId,
      sourceReference: grant.sourceReference,
      userId: grant.userId,
    });
    const after = {
      ...before,
      revokedAt: revokedAt.toISOString(),
      revokedByUserId: input.actorUserId,
      revokeReason: input.reason,
    };
    await tx.insert(profileCatalogAudit).values({
      action: "revoke-permanent-access",
      actorUserId: input.actorUserId,
      after,
      before,
      note: input.reason,
      targetId: grant.id,
      targetKind: "profile-catalog-ownership",
    });

    const remainingOwnership = await tx.query.profileCatalogOwnership.findFirst(
      {
        columns: { id: true },
        where: and(
          eq(profileCatalogOwnership.userId, grant.userId),
          eq(profileCatalogOwnership.catalogItemId, grant.catalogItemId),
          sql`${profileCatalogOwnership.revokedAt} IS NULL`
        ),
      }
    );

    return {
      effectivePermanentEntitlement: Boolean(remainingOwnership),
      grantId: grant.id,
      itemId: grant.catalogItemId,
      userId: grant.userId,
    };
  });
}
