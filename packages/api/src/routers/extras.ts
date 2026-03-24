import { getLogger } from "@orpc/experimental-pino";
import { eq } from "@repo/db";
import type { tutorials as TutorialTable } from "@repo/db/schema/app";
import { tutorials } from "@repo/db/schema/app";
import z from "zod";

import { permissionProcedure, publicProcedure } from "../index";

type Tutorial = typeof TutorialTable.$inferSelect;

export default {
  createTutorial: permissionProcedure({
    posts: ["create"],
  })
    .input(
      z.object({
        description: z.string(),
        embedUrl: z.url(),
        title: z.string(),
      })
    )
    .handler(async ({ context: { db, ...ctx }, input }): Promise<void> => {
      const logger = getLogger(ctx);
      logger?.info(`Creating new tutorial: "${input.title}"`);

      await db.insert(tutorials).values(input);
      logger?.info(`Tutorial successfully created: ${input.title}`);
    }),

  deleteTutorial: permissionProcedure({
    posts: ["delete"],
  })
    .input(z.object({ id: z.string() }))
    .handler(async ({ context: { db, ...ctx }, input }) => {
      const logger = getLogger(ctx);
      logger?.debug(`Deleting tutorial: ${input.id}`);

      await db.delete(tutorials).where(eq(tutorials.id, input.id));
      logger?.info(`Tutorial ${input.id} deleted successfully`);
    }),

  getTutorials: publicProcedure.handler(
    async ({ context: { db, ...ctx } }): Promise<Tutorial[]> => {
      const logger = getLogger(ctx);
      logger?.info("Fetching tutorials");

      const result = await db.query.tutorials.findMany();

      logger?.debug(`Retrieved ${result.length} tutorials`);
      return result;
    }
  ),
};
