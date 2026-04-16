import { getLogger } from "@orpc/experimental-pino";
import { eq, sql } from "@repo/db";
import {
  creator,
  post,
  postEngagementOverride,
  postMedia,
  termPostRelation,
} from "@repo/db/schema/app";

import type { Context } from "../context";
import {
  createOrCollapseContentUpdateNotification,
  deriveContentUpdateEvent,
} from "../services/notification";
import type {
  ContentCreateInput,
  ContentEditInput,
  PersistedMediaRecord,
} from "./deferred-media";
import { withDeferredMediaSelection } from "./deferred-media";
import { resolveEarlyAccessStorageFields } from "./early-access";

type HandlerParams<T> = {
  context: Context & { session: NonNullable<Context["session"]> };
  input: T;
  errors: {
    NOT_FOUND: () => Error;
  };
};

type MediaSyncDb = Pick<Context["db"], "delete" | "insert" | "select">;
type OrderedMediaRecord = PersistedMediaRecord;

function buildEngagementOverrideRows(postId: string, prompts: string[]) {
  return prompts.map((text, index) => ({
    isActive: true,
    postId,
    sortOrder: index,
    text,
  }));
}

async function syncPostMediaRelations(
  tx: MediaSyncDb,
  postId: string,
  orderedMedia: OrderedMediaRecord[]
) {
  await tx.delete(postMedia).where(eq(postMedia.postId, postId));

  if (orderedMedia.length === 0) {
    return [];
  }

  await tx.insert(postMedia).values(
    orderedMedia.map((item, sortOrder) => ({
      mediaId: item.id,
      postId,
      sortOrder,
    }))
  );

  return orderedMedia;
}

async function resolveCreatorFields(params: {
  creatorId: string | null;
  creatorLink: string | null | undefined;
  creatorName: string | null | undefined;
  db: Pick<Context["db"], "select">;
}) {
  if (!params.creatorId) {
    return {
      creatorId: null,
      creatorLink: params.creatorLink ?? "",
      creatorName: params.creatorName ?? "",
    };
  }

  const [selectedCreator] = await params.db
    .select({
      id: creator.id,
      name: creator.name,
      url: creator.url,
    })
    .from(creator)
    .where(eq(creator.id, params.creatorId))
    .limit(1);

  if (!selectedCreator) {
    return {
      creatorId: null,
      creatorLink: params.creatorLink ?? "",
      creatorName: params.creatorName ?? "",
    };
  }

  return {
    creatorId: selectedCreator.id,
    creatorLink: selectedCreator.url,
    creatorName: selectedCreator.name,
  };
}

