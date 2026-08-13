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

export function publishProfileShowcaseRequirement(
  db: Database,
  actorUserId: string,
  key: ProfileShowcaseTypeKey,
  requiredTier: PatronTier
) {
  return db.transaction(async (tx) => {
    const current = await tx.query.profileShowcaseType.findFirst({
      where: eq(profileShowcaseType.key, key),
    });
    if (!current) {
      throw new ProfileEntitlementAdminError("Showcase no registrado.");
    }
    const publishedConfigRevision = current.publishedConfigRevision + 1;
    await tx
      .update(profileShowcaseType)
      .set({ requiredTier, publishedConfigRevision })
      .where(eq(profileShowcaseType.key, key));
    await tx.insert(profileCatalogAudit).values({
      action: "publish-entitlement-requirement",
      actorUserId,
      after: { publishedConfigRevision, requiredTier },
      before: {
        publishedConfigRevision: current.publishedConfigRevision,
        requiredTier: current.requiredTier,
      },
      targetId: key,
      targetKind: "showcase-type",
    });
    return { key, publishedConfigRevision, requiredTier };
  });
}

export function publishProfileLayoutRequirement(
  db: Database,
  actorUserId: string,
  key: ProfileLayoutKey,
  requiredTier: PatronTier
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        catalogOrder: profileCatalogItemRevision.catalogOrder,
        createdByUserId: profileCatalogItemRevision.createdByUserId,
        description: profileCatalogItemRevision.description,
        eterisPrice: profileCatalogItemRevision.eterisPrice,
        isFree: profileCatalogItemRevision.isFree,
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
          eq(profileCatalogLayoutRevision.rendererKey, key)
        )
      )
      .limit(1);
    if (!current) {
      throw new ProfileEntitlementAdminError("Layout no registrado.");
    }
    const revisionId = generateId();
    const revision = current.revision + 1;
    const publishedAt = new Date();
    await tx.insert(profileCatalogItemRevision).values({
      catalogOrder: current.catalogOrder,
      createdByUserId: actorUserId,
      description: current.description,
      eterisPrice: current.eterisPrice,
      id: revisionId,
      isFree: requiredTier === "none",
      itemId: current.itemId,
      name: current.name,
      publishedAt,
      publishedByUserId: actorUserId,
      requiredTier,
      revision,
      state: "published",
    });
    await tx.insert(profileCatalogLayoutRevision).values({
      rendererKey: key,
      revisionId,
    });
    await tx
      .update(profileCatalogItem)
      .set({ currentPublishedRevisionId: revisionId })
      .where(eq(profileCatalogItem.id, current.itemId));
    await tx.insert(profileCatalogAudit).values({
      action: "publish-entitlement-requirement",
      actorUserId,
      after: { requiredTier, revision, revisionId },
      before: { revision: current.revision, revisionId: current.revisionId },
      targetId: current.itemId,
      targetKind: "layout",
    });
    return { itemId: current.itemId, publishedAt, requiredTier, revision };
  });
}
