import { getLogger } from "@orpc/experimental-pino";
import {
  comicCreateSchema,
  comicEditSchema,
  contentEditImagesSchema,
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
  create: permissionProcedure({
    comics: ["create"],
  })
    .input(comicCreateSchema)
    .handler(createContent),

  createComicPrerequisites: permissionProcedure({
    comics: ["create"],
  }).handler(async ({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching comic creation prerequisites");

    const terms = await db.query.term.findMany();
    logger?.debug(`Retrieved ${terms.length} terms for prerequisites`);

    return {
      terms,
    };
  }),

  delete: permissionProcedure({
    comics: ["delete"],
  })
    .input(z.string())
    .handler(deleteContent),

  edit: permissionProcedure({
    comics: ["update"],
  })
    .input(comicEditSchema)
    .handler(editContent),

  editImages: permissionProcedure({
    comics: ["update"],
  })
    .input(contentEditImagesSchema)
    .handler(editContentImages),

  getDashboardList: permissionProcedure({
    comics: ["list"],
  }).handler(({ context: { db, ...ctx } }) => {
    const logger = getLogger(ctx);
    logger?.info("Fetching comic dashboard list");

    return db.query.post.findMany({
      columns: {
        id: true,
        status: true,
        title: true,
      },
      orderBy: (p, { desc }) => [desc(p.createdAt)],
      where: (p, { eq: equals }) => equals(p.type, "comic"),
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
    comics: ["update"],
  })
    .input(z.string())
    .handler(({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Fetching comic for editing: ${input}`);

      return db.query.post.findFirst({
        where: (p, { eq: equals }) => equals(p.id, input),
        with: {
          engagementOverrides: {
            orderBy: (table, { asc: ascOrder }) => [ascOrder(table.sortOrder)],
          },
          terms: {
            with: {
              term: true,
            },
          },
        },
      });
    }),

  insertImages: permissionProcedure({
    comics: ["create"],
  })
    .input(
      z.object({
        images: z.array(z.string()),
        postId: z.string(),
      })
    )
    .handler(insertContentImages),
};