export async function createContent({
  context: { db, session, ...ctx },
  input,
}: HandlerParams<ContentCreateInput>) {
  const logger = getLogger(ctx);
  const contentType = input.type;

  logger?.info(
    `User ${session.user?.id} creating new ${contentType}: "${input.title}"`
  );

  return await withDeferredMediaSelection({
    db,
    onComplete: async ({ orderedMedia, tx }) => {
      logger?.info(`Starting transaction for ${contentType} creation`);
      const earlyAccessFields =
        input.type === "post"
          ? resolveEarlyAccessStorageFields({
              documentStatus: input.documentStatus,
              enabled: input.earlyAccessEnabled,
              vip12Hours: input.vip12EarlyAccessHours,
              vip8Hours: input.vip8EarlyAccessHours,
            })
          : resolveEarlyAccessStorageFields({
              documentStatus: input.documentStatus,
              enabled: false,
              vip12Hours: 0,
              vip8Hours: 0,
            });
      const creatorFields =
        input.type === "post"
          ? await resolveCreatorFields({
              creatorId: input.creatorId,
              creatorLink: input.creatorLink,
              db: tx,
              creatorName: input.creatorName,
            })
          : {
              creatorId: null,
              creatorLink: input.creatorLink ?? "",
              creatorName: input.creatorName ?? "",
            };

      const [postData] = await tx
        .insert(post)
        .values({
          adsLinks:
            input.type === "post" ? input.adsLinks : (input.adsLinks ?? ""),
          authorId: session.user?.id,
          changelog:
            input.type === "post" ? input.changelog : (input.changelog ?? ""),
          comicLastUpdateAt: input.type === "comic" ? new Date() : null,
          comicPageCount: input.type === "comic" ? orderedMedia.length : 0,
          content:
            input.type === "post" ? input.content : (input.content ?? ""),
          creatorId: creatorFields.creatorId,
          creatorLink: creatorFields.creatorLink,
          creatorName: creatorFields.creatorName,
          ...earlyAccessFields,
          imageObjectKeys: orderedMedia.map((item) => item.objectKey),
          isWeekly: false,
          premiumLinksAccessLevel:
            input.type === "post" ? input.premiumLinksAccessLevel : "auto",
          premiumLinks:
            input.type === "post"
              ? input.premiumLinks
              : (input.premiumLinks ?? ""),
          status: input.documentStatus,
          title: input.title,
          type: input.type,
          version:
            input.type === "post" ? input.version : (input.version ?? ""),
          views: 0,
        })
        .returning({ postId: post.id });

      if (!postData) {
        throw new Error(`Failed to create ${contentType}`);
      }

      if (orderedMedia.length > 0) {
        await tx.insert(postMedia).values(
          orderedMedia.map((item, sortOrder) => ({
            mediaId: item.id,
            postId: postData.postId,
            sortOrder,
          }))
        );
      }

      const termIds = [
        ...(input.type === "post" ? input.platforms : (input.platforms ?? [])),
        ...input.tags,
        ...(input.languages ?? []),
        input.censorship,
        input.type === "post" ? input.engine : (input.engine ?? ""),
        input.type === "post" ? input.status : (input.status ?? ""),
        input.type === "post" ? input.graphics : (input.graphics ?? ""),
      ]
        .filter((term) => term !== "")
        .map((termId) => ({
          postId: postData.postId,
          termId,
        }));

      if (termIds.length > 0) {
        await tx.insert(termPostRelation).values(termIds);
        logger?.debug(
          `Inserted ${termIds.length} term relations for ${contentType} ${postData.postId}`
        );
      }

      const engagementOverrides = buildEngagementOverrideRows(
        postData.postId,
        input.manualEngagementQuestions ?? []
      );

      if (engagementOverrides.length > 0) {
        await tx.insert(postEngagementOverride).values(engagementOverrides);
        logger?.debug(
          `Inserted ${engagementOverrides.length} engagement overrides for ${contentType} ${postData.postId}`
        );
      }

      logger?.info(
        `${contentType} successfully created with ID: ${postData.postId}`
      );

      return postData.postId;
    },
    ownerKind: input.type === "post" ? "Juego" : "Comic",
    resourceName: input.title,
    selection: input.mediaSelection,
  });
}

