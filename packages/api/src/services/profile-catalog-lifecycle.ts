import { and, desc, eq } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  profileCatalogAudit,
  profileCatalogDecorationRevision,
  profileCatalogItem,
  profileCatalogItemRevision,
  profileCatalogLayoutRevision,
  profileCatalogOwnership,
  profileCatalogSkinRevision,
  profileEquippedDecoration,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";

type Database = typeof database;
type CatalogLifecycle = "active" | "archived" | "disabled" | "draft";
type LifecycleAction = "archive" | "disable" | "restore";

type CatalogItemState = {
  currentPublishedRevisionId: string | null;
  isProtectedDefault: boolean;
  lifecycle: CatalogLifecycle;
};

export class ProfileCatalogLifecycleError extends Error {
  readonly code: "INVALID_TRANSITION" | "NOT_FOUND" | "PROTECTED_DEFAULT";

  constructor(code: ProfileCatalogLifecycleError["code"], message: string) {
    super(message);
    this.name = "ProfileCatalogLifecycleError";
    this.code = code;
  }
}

function requireReason(reason: string) {
  const normalized = reason.trim();
  if (normalized.length < 3) {
    throw new ProfileCatalogLifecycleError(
      "INVALID_TRANSITION",
      "Indica un motivo de al menos 3 caracteres."
    );
  }
  return normalized;
}

export function resolveCatalogLifecycleChange(
  item: CatalogItemState,
  action: LifecycleAction
): Pick<CatalogItemState, "currentPublishedRevisionId" | "lifecycle"> {
  if (item.isProtectedDefault && action !== "restore") {
    throw new ProfileCatalogLifecycleError(
      "PROTECTED_DEFAULT",
      "Los elementos predeterminados protegidos no pueden retirarse."
    );
  }
  if (action === "archive" && item.lifecycle !== "active") {
    throw new ProfileCatalogLifecycleError(
      "INVALID_TRANSITION",
      "Solo un elemento publicado y activo puede archivarse."
    );
  }
  if (
    action === "disable" &&
    !(["active", "archived"] as CatalogLifecycle[]).includes(item.lifecycle)
  ) {
    throw new ProfileCatalogLifecycleError(
      "INVALID_TRANSITION",
      "Solo un elemento publicado puede deshabilitarse globalmente."
    );
  }
  if (
    action === "restore" &&
    !(["archived", "disabled"] as CatalogLifecycle[]).includes(item.lifecycle)
  ) {
    throw new ProfileCatalogLifecycleError(
      "INVALID_TRANSITION",
      "Solo un elemento retirado puede restaurarse."
    );
  }
  return {
    currentPublishedRevisionId: item.currentPublishedRevisionId,
    lifecycle:
      action === "archive"
        ? "archived"
        : action === "disable"
          ? "disabled"
          : "active",
  };
}

export function changeProfileCatalogLifecycle(
  db: Database,
  actorUserId: string,
  itemId: string,
  action: LifecycleAction,
  reason: string
) {
  const note = requireReason(reason);
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(profileCatalogItem)
      .where(eq(profileCatalogItem.id, itemId))
      .for("update");
    if (!item) {
      throw new ProfileCatalogLifecycleError(
        "NOT_FOUND",
        "El elemento no existe."
      );
    }
    const next = resolveCatalogLifecycleChange(item, action);
    await tx
      .update(profileCatalogItem)
      .set({ lifecycle: next.lifecycle })
      .where(eq(profileCatalogItem.id, itemId));
    await tx.insert(profileCatalogAudit).values({
      action,
      actorUserId,
      after: next,
      before: {
        currentPublishedRevisionId: item.currentPublishedRevisionId,
        lifecycle: item.lifecycle,
      },
      note,
      targetId: itemId,
      targetKind: item.kind,
    });
    return { itemId, lifecycle: next.lifecycle };
  });
}

