import { getLogger } from "@orpc/experimental-pino";
import { and, eq, ne, sql } from "@repo/db";
import {
  comicCreator,
  contentSeries,
  creator,
  post,
  postEngagementOverride,
  postMedia,
  termPostRelation,
  translator,
} from "@repo/db/schema/app";
import { createContentSlug, dedupeContentSlug } from "@repo/shared/slug";

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
import { withDeferredMediaSelections } from "./deferred-media";
import { resolveEarlyAccessStorageFields } from "./early-access";

type HandlerParams<T> = {
  context: Context & { session: NonNullable<Context["session"]> };
  input: T;
  errors: {
    BAD_REQUEST: (error?: { message?: string }) => Error;
    NOT_FOUND: () => Error;
  };
};

type MediaSyncDb = Pick<Context["db"], "delete" | "insert" | "select">;
type OrderedMediaRecord = PersistedMediaRecord;
type ContentType = ContentCreateInput["type"];
type ContentUpdateCandidate = ReturnType<typeof deriveContentUpdateEvent>;
type SlugCheckDb = Pick<Context["db"], "select">;

function resolveReleasedAt(params: {
  contentUpdateCandidate: ContentUpdateCandidate;
  documentStatus: ContentEditInput["documentStatus"];
  existingReleasedAt: Date | null;
  previousStatus: ContentEditInput["documentStatus"];
  requestedReleasedAt?: Date | null;
}) {
  if (params.documentStatus !== "publish") {
    return params.existingReleasedAt;
  }

  if (
    params.previousStatus !== "publish" ||
    params.contentUpdateCandidate?.updateType === "game_version"
  ) {
    return params.requestedReleasedAt ?? new Date();
  }

  if (params.requestedReleasedAt === null) {
    return params.existingReleasedAt === null ? null : new Date();
  }

  return params.requestedReleasedAt ?? params.existingReleasedAt;
}

function resolvePublishReleasedAt(input: {
  documentStatus: ContentCreateInput["documentStatus"];
  requestedReleasedAt?: Date | null;
}) {
  if (input.documentStatus !== "publish") {
    return null;
  }

  return input.requestedReleasedAt ?? new Date();
}

function shouldRecomputeEarlyAccessStart(input: {
  existingReleasedAt: Date | null;
  now: Date;
}) {
  return (
    input.existingReleasedAt !== null && input.existingReleasedAt > input.now
  );
}

export async function resolveContentSlug(params: {
  db: SlugCheckDb;
  excludeId?: string;
  title: string;
  type: ContentType;
}) {
  const baseSlug = createContentSlug(params.title);
  const conditions = [
    eq(post.type, params.type),
    sql`(${post.slug} = ${baseSlug} OR ${post.slug} LIKE ${`${baseSlug}-%`})`,
  ];

  if (params.excludeId) {
    conditions.push(ne(post.id, params.excludeId));
  }

  const existingPosts = await params.db
    .select({
      id: post.id,
      slug: post.slug,
      title: post.title,
    })
    .from(post)
    .where(and(...conditions));
  const exactDuplicate =
    existingPosts.find((item) => item.slug === baseSlug) ?? null;
  const slug = dedupeContentSlug(
    baseSlug,
    existingPosts.map((item) => item.slug)
  );

  return {
    baseSlug,
    duplicate: exactDuplicate !== null,
    existingTitle: exactDuplicate?.title ?? null,
    slug,
  };
}

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
  type: ContentType;
}) {
  if (!params.creatorId) {
    return {
      comicCreatorId: null,
      creatorId: null,
      creatorLink: params.creatorLink ?? "",
      creatorName: params.creatorName ?? "",
    };
  }

  if (params.type === "comic") {
    const [selectedComicCreator] = await params.db
      .select({
        id: comicCreator.id,
        name: comicCreator.name,
        url: comicCreator.url,
      })
      .from(comicCreator)
      .where(eq(comicCreator.id, params.creatorId))
      .limit(1);

    if (!selectedComicCreator) {
      return {
        comicCreatorId: null,
        creatorId: null,
        creatorLink: params.creatorLink ?? "",
        creatorName: params.creatorName ?? "",
      };
    }

    return {
      comicCreatorId: selectedComicCreator.id,
      creatorId: null,
      creatorLink: selectedComicCreator.url,
      creatorName: selectedComicCreator.name,
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
      comicCreatorId: null,
      creatorId: null,
      creatorLink: params.creatorLink ?? "",
      creatorName: params.creatorName ?? "",
    };
  }

  return {
    comicCreatorId: null,
    creatorId: selectedCreator.id,
    creatorLink: selectedCreator.url,
    creatorName: selectedCreator.name,
  };
}

