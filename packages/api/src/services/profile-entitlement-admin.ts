import { and, eq } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  profileCatalogAudit,
  profileCatalogItem,
  profileCatalogItemRevision,
  profileCatalogLayoutRevision,
  profileShowcaseType,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import type { PatronTier } from "@repo/shared/constants";
import type {
  ProfileLayoutKey,
  ProfileShowcaseTypeKey,
} from "@repo/shared/profile-customization";

type Database = typeof database;

export class ProfileEntitlementAdminError extends Error {
  override readonly name = "ProfileEntitlementAdminError";
}

type PublishShowcaseRequirementInput = {
  actorUserId: string;
  expectedRevision: number;
  key: ProfileShowcaseTypeKey;
  reason: string;
  requiredTier: PatronTier;
};

export function publishProfileShowcaseRequirement(
  db: Database,
  input: PublishShowcaseRequirementInput
) {
  return db.transaction(async (tx) => {
    const current = await tx.query.profileShowcaseType.findFirst({
      where: eq(profileShowcaseType.key, input.key),
    });
    if (!current) {
      throw new ProfileEntitlementAdminError("Showcase no registrado.");
    }
    if (current.publishedConfigRevision !== input.expectedRevision) {
      throw new ProfileEntitlementAdminError(
        "El requisito cambió en otra sesión. Recarga antes de publicar."
      );
    }
    const publishedConfigRevision = current.publishedConfigRevision + 1;
    const updated = await tx
      .update(profileShowcaseType)
      .set({
        publishedConfigRevision,
        requiredTier: input.requiredTier,
      })
      .where(
        and(
          eq(profileShowcaseType.key, input.key),
          eq(
            profileShowcaseType.publishedConfigRevision,
            input.expectedRevision
          )
        )
      )
      .returning({ key: profileShowcaseType.key });
    if (updated.length !== 1) {
      throw new ProfileEntitlementAdminError(
        "El requisito cambió en otra sesión. Recarga antes de publicar."
      );
    }
    await tx.insert(profileCatalogAudit).values({
      action: "publish-entitlement-requirement",
      actorUserId: input.actorUserId,
      after: {
        publishedConfigRevision,
        requiredTier: input.requiredTier,
      },
      before: {
        publishedConfigRevision: current.publishedConfigRevision,
        requiredTier: current.requiredTier,
      },
      note: input.reason,
      targetId: input.key,
      targetKind: "showcase-type",
    });
    return {
      key: input.key,
      publishedConfigRevision,
      requiredTier: input.requiredTier,
    };
  });
}

type PublishLayoutRequirementInput = {
  actorUserId: string;
  expectedRevision: number;
  key: ProfileLayoutKey;
  reason: string;
  requiredTier: PatronTier;
};

export function publishProfileLayoutRequirement(
  db: Database,
  input: PublishLayoutRequirementInput
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        catalogOrder: profileCatalogItemRevision.catalogOrder,
        createdByUserId: profileCatalogItemRevision.createdByUserId,
        description: profileCatalogItemRevision.description,
        eterisPrice: profileCatalogItemRevision.eterisPrice,
        isFree: profileCatalogItemRevision.isFree,
        isProtectedDefault: profileCatalogItem.isProtectedDefault,
        itemId: profileCatalogItem.id,
        name: profileCatalogItemRevision.name,
        revision: profileCatalogItemRevision.revision,
        revisionId: profileCatalogItemRevision.id,
      })
      .from(profileCatalogItem)
      .innerJoin(
        profileCatalogItemRevision,
        eq(
          profileCatalogItem.currentPublishedRevisionId,
          profileCatalogItemRevision.id
        )
      )
      .innerJoin(
        profileCatalogLayoutRevision,
        eq(
          profileCatalogLayoutRevision.revisionId,
          profileCatalogItemRevision.id
        )
      )
      .where(
        and(
          eq(profileCatalogItem.kind, "layout"),
          eq(profileCatalogLayoutRevision.rendererKey, input.key)
        )
      )
      .limit(1)
      .for("update");
    if (!current) {
      throw new ProfileEntitlementAdminError("Layout no registrado.");
    }
    if (current.revision !== input.expectedRevision) {
      throw new ProfileEntitlementAdminError(
        "El Layout cambió en otra sesión. Recarga antes de publicar."
      );
    }
    if (current.isProtectedDefault && input.requiredTier !== "none") {
      throw new ProfileEntitlementAdminError(
        "El Layout predeterminado siempre debe permanecer activo y gratuito."
      );
    }
    const revisionId = generateId();
    const revision = current.revision + 1;
    const publishedAt = new Date();
    await tx.insert(profileCatalogItemRevision).values({
      catalogOrder: current.catalogOrder,
      createdByUserId: input.actorUserId,
      description: current.description,
      eterisPrice: current.eterisPrice,
      id: revisionId,
      isFree: input.requiredTier === "none",
      itemId: current.itemId,
      name: current.name,
      publishedAt,
      publishedByUserId: input.actorUserId,
      requiredTier: input.requiredTier,
      revision,
      state: "published",
    });
    await tx.insert(profileCatalogLayoutRevision).values({
      rendererKey: input.key,
      revisionId,
    });
    const updated = await tx
      .update(profileCatalogItem)
      .set({ currentPublishedRevisionId: revisionId })
      .where(
        and(
          eq(profileCatalogItem.id, current.itemId),
          eq(profileCatalogItem.currentPublishedRevisionId, current.revisionId)
        )
      )
      .returning({ id: profileCatalogItem.id });
    if (updated.length !== 1) {
      throw new ProfileEntitlementAdminError(
        "El Layout cambió en otra sesión. Recarga antes de publicar."
      );
    }
    await tx.insert(profileCatalogAudit).values({
      action: "publish-entitlement-requirement",
      actorUserId: input.actorUserId,
      after: { requiredTier: input.requiredTier, revision, revisionId },
      before: { revision: current.revision, revisionId: current.revisionId },
      note: input.reason,
      targetId: current.itemId,
      targetKind: "layout",
    });
    return {
      itemId: current.itemId,
      publishedAt,
      requiredTier: input.requiredTier,
      revision,
    };
  });
}
