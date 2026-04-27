import { getLogger } from "@orpc/experimental-pino";
import { and, eq, inArray, sql } from "@repo/db";
import { featuredPost, post } from "@repo/db/schema/app";
import z from "zod";

import { permissionProcedure } from "../../index";
import {
  createContent,
  deleteContent,
  editContent,
} from "../../utils/content-handlers";
import {
  postCreateInputSchema,
  postEditInputSchema,
} from "../../utils/deferred-media";
import {
  createPostCoverImageObjectKeySelect,
  mapPostWithMedia,
} from "../../utils/post-media";

export default {
  create: permissionProcedure({
    posts: ["create"],
  })
    .input(postCreateInputSchema)
    .handler(createContent),

  createPostPrerequisites: permissionProcedure({
    posts: ["list"],
  }).handler(async ({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching post creation prerequisites");

    const terms = await db.query.term.findMany();
    logger?.debug(`Retrieved ${terms.length} terms for prerequisites`);
    const series = await db.query.contentSeries.findMany({
      orderBy: (table, { asc }) => [asc(table.title)],
      where: (table, { eq: equals }) => equals(table.type, "post"),
    });
    logger?.debug(`Retrieved ${series.length} game series for prerequisites`);

    return {
      series,
      terms,
    };
  }),

  delete: permissionProcedure({
    posts: ["delete"],
  })
    .input(z.string())
    .handler(deleteContent),

  edit: permissionProcedure({
    posts: ["update"],
  })
    .input(postEditInputSchema)
    .handler(editContent),

  getDashboardList: permissionProcedure({
    posts: ["list"],
  }).handler(({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching post dashboard list");

    return db.query.post.findMany({
      columns: {
        createdAt: true,
        creatorName: true,
        id: true,
        isWeekly: true,
        status: true,
        title: true,
        updatedAt: true,
        version: true,
        views: true,
      },
      orderBy: (p, { desc }) => [desc(p.createdAt)],
      where: (p, { eq: equals }) => equals(p.type, "post"),
      with: {
        terms: {
          with: {
            term: true,
          },
        },
      },
    });
  }),

  getEdit: permissionProcedure({
    posts: ["update"],
  })
    .input(z.string())
    .handler(({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching post for editing: ${input}`);

      return db.query.post
        .findFirst({
          where: eq(post.id, input),
          with: {
            engagementOverrides: {
              orderBy: (table, { asc }) => [asc(table.sortOrder)],
            },
            coverMedia: true,
            mediaRelations: {
              orderBy: (table, { asc }) => [asc(table.sortOrder)],
              with: {
                media: true,
              },
            },
            terms: {
              with: {
                term: true,
              },
            },
          },
        })
        .then((result) => (result ? mapPostWithMedia(result) : null));
    }),

  getFeaturedPosts: permissionProcedure({
    posts: ["list"],
  }).handler(({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching currently featured posts");

    return db
      .select({
        id: featuredPost.id,
        coverImageObjectKey: createPostCoverImageObjectKeySelect(),
        imageObjectKeys: post.imageObjectKeys,
        thumbnailImageCount: post.thumbnailImageCount,
        order: featuredPost.order,
        position: featuredPost.position,
        postId: featuredPost.postId,
        title: post.title,
        version: post.version,
      })
      .from(featuredPost)
      .innerJoin(post, eq(post.id, featuredPost.postId))
      .orderBy(
        sql`CASE WHEN ${featuredPost.position} = 'main' THEN 0 ELSE 1 END`,
        featuredPost.order
      );
  }),

  getFeaturedSelectionPosts: permissionProcedure({
    posts: ["list"],
  })
    .input(z.object({ search: z.string().optional() }))
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Fetching featured selection posts${input.search ? ` with search: "${input.search}"` : ""}`
      );

      const conditions = [eq(post.type, "post"), eq(post.status, "publish")];

      if (input.search && input.search.trim() !== "") {
        conditions.push(sql`${post.title} % ${input.search.trim()}`);
      }

      const posts = await db
        .select({
          id: post.id,
          coverImageObjectKey: createPostCoverImageObjectKeySelect(),
          imageObjectKeys: post.imageObjectKeys,
          thumbnailImageCount: post.thumbnailImageCount,
          title: post.title,
          version: post.version,
        })
        .from(post)
        .where(and(...conditions))
        .orderBy(
          input.search && input.search.trim() !== ""
            ? sql`similarity(${post.title}, ${input.search.trim()}) DESC, ${post.createdAt} DESC`
            : sql`${post.createdAt} DESC`
        )
        .limit(50);

      return posts;
    }),

  getSelectedWeeklyPosts: permissionProcedure({
    posts: ["list"],
  }).handler(({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching currently selected weekly posts");

    return db
      .select({
        id: post.id,
        coverImageObjectKey: createPostCoverImageObjectKeySelect(),
        imageObjectKeys: post.imageObjectKeys,
        thumbnailImageCount: post.thumbnailImageCount,
        title: post.title,
        version: post.version,
      })
      .from(post)
      .where(and(eq(post.type, "post"), eq(post.isWeekly, true)));
  }),

  getWeeklySelectionPosts: permissionProcedure({
    posts: ["list"],
  })
    .input(z.object({ search: z.string().optional() }))
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(
        `Fetching weekly selection posts${input.search ? ` with search: "${input.search}"` : ""}`
      );

      const conditions = [eq(post.type, "post")];

      // Fuzzy search using pg_trgm (same pattern as public search endpoint)
      if (input.search && input.search.trim() !== "") {
        conditions.push(sql`${post.title} % ${input.search.trim()}`);
      }

      const posts = await db
        .select({
          id: post.id,
          coverImageObjectKey: createPostCoverImageObjectKeySelect(),
          imageObjectKeys: post.imageObjectKeys,
          thumbnailImageCount: post.thumbnailImageCount,
          isWeekly: post.isWeekly,
          similarity: sql<number>`similarity(${post.title}, ${input.search?.trim() || ""})`,
          title: post.title,
          version: post.version,
        })
        .from(post)
        .where(and(...conditions))
        .orderBy(
          input.search && input.search.trim() !== ""
            ? sql`similarity DESC, ${post.createdAt} DESC`
            : sql`${post.createdAt} DESC`
        );

      const result = posts.map(({ similarity: _, ...postData }) => postData);
      logger?.debug(`Retrieved ${result.length} weekly selection posts`);

      return result;
    }),
  uploadFeaturedPosts: permissionProcedure({
    posts: ["create"],
  })
    .input(
      z.object({
        mainPostId: z.string(),
        secondaryPostIds: z.array(z.string()).length(2),
      })
    )
    .handler(async ({ context: { db, ...ctx }, input, errors }) => {
      const logger = getLogger(ctx);
      logger?.info("Updating featured posts");

      const allPostIds = [input.mainPostId, ...input.secondaryPostIds];

      const existingPosts = await db
        .select({ id: post.id })
        .from(post)
        .where(
          and(
            inArray(post.id, allPostIds),
            eq(post.type, "post"),
            eq(post.status, "publish")
          )
        );

      if (existingPosts.length !== 3) {
        logger?.error("Not all selected posts are valid/published");
        throw errors.FORBIDDEN();
      }

      if (new Set(allPostIds).size !== 3) {
        logger?.error("Duplicate posts selected");
        throw errors.FORBIDDEN();
      }

      await db.transaction(async (tx) => {
        await tx.delete(featuredPost);
        logger?.debug("Cleared previous featured posts");

        await tx.insert(featuredPost).values([
          {
            order: 0,
            position: "main",
            postId: input.mainPostId,
          },
          {
            order: 1,
            position: "secondary",
            postId: input.secondaryPostIds[0]!,
          },
          {
            order: 2,
            position: "secondary",
            postId: input.secondaryPostIds[1]!,
          },
        ]);
        logger?.info("Successfully set 3 new featured posts");
      });
    }),

  uploadWeeklyPosts: permissionProcedure({
    posts: ["create"],
  })
    .input(z.array(z.string()).max(7))
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Uploading ${input.length} posts as weekly`);

      await db
        .update(post)
        .set({ isWeekly: false })
        .where(eq(post.isWeekly, true));
      logger?.debug("Cleared previous weekly posts");

      await db
        .update(post)
        .set({
          isWeekly: true,
        })
        .where(inArray(post.id, input));
      logger?.info(`Successfully set ${input.length} posts as weekly`);
    }),
};