async function resolveTranslatorFields(params: {
  db: Pick<Context["db"], "select">;
  translatorId: string | null | undefined;
}) {
  if (!params.translatorId) {
    return { translatorId: null };
  }

  const [selectedTranslator] = await params.db
    .select({
      id: translator.id,
      name: translator.name,
      url: translator.url,
    })
    .from(translator)
    .where(eq(translator.id, params.translatorId))
    .limit(1);

  if (!selectedTranslator) {
    return { translatorId: null };
  }

  return { translatorId: selectedTranslator.id };
}

async function resolveSeriesFields(params: {
  db: Pick<Context["db"], "insert" | "select">;
  seriesId: string | null;
  seriesOrder: number;
  seriesTitle: string;
  type: ContentType;
}) {
  const normalizedTitle = params.seriesTitle.trim();

  if (params.seriesId) {
    const [selectedSeries] = await params.db
      .select({ id: contentSeries.id })
      .from(contentSeries)
      .where(
        and(
          eq(contentSeries.id, params.seriesId),
          eq(contentSeries.type, params.type)
        )
      )
      .limit(1);

    return {
      seriesId: selectedSeries?.id ?? null,
      seriesOrder: selectedSeries ? params.seriesOrder : 0,
    };
  }

  if (normalizedTitle === "") {
    return {
      seriesId: null,
      seriesOrder: 0,
    };
  }

  const [existingSeries] = await params.db
    .select({ id: contentSeries.id })
    .from(contentSeries)
    .where(
      and(
        eq(contentSeries.type, params.type),
        sql`lower(${contentSeries.title}) = lower(${normalizedTitle})`
      )
    )
    .limit(1);

  if (existingSeries) {
    return {
      seriesId: existingSeries.id,
      seriesOrder: params.seriesOrder,
    };
  }

  const [createdSeries] = await params.db
    .insert(contentSeries)
    .values({
      title: normalizedTitle,
      type: params.type,
    })
    .returning({ id: contentSeries.id });

  if (!createdSeries) {
    throw new Error(`Failed to create series "${normalizedTitle}"`);
  }

  return {
    seriesId: createdSeries.id,
    seriesOrder: params.seriesOrder,
  };
}

