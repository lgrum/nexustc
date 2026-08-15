import { eq } from "@repo/db";
import type { db as database } from "@repo/db";
import {
  profileCatalogAudit,
  profileCatalogItem,
  profileCatalogItemRevision,
} from "@repo/db/schema/app";

type PublicationExecutor = Pick<typeof database, "insert" | "update">;

export async function publishProfileCatalogRevision(
  executor: PublicationExecutor,
  input: {
    actorUserId: string;
    currentPublishedRevisionId: string | null;
    draftRevisionId: string;
    itemId: string;
    previousLifecycle: "active" | "archived" | "disabled" | "draft";
    revision: number;
    targetKind: "decoration" | "skin";
  }
) {
  const publishedAt = new Date();
  await executor
    .update(profileCatalogItemRevision)
    .set({
      publishedAt,
      publishedByUserId: input.actorUserId,
      state: "published",
    })
    .where(eq(profileCatalogItemRevision.id, input.draftRevisionId));
  await executor
    .update(profileCatalogItem)
    .set({
      currentPublishedRevisionId: input.draftRevisionId,
      lifecycle: "active",
    })
    .where(eq(profileCatalogItem.id, input.itemId));
  await executor.insert(profileCatalogAudit).values({
    action: "publish",
    actorUserId: input.actorUserId,
    after: {
      currentPublishedRevisionId: input.draftRevisionId,
      lifecycle: "active",
      revision: input.revision,
    },
    before: {
      currentPublishedRevisionId: input.currentPublishedRevisionId,
      lifecycle: input.previousLifecycle,
    },
    targetId: input.itemId,
    targetKind: input.targetKind,
  });
  return { itemId: input.itemId, publishedAt, revision: input.revision };
}