export async function editContent({
  context: { db, ...ctx },
  input,
  errors,
}: HandlerParams<ContentEditInput>) {
  const logger = getLogger(ctx);
  const contentType = input.type;
  logger?.info(`Editing ${contentType}: ${input.id}`);

  const updatedPostId = await withDeferredMediaSelection({
    db,
    onComplete: async ({ orderedMedia, tx }) => {
      const existingPost = await tx.query.post.findFirst({
        columns: {
          comicLastUpdateAt: true,
          earlyAccessStartedAt: true,
          id: true,
          status: true,
          title: true,
          type: true,
          version: true,
        },
        where: eq(post.id, input.id),
      });

      if (!existingPost) {
        logger?.error(`${contentType} not found for edit: ${input.id}`);
        throw errors.NOT_FOUND();
      }

      const [previousMediaCountResult] = await tx
        .select({
          mediaCount: sql<number>`COUNT(*)::integer`,
        })
        .from(postMedia)
        .where(eq(postMedia.postId, input.id));
      const earlyAccessFields =
        input.type === "post"
          ? resolveEarlyAccessStorageFields({
              documentStatus: input.documentStatus,
              enabled: input.earlyAccessEnabled,
              existingStartedAt: existingPost.earlyAccessStartedAt,
              vip12Hours: input.vip12EarlyAccessHours,
              vip8Hours: input.vip8EarlyAccessHours,
            })
          : resolveEarlyAccessStorageFields({
              documentStatus: input.documentStatus,
              enabled: false,
              existingStartedAt: existingPost.earlyAccessStartedAt,
              vip12Hours: 0,
              vip8Hours: 0,
            });
      const creatorFields =
        input.type === "post"
          ? await resolveCreatorFields({
              creatorId: input.creatorId,
              creatorLink: input.creatorLink,
              db: tx,
              creatorName: input.creatorName,
            })
          : {
              creatorId: null,
              creatorLink: input.creatorLink ?? "",
              creatorName: input.creatorName ?? "",
            };

      const [postData] = await tx
        .update(post)
        .set({
          adsLinks:
            input.type === "post" ? input.adsLinks : (input.adsLinks ?? ""),
          changelog:
            input.type === "post" ? input.changelog : (input.changelog ?? ""),
          comicLastUpdateAt:
            input.type === "comic" &&
            orderedMedia.length > (previousMediaCountResult?.mediaCount ?? 0)
              ? new Date()
              : input.type === "comic"
                ? existingPost.comicLastUpdateAt
                : null,
          comicPageCount: input.type === "comic" ? orderedMedia.length : 0,
          content:
            input.type === "post" ? input.content : (input.content ?? ""),
          creatorId: creatorFields.creatorId,
          creatorLink: creatorFields.creatorLink,
          creatorName: creatorFields.creatorName,
          ...earlyAccessFields,
          imageObjectKeys: orderedMedia.map((item) => item.objectKey),
          premiumLinksAccessLevel:
            input.type === "post" ? input.premiumLinksAccessLevel : "auto",
          premiumLinks:
            input.type === "post"
              ? input.premiumLinks
              : (input.premiumLinks ?? ""),
          status: input.documentStatus,
          title: input.title,
          version:
            input.type === "post" ? input.version : (input.version ?? ""),
        })
        .where(eq(post.id, input.id))
        .returning({ postId: post.id });

      if (!postData) {
        throw errors.NOT_FOUND();
      }

      await syncPostMediaRelations(tx, postData.postId, orderedMedia);

      await tx
        .delete(termPostRelation)
        .where(eq(termPostRelation.postId, postData.postId));

      const termIds = [
        ...(input.type === "post" ? input.platforms : (input.platforms ?? [])),
        ...input.tags,
        ...(input.languages ?? []),
        input.censorship,
        input.type === "post" ? input.engine : (input.engine ?? ""),
        input.type === "post" ? input.status : (input.status ?? ""),
        input.type === "post" ? input.graphics : (input.graphics ?? ""),
      ]
        .filter((term) => term !== "")
        .map((termId) => ({
          postId: postData.postId,
          termId,
        }));

      if (termIds.length > 0) {
        await tx.insert(termPostRelation).values(termIds);
        logger?.debug(
          `Updated ${termIds.length} term relations for ${contentType} ${postData.postId}`
        );
      }

      await tx
        .delete(postEngagementOverride)
        .where(eq(postEngagementOverride.postId, postData.postId));

      const engagementOverrides = buildEngagementOverrideRows(
        postData.postId,
        input.manualEngagementQuestions ?? []
      );

      if (engagementOverrides.length > 0) {
        await tx.insert(postEngagementOverride).values(engagementOverrides);
        logger?.debug(
          `Replaced ${engagementOverrides.length} engagement overrides for ${contentType} ${postData.postId}`
        );
      }

      const contentUpdateCandidate = deriveContentUpdateEvent({
        next: {
          documentStatus: input.documentStatus,
          mediaCount: orderedMedia.length,
          title: input.title,
          type: input.type,
          version:
            input.type === "post" ? input.version : (input.version ?? null),
        },
        previous: {
          id: existingPost.id,
          mediaCount: previousMediaCountResult?.mediaCount ?? 0,
          status: existingPost.status,
          title: existingPost.title,
          type: existingPost.type,
          version: existingPost.version,
        },
      });

      if (contentUpdateCandidate) {
        await createOrCollapseContentUpdateNotification(
          tx,
          contentUpdateCandidate
        );
        logger?.info(
          `Generated ${contentUpdateCandidate.updateType} notification for ${contentType} ${postData.postId}`
        );
      }

      return postData.postId;
    },
    ownerKind: input.type === "post" ? "Juego" : "Comic",
    resourceName: input.title,
    selection: input.mediaSelection,
  });

  logger?.info(`${contentType} ${input.id} successfully updated`);
  return updatedPostId;
}

export async function deleteContent({
  context: { db, ...ctx },
  input,
}: Omit<HandlerParams<string>, "errors">) {
  const logger = getLogger(ctx);
  logger?.info(`Deleting content: ${input}`);

  await db.delete(post).where(eq(post.id, input));

  logger?.info(`Content ${input} successfully deleted`);
}
