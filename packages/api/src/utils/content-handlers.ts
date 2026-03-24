import { DeleteObjectsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getLogger } from "@orpc/experimental-pino";
import { eq } from "@repo/db";
import {
  post,
  postEngagementOverride,
  termPostRelation,
} from "@repo/db/schema/app";
import { generateId } from "@repo/db/utils";
import { env } from "@repo/env";
import type {
  contentCreateSchema,
  contentEditImagesSchema,
} from "@repo/shared/schemas";
import type { z } from "zod";

import type { Context } from "../context";
import { optimizeImageToWebp } from "../utils/images";
import { getS3Client } from "../utils/s3";

type ContentInput = z.infer<typeof contentCreateSchema>;
type ContentEditInput = ContentInput & { id: string };

type HandlerParams<T> = {
  context: Context & { session: NonNullable<Context["session"]> };
  input: T;
  errors: {
    NOT_FOUND: () => Error;
    INTERNAL_SERVER_ERROR: () => Error;
  };
};

function buildEngagementOverrideRows(postId: string, prompts: string[]) {
  return prompts.map((text, index) => ({
    isActive: true,
    postId,
    sortOrder: index,
    text,
  }));
}
export async function createContent({
  context: { db, session, ...ctx },
  input,
  errors,
}: HandlerParams<ContentInput>) {
  const logger = getLogger(ctx);
  const contentType = input.type;
  logger?.info(
    `User ${session.user?.id} creating new ${contentType}: "${input.title}"`
  );

  logger?.debug(`Optimizing ${input.files?.length || 0} uploaded images`);
  const optimizedImages = await Promise.all(
    input.files?.map((file) => optimizeImageToWebp(file)) || []
  );
  logger?.debug(`Successfully optimized ${optimizedImages.length} images`);

  const successfulImageUploads: string[] = [];

  const deleteHangingImages = async () => {
    if (successfulImageUploads.length === 0) {
      return;
    }
    logger?.info("Deleting any successfully uploaded images");
    try {
      await getS3Client().send(
        new DeleteObjectsCommand({
          Bucket: env.R2_ASSETS_BUCKET_NAME,
          Delete: {
            Objects: successfulImageUploads.map((key) => ({ Key: key })),
            Quiet: false,
          },
        })
      );
      logger?.info("Cleaned up uploaded images after failure");
    } catch (error) {
      logger?.error(
        `[IMPORTANT] Failed to delete images with keys: ${successfulImageUploads.join(", ")}.`
      );
      logger?.error(error);
    }
  };

  try {
    const keys = await Promise.allSettled(
      optimizedImages.map(async (buffer) => {
        const objectKey = `images/${contentType}/${generateId()}.webp`;
        await getS3Client().send(
          new PutObjectCommand({
            Body: buffer,
            Bucket: env.R2_ASSETS_BUCKET_NAME,
            ContentLength: buffer.byteLength,
            ContentType: "image/webp",
            Key: objectKey,
          })
        );
        return objectKey;
      })
    );
    successfulImageUploads.push(
      ...keys
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value)
    );

    const rejected = keys.filter((r) => r.status === "rejected");
    if (rejected.length > 0) {
      for (const r of rejected) {
        logger?.debug(`Upload failed: ${r.reason}`);
      }
      throw new Error("Failed to upload some images to R2");
    }
  } catch (error) {
    logger?.error("Error uploading images to R2");
    logger?.error(error);
    await deleteHangingImages();
    throw errors.INTERNAL_SERVER_ERROR();
  }

  let createdPostId: string | undefined;

  try {
    await db.transaction(async (tx) => {
      logger?.info(`Starting transaction for ${contentType} creation`);

      const [postData] = await tx
        .insert(post)
        .values({
          adsLinks:
            input.type === "post" ? input.adsLinks : (input.adsLinks ?? ""),
          authorId: session.user?.id,
          changelog:
            input.type === "post" ? input.changelog : (input.changelog ?? ""),
          content:
            input.type === "post" ? input.content : (input.content ?? ""),
          creatorLink: input.creatorLink ?? "",
          creatorName: input.creatorName ?? "",
          imageObjectKeys: successfulImageUploads,
          isWeekly: false,
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
        logger?.error(
          `Failed to create ${contentType} for user ${session.user?.id}`
        );
        return tx.rollback();
      }

      createdPostId = postData.postId;
      logger?.debug(`Created ${contentType} with ID: ${postData.postId}`);

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
    });
  } catch (error) {
    await deleteHangingImages();
    logger?.error(
      `Transaction failed during ${contentType} creation: ${(error as Error).message}`
    );
    throw error;
  }

  if (!createdPostId) {
    throw errors.INTERNAL_SERVER_ERROR();
  }

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

  const currentPost = await db.query.post.findFirst({
    where: (p, { eq: equals }) => equals(p.id, input),
  });

  if (!currentPost) {
    logger?.warn(`Content not found for deletion: ${input}`);
    return;
  }

  await Promise.all([
    currentPost?.imageObjectKeys &&
      getS3Client().send(
        new DeleteObjectsCommand({
          Bucket: env.R2_ASSETS_BUCKET_NAME,
          Delete: {
            Objects: currentPost.imageObjectKeys.map((key) => ({
              Key: key,
            })),
          },
        })
      ),
    db.delete(post).where(eq(post.id, input)),
  ]);

  if (currentPost?.imageObjectKeys) {
    logger?.debug(
      `Deleted ${currentPost.imageObjectKeys.length} images for content ${input}`
    );
  }
  logger?.info(`Content ${input} successfully deleted`);
}