export function rollbackProfileCatalogRevision(
  db: Database,
  actorUserId: string,
  itemId: string,
  sourceRevisionId: string,
  reason: string
) {
  const note = requireReason(reason);
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(profileCatalogItem)
      .where(eq(profileCatalogItem.id, itemId))
      .for("update");
    const source = await tx.query.profileCatalogItemRevision.findFirst({
      where: and(
        eq(profileCatalogItemRevision.id, sourceRevisionId),
        eq(profileCatalogItemRevision.itemId, itemId),
        eq(profileCatalogItemRevision.state, "published")
      ),
    });
    if (!(item && source)) {
      throw new ProfileCatalogLifecycleError(
        "NOT_FOUND",
        "La revisión publicada no existe."
      );
    }
    const pendingDraft = await tx.query.profileCatalogItemRevision.findFirst({
      columns: { id: true },
      where: and(
        eq(profileCatalogItemRevision.itemId, itemId),
        eq(profileCatalogItemRevision.state, "draft")
      ),
    });
    if (pendingDraft) {
      throw new ProfileCatalogLifecycleError(
        "INVALID_TRANSITION",
        "Publica o elimina el borrador pendiente antes de recuperar una revisión."
      );
    }
    const latest = await tx.query.profileCatalogItemRevision.findFirst({
      orderBy: desc(profileCatalogItemRevision.revision),
      where: eq(profileCatalogItemRevision.itemId, itemId),
    });
    const revisionId = generateId();
    const revision = (latest?.revision ?? 0) + 1;
    const publishedAt = new Date();
    await tx.insert(profileCatalogItemRevision).values({
      catalogOrder: source.catalogOrder,
      createdByUserId: actorUserId,
      description: source.description,
      eterisPrice: source.eterisPrice,
      id: revisionId,
      isFree: source.isFree,
      itemId,
      name: source.name,
      publishedAt,
      publishedByUserId: actorUserId,
      requiredTier: source.requiredTier,
      revision,
      state: "published",
    });
    if (item.kind === "layout") {
      const detail = await tx.query.profileCatalogLayoutRevision.findFirst({
        where: eq(profileCatalogLayoutRevision.revisionId, sourceRevisionId),
      });
      if (!detail) {
        throwMissingRevision();
      }
      await tx.insert(profileCatalogLayoutRevision).values({
        rendererKey: detail.rendererKey,
        revisionId,
      });
    } else if (item.kind === "skin") {
      const detail = await tx.query.profileCatalogSkinRevision.findFirst({
        where: eq(profileCatalogSkinRevision.revisionId, sourceRevisionId),
      });
      if (!detail) {
        throwMissingRevision();
      }
      await tx
        .insert(profileCatalogSkinRevision)
        .values({ ...detail, revisionId });
    } else {
      const detail = await tx.query.profileCatalogDecorationRevision.findFirst({
        where: eq(
          profileCatalogDecorationRevision.revisionId,
          sourceRevisionId
        ),
      });
      if (!detail) {
        throwMissingRevision();
      }
      await tx
        .insert(profileCatalogDecorationRevision)
        .values({ ...detail, revisionId });
    }
    await tx
      .update(profileCatalogItem)
      .set({ currentPublishedRevisionId: revisionId, lifecycle: "active" })
      .where(eq(profileCatalogItem.id, itemId));
    await tx.insert(profileCatalogAudit).values({
      action: "rollback",
      actorUserId,
      after: {
        currentPublishedRevisionId: revisionId,
        lifecycle: "active",
        revision,
      },
      before: {
        currentPublishedRevisionId: item.currentPublishedRevisionId,
        lifecycle: item.lifecycle,
        sourceRevisionId,
      },
      note,
      targetId: itemId,
      targetKind: item.kind,
    });
    return { itemId, publishedAt, revision, revisionId };
  });
}

function throwMissingRevision(): never {
  throw new ProfileCatalogLifecycleError(
    "NOT_FOUND",
    "La revisión visual está incompleta."
  );
}

export function deleteProfileCatalogDraft(
  db: Database,
  actorUserId: string,
  itemId: string,
  reason: string
) {
  const note = requireReason(reason);
  return db.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(profileCatalogItem)
      .where(eq(profileCatalogItem.id, itemId))
      .for("update");
    if (!item) {
      throw new ProfileCatalogLifecycleError(
        "NOT_FOUND",
        "El elemento no existe."
      );
    }
    if (item.isProtectedDefault) {
      throw new ProfileCatalogLifecycleError(
        "PROTECTED_DEFAULT",
        "Los elementos predeterminados protegidos no pueden eliminarse."
      );
    }
    const revisions = await tx.query.profileCatalogItemRevision.findMany({
      where: eq(profileCatalogItemRevision.itemId, itemId),
    });
    const [customization, equipped, ownership, audit] = await Promise.all([
      tx.query.profileCustomization.findFirst({
        where: (row, { or }) =>
          or(
            eq(row.selectedLayoutItemId, itemId),
            eq(row.selectedSkinItemId, itemId)
          ),
      }),
      tx.query.profileEquippedDecoration.findFirst({
        where: eq(profileEquippedDecoration.catalogItemId, itemId),
      }),
      tx.query.profileCatalogOwnership.findFirst({
        where: eq(profileCatalogOwnership.catalogItemId, itemId),
      }),
      tx.query.profileCatalogAudit.findFirst({
        where: eq(profileCatalogAudit.targetId, itemId),
      }),
    ]);
    let hasMedia = false;
    for (const revision of revisions) {
      if (item.kind === "skin") {
        const skinRevision =
          await tx.query.profileCatalogSkinRevision.findFirst({
            where: eq(profileCatalogSkinRevision.revisionId, revision.id),
          });
        hasMedia ||= Boolean(skinRevision?.backgroundAssetId);
      } else if (item.kind === "decoration") {
        const decorationRevision =
          await tx.query.profileCatalogDecorationRevision.findFirst({
            where: eq(profileCatalogDecorationRevision.revisionId, revision.id),
          });
        hasMedia ||= Boolean(decorationRevision?.mediaAssetId);
      }
    }
    if (
      item.lifecycle !== "draft" ||
      item.currentPublishedRevisionId ||
      revisions.some(({ state }) => state === "published") ||
      customization ||
      equipped ||
      ownership ||
      audit ||
      hasMedia
    ) {
      throw new ProfileCatalogLifecycleError(
        "INVALID_TRANSITION",
        "El elemento tiene dependencias o historial; usa una acción de ciclo de vida."
      );
    }
    await tx
      .delete(profileCatalogItemRevision)
      .where(eq(profileCatalogItemRevision.itemId, itemId));
    await tx
      .delete(profileCatalogItem)
      .where(eq(profileCatalogItem.id, itemId));
    await tx.insert(profileCatalogAudit).values({
      action: "delete-draft",
      actorUserId,
      before: { lifecycle: item.lifecycle, stableKey: item.stableKey },
      note,
      targetId: itemId,
      targetKind: item.kind,
    });
    return { itemId };
  });
}
