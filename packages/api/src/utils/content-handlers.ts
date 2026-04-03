import { getLogger } from "@orpc/experimental-pino";
import { eq } from "@repo/db";
import {
  post,
  postEngagementOverride,
  postMedia,
  termPostRelation,
} from "@repo/db/schema/app";
import type { contentCreateSchema } from "@repo/shared/schemas";
import type { z } from "zod";

import type { Context } from "../context";
import { getOrderedMediaRecords } from "./post-media";

type ContentInput = z.infer<typeof contentCreateSchema>;
type ContentEditInput = ContentInput & { id: string };

type HandlerParams<T> = {
  context: Context & { session: NonNullable<Context["session"]> };
  input: T;
  errors: {
    NOT_FOUND: () => Error;
  };
};

type MediaSyncDb = Pick<Context["db"], "delete" | "insert" | "select">;

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
  mediaIds: string[]
) {
  await tx.delete(postMedia).where(eq(postMedia.postId, postId));

  if (mediaIds.length === 0) {
    return [];
  }

  const orderedMedia = await getOrderedMediaRecords(tx, mediaIds);

  await tx.insert(postMedia).values(
    orderedMedia.map((item, sortOrder) => ({
      mediaId: item.id,
      postId,
      sortOrder,
    }))
  );

  return orderedMedia;
}

export async function createContent({
  context: { db, session, ...ctx },
  input,
}: HandlerParams<ContentInput>) {
  const logger = getLogger(ctx);
  const contentType = input.type;

  logger?.info(
    `User ${session.user?.id} creating new ${contentType}: "${input.title}"`
  );

  const createdPostId = await db.transaction(async (tx) => {
    logger?.info(`Starting transaction for ${contentType} creation`);

    const orderedMedia = await getOrderedMediaRecords(tx, input.mediaIds);

    const [postData] = await tx
      .insert(post)
      .values({
        adsLinks:
          input.type === "post" ? input.adsLinks : (input.adsLinks ?? ""),
        authorId: session.user?.id,
        changelog:
          input.type === "post" ? input.changelog : (input.changelog ?? ""),
        content: input.type === "post" ? input.content : (input.content ?? ""),
        creatorLink: input.creatorLink ?? "",
        creatorName: input.creatorName ?? "",
        imageObjectKeys: orderedMedia.map((item) => item.objectKey),
        isWeekly: false,
        premiumLinks:
          input.type === "post"
            ? input.premiumLinks
            : (input.premiumLinks ?? ""),
        status: input.documentStatus,
        title: input.title,
        type: input.type,
        version: input.type === "post" ? input.version : (input.version ?? ""),
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
  });

  return createdPostId;
}

export async function editContent({
  context: { db, ...ctx },
  input,
  errors,
}: HandlerParams<ContentEditInput>) {
  const logger = getLogger(ctx);
  const contentType = input.type;
  logger?.info(`Editing ${contentType}: ${input.id}`);

  const updatedPostId = await db.transaction(async (tx) => {
    const orderedMedia = await getOrderedMediaRecords(tx, input.mediaIds);

    const [postData] = await tx
      .update(post)
      .set({
        adsLinks:
          input.type === "post" ? input.adsLinks : (input.adsLinks ?? ""),
        changelog:
          input.type === "post" ? input.changelog : (input.changelog ?? ""),
        content: input.type === "post" ? input.content : (input.content ?? ""),
        creatorLink: input.creatorLink ?? "",
        creatorName: input.creatorName ?? "",
        imageObjectKeys: orderedMedia.map((item) => item.objectKey),
        premiumLinks:
          input.type === "post"
            ? input.premiumLinks
            : (input.premiumLinks ?? ""),
        status: input.documentStatus,
        title: input.title,
        version: input.type === "post" ? input.version : (input.version ?? ""),
      })
      .where(eq(post.id, input.id))
      .returning({ postId: post.id });

    if (!postData) {
      logger?.error(`${contentType} not found for edit: ${input.id}`);
      throw errors.NOT_FOUND();
    }

    await syncPostMediaRelations(tx, postData.postId, input.mediaIds);

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

    return postData.postId;
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