type ContentEditImagesInput = z.infer<typeof contentEditImagesSchema>;

export async function editContentImages({
  context: { db, ...ctx },
  input,
  errors,
}: HandlerParams<ContentEditImagesInput>) {
  const logger = getLogger(ctx);
  logger?.info(`Editing images for ${input.type}: ${input.postId}`);

  const currentPost = await db.query.post.findFirst({
    columns: { imageObjectKeys: true, type: true },
    where: (p, { eq: equals }) => equals(p.id, input.postId),
  });

  if (!currentPost) {
    throw errors.NOT_FOUND();
  }

  const currentKeys = currentPost.imageObjectKeys ?? [];

  for (const entry of input.order) {
    if (entry.type === "existing" && !currentKeys.includes(entry.key)) {
      logger?.error(`Existing key not found in current images: ${entry.key}`);
      throw errors.NOT_FOUND();
    }
    if (
      entry.type === "new" &&
      (!input.newFiles || entry.index >= input.newFiles.length)
    ) {
      logger?.error(`Invalid new file index: ${entry.index}`);
      throw errors.INTERNAL_SERVER_ERROR();
    }
  }

  const newUploads = new Map<number, string>();
  const successfulNewKeys: string[] = [];

  const deleteNewUploads = async () => {
    if (successfulNewKeys.length === 0) {
      return;
    }
    logger?.info("Rolling back uploaded images");
    try {
      await getS3Client().send(
        new DeleteObjectsCommand({
          Bucket: env.R2_ASSETS_BUCKET_NAME,
          Delete: {
            Objects: successfulNewKeys.map((key) => ({ Key: key })),
            Quiet: false,
          },
        })
      );
    } catch (error) {
      logger?.error(
        `[IMPORTANT] Failed to delete rollback images: ${successfulNewKeys.join(", ")}`
      );
      logger?.error(error);
    }
  };

  if (input.newFiles && input.newFiles.length > 0) {
    const newIndices = input.order
      .filter((e) => e.type === "new")
      .map((e) => e.index);
    const uniqueIndices = [...new Set(newIndices)];

    try {
      const results = await Promise.allSettled(
        uniqueIndices.map(async (index) => {
          const file = input.newFiles![index]!;
          const buffer = await optimizeImageToWebp(file);
          const objectKey = `images/${input.type}/${generateId()}.webp`;
          await getS3Client().send(
            new PutObjectCommand({
              Body: buffer,
              Bucket: env.R2_ASSETS_BUCKET_NAME,
              ContentLength: buffer.byteLength,
              ContentType: "image/webp",
              Key: objectKey,
            })
          );
          return { index, objectKey };
        })
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          newUploads.set(result.value.index, result.value.objectKey);
          successfulNewKeys.push(result.value.objectKey);
        }
      }

      const rejected = results.filter((r) => r.status === "rejected");
      if (rejected.length > 0) {
        for (const r of rejected) {
          logger?.debug(`Upload failed: ${r.reason}`);
        }
        throw new Error("Failed to upload some new images");
      }
    } catch (error) {
      logger?.error("Error uploading new images");
      logger?.error(error);
      await deleteNewUploads();
      throw errors.INTERNAL_SERVER_ERROR();
    }
  }

  const finalKeys: string[] = input.order.map((entry) => {
    if (entry.type === "existing") {
      return entry.key;
    }
    return newUploads.get(entry.index)!;
  });

  try {
    await db
      .update(post)
      .set({ imageObjectKeys: finalKeys })
      .where(eq(post.id, input.postId));
  } catch (error) {
    logger?.error("Failed to update DB with new image order");
    logger?.error(error);
    await deleteNewUploads();
    throw errors.INTERNAL_SERVER_ERROR();
  }

  const keysToDelete = currentKeys.filter((key) => !finalKeys.includes(key));
  if (keysToDelete.length > 0) {
    try {
      await getS3Client().send(
        new DeleteObjectsCommand({
          Bucket: env.R2_ASSETS_BUCKET_NAME,
          Delete: {
            Objects: keysToDelete.map((key) => ({ Key: key })),
            Quiet: false,
          },
        })
      );
      logger?.debug(`Deleted ${keysToDelete.length} removed images from S3`);
    } catch (error) {
      logger?.error(
        `[IMPORTANT] Failed to delete removed images: ${keysToDelete.join(", ")}`
      );
      logger?.error(error);
    }
  }

  logger?.info(`Successfully updated images for ${input.type} ${input.postId}`);
  return finalKeys;
}

export async function insertContentImages({
  context: { db, ...ctx },
  input,
}: Omit<HandlerParams<{ postId: string; images: string[] }>, "errors">) {
  const logger = getLogger(ctx);
  logger?.info(
    `Inserting ${input.images.length} images for content: ${input.postId}`
  );

  await db
    .update(post)
    .set({
      imageObjectKeys: input.images,
    })
    .where(eq(post.id, input.postId));

  logger?.info(`Images successfully inserted for content ${input.postId}`);
}
