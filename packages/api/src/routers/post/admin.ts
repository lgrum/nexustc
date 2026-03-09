import { getLogger } from "@orpc/experimental-pino";
import { and, eq, inArray, sql } from "@repo/db";
import { featuredPost, post } from "@repo/db/schema/app";
import {
  contentCreateSchema,
  contentEditImagesSchema,
  contentEditSchema,
} from "@repo/shared/schemas";
import z from "zod";
import { permissionProcedure } from "../../index";
import {
  createContent,
  deleteContent,
  editContent,
  editContentImages,
  insertContentImages,
} from "../../utils/content-handlers";

export default {
  getEdit: permissionProcedure({
    posts: ["update"],
  })
    .input(z.string())
    .handler(({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching post for editing: ${input}`);

      return db.query.post.findFirst({
        where: eq(post.id, input),
        with: {
          terms: {
            with: {
              term: true,
            },
          },
          engagementOverrides: {
            orderBy: (table, { asc }) => [asc(table.sortOrder)],
          },
        },
      });
    }),

  getDashboardList: permissionProcedure({
    posts: ["list"],
  }).handler(({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching post dashboard list");

    return db.query.post.findMany({
      columns: {
        id: true,
        title: true,
        status: true,
      },
      where: (p, { eq: equals }) => equals(p.type, "post"),
      with: {
        terms: {
          with: {
            term: true,
          },
        },
      },
      orderBy: (p, { desc }) => [desc(p.createdAt)],
    });
  }),

  createPostPrerequisites: permissionProcedure({
    posts: ["list"],
  }).handler(async ({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching post creation prerequisites");

    const terms = await db.query.term.findMany();
    logger?.debug(`Retrieved ${terms.length} terms for prerequisites`);

    return {
      terms,
    };
  }),

  create: permissionProcedure({
    posts: ["create"],
  })
    .input(contentCreateSchema)
    .handler(createContent),

  edit: permissionProcedure({
    posts: ["update"],
  })
    .input(contentEditSchema)
    .handler(editContent),

  editImages: permissionProcedure({
    posts: ["update"],
  })
    .input(contentEditImagesSchema)
    .handler(editContentImages),

  delete: permissionProcedure({
    posts: ["delete"],
  })
    .input(z.string())
    .handler(deleteContent),

  insertImages: permissionProcedure({
    posts: ["create"],
  })
    .input(
      z.object({
        postId: z.string(),
        images: z.array(z.string()),
      })
    )
    .handler(insertContentImages),

  uploadWeeklyPosts: permissionProcedure({
    posts: ["create"],
  })
    .input(z.array(z.string()))
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
          title: post.title,
          version: post.version,
          imageObjectKeys: post.imageObjectKeys,
          isWeekly: post.isWeekly,
          similarity: sql<number>`similarity(${post.title}, ${input.search?.trim() || ""})`,
        })
        .from(post)
        .where(and(...conditions))
        .orderBy(
          input.search && input.search.trim() !== ""
            ? sql`similarity DESC, ${post.createdAt} DESC`
            : sql`${post.createdAt} DESC`
        );

      const result = posts.map(({ similarity, ...postData }) => postData);
      logger?.debug(`Retrieved ${result.length} weekly selection posts`);

      return result;
    }),

  getSelectedWeeklyPosts: permissionProcedure({
    posts: ["list"],
  }).handler(({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching currently selected weekly posts");

    return db
      .select({
        id: post.id,
        title: post.title,
        version: post.version,
        imageObjectKeys: post.imageObjectKeys,
      })
      .from(post)
      .where(and(eq(post.type, "post"), eq(post.isWeekly, true)));
  }),

  getFeaturedPosts: permissionProcedure({
    posts: ["list"],
  }).handler(({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching currently featured posts");

    return db
      .select({
        id: featuredPost.id,
        postId: featuredPost.postId,
        position: featuredPost.position,
        order: featuredPost.order,
        title: post.title,
        version: post.version,
        imageObjectKeys: post.imageObjectKeys,
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
          title: post.title,
          version: post.version,
          imageObjectKeys: post.imageObjectKeys,
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
            postId: input.mainPostId,
            position: "main",
            order: 0,
          },
          {
            postId: input.secondaryPostIds[0]!,
            position: "secondary",
            order: 1,
          },
          {
            postId: input.secondaryPostIds[1]!,
            position: "secondary",
            order: 2,
          },
        ]);
        logger?.info("Successfully set 3 new featured posts");
      });
    }),
};