export async function createContent({
  context: { db, session, ...ctx },
  errors,
  input,
}: HandlerParams<ContentCreateInput>) {
  const logger = getLogger(ctx);
  const contentType = input.type;

  logger?.info(
    `User ${session.user?.id} creating new ${contentType}: "${input.title}"`
  );

  return await withDeferredMediaSelections({
    db,
    onComplete: async ({ orderedSelections, tx }) => {
      const orderedMedia = orderedSelections[0] ?? [];
      const coverMedia = orderedSelections[1]?.[0] ?? null;

      logger?.info(`Starting transaction for ${contentType} creation`);
      const releasedAt = resolvePublishReleasedAt({
        documentStatus: input.documentStatus,
        requestedReleasedAt: input.releasedAt,
      });
      const earlyAccessFields = resolveEarlyAccessStorageFields({
        documentStatus: input.documentStatus,
        enabled: input.earlyAccessEnabled,
        releasedAt,
        vip12Hours: input.vip12EarlyAccessHours,
        vip8Hours: input.vip8EarlyAccessHours,
      });
      const creatorFields = await resolveCreatorFields({
        creatorId: input.creatorId,
        creatorLink: input.creatorLink,
        db: tx,
        creatorName: input.creatorName,
        type: input.type,
      });
      const translatorFields =
        input.type === "comic"
          ? await resolveTranslatorFields({
              db: tx,
              translatorId: input.translatorId,
            })
          : { translatorId: null };
      const seriesFields = await resolveSeriesFields({
        db: tx,
        seriesId: input.seriesId,
        seriesOrder: input.seriesOrder,
        seriesTitle: input.seriesTitle,
        type: input.type,
      });
      const slugFields = await resolveContentSlug({
        db: tx,
        title: input.title,
        type: input.type,
      });

      if (slugFields.duplicate && !input.acceptSlugDeduplication) {
        throw errors.BAD_REQUEST({
          message: `Ya existe ${input.type === "comic" ? "un comic" : "un post"} con el slug "${slugFields.baseSlug}". Confirma para usar "${slugFields.slug}".`,
        });
      }

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
          coverMediaId: coverMedia?.id ?? null,
          comicCreatorId: creatorFields.comicCreatorId,
          creatorId: creatorFields.creatorId,
          creatorLink: creatorFields.creatorLink,
          creatorName: creatorFields.creatorName,
          ...earlyAccessFields,
          imageObjectKeys: orderedMedia.map((item) => item.objectKey),
          isWeekly: false,
          thumbnailImageCount:
            input.type === "post" ? input.thumbnailImageCount : 1,
          translatorId: translatorFields.translatorId,
          premiumLinksAccessLevel:
            input.type === "post" ? input.premiumLinksAccessLevel : "auto",
          premiumLinks:
            input.type === "post"
              ? input.premiumLinks
              : (input.premiumLinks ?? ""),
          releasedAt,
          seriesId: seriesFields.seriesId,
          seriesOrder: seriesFields.seriesOrder,
          slug: slugFields.slug,
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
        input.type === "comic" ? input.style : "",
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
    selections: [input.mediaSelection, input.coverImageSelection],
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

  const updatedPostId = await withDeferredMediaSelections({
    db,
    onComplete: async ({ orderedSelections, tx }) => {
      const orderedMedia = orderedSelections[0] ?? [];
      const coverMedia = orderedSelections[1]?.[0] ?? null;
      const now = new Date();

      const existingPost = await tx.query.post.findFirst({
        columns: {
          comicLastUpdateAt: true,
          earlyAccessStartedAt: true,
          id: true,
          releasedAt: true,
          slug: true,
          status: true,
          title: true,
          type: true,
          version: true,
        },
        where: and(eq(post.id, input.id), eq(post.type, input.type)),
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
      const creatorFields = await resolveCreatorFields({
        creatorId: input.creatorId,
        creatorLink: input.creatorLink,
        db: tx,
        creatorName: input.creatorName,
        type: input.type,
      });
      const translatorFields =
        input.type === "comic"
          ? await resolveTranslatorFields({
              db: tx,
              translatorId: input.translatorId,
            })
          : { translatorId: null };
      const seriesFields = await resolveSeriesFields({
        db: tx,
        seriesId: input.seriesId,
        seriesOrder: input.seriesOrder,
        seriesTitle: input.seriesTitle,
        type: input.type,
      });
      const slugFields =
        existingPost.title === input.title
          ? { duplicate: false, slug: existingPost.slug }
          : await resolveContentSlug({
              db: tx,
              excludeId: input.id,
              title: input.title,
              type: input.type,
            });

      if (slugFields.duplicate && !input.acceptSlugDeduplication) {
        throw errors.BAD_REQUEST({
          message: `Ya existe ${input.type === "comic" ? "un comic" : "un post"} con ese slug. Confirma para usar "${slugFields.slug}".`,
        });
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
      const releasedAt = resolveReleasedAt({
        contentUpdateCandidate,
        documentStatus: input.documentStatus,
        existingReleasedAt: existingPost.releasedAt,
        previousStatus: existingPost.status,
        requestedReleasedAt: input.releasedAt,
      });
      const earlyAccessFields = resolveEarlyAccessStorageFields({
        documentStatus: input.documentStatus,
        enabled: input.earlyAccessEnabled,
        existingStartedAt: shouldRecomputeEarlyAccessStart({
          existingReleasedAt: existingPost.releasedAt,
          now,
        })
          ? null
          : existingPost.earlyAccessStartedAt,
        releasedAt,
        vip12Hours: input.vip12EarlyAccessHours,
        vip8Hours: input.vip8EarlyAccessHours,
      });

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
          coverMediaId: coverMedia?.id ?? null,
          comicCreatorId: creatorFields.comicCreatorId,
          creatorId: creatorFields.creatorId,
          creatorLink: creatorFields.creatorLink,
          creatorName: creatorFields.creatorName,
          ...earlyAccessFields,
          imageObjectKeys: orderedMedia.map((item) => item.objectKey),
          thumbnailImageCount:
            input.type === "post" ? input.thumbnailImageCount : 1,
          translatorId: translatorFields.translatorId,
          premiumLinksAccessLevel:
            input.type === "post" ? input.premiumLinksAccessLevel : "auto",
          premiumLinks:
            input.type === "post"
              ? input.premiumLinks
              : (input.premiumLinks ?? ""),
          releasedAt,
          seriesId: seriesFields.seriesId,
          seriesOrder: seriesFields.seriesOrder,
          slug: slugFields.slug,
          status: input.documentStatus,
          title: input.title,
          version:
            input.type === "post" ? input.version : (input.version ?? ""),
        })
        .where(and(eq(post.id, input.id), eq(post.type, input.type)))
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
        input.type === "comic" ? input.style : "",
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
    selections: [input.mediaSelection, input.coverImageSelection],
  });

  logger?.info(`${contentType} ${input.id} successfully updated`);
  return updatedPostId;
}

export async function deleteContent({
  context: { db, ...ctx },
  input,
}: Omit<HandlerParams<{ id: string; type: ContentType }>, "errors">) {
  const logger = getLogger(ctx);
  logger?.info(`Deleting ${input.type}: ${input.id}`);

  await db
    .delete(post)
    .where(and(eq(post.id, input.id), eq(post.type, input.type)));

  logger?.info(`${input.type} ${input.id} successfully deleted`);
}
