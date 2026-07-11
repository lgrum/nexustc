import { getLogger } from "@orpc/experimental-pino";
import { eq } from "@repo/db";
import type { tutorials as TutorialTable } from "@repo/db/schema/app";
import { tutorials } from "@repo/db/schema/app";
import { env } from "@repo/env";
import { webUrlSchema } from "@repo/shared/schemas";
import z from "zod";

import {
  fixedWindowRatelimitMiddleware,
  permissionProcedure,
  publicProcedure,
} from "../index";

type Tutorial = typeof TutorialTable.$inferSelect;

const shortenerResponseSchema = z.object({
  shortenedUrl: webUrlSchema,
  status: z.string(),
});

const shortenerProviders = [
  {
    name: "shrinkme.io",
    token: env.SHRINKME_TOKEN,
    url: "https://shrinkme.io/api",
  },
  {
    name: "shrinkearn.com",
    token: env.SHRINKEARN_TOKEN,
    url: "https://shrinkearn.com/api",
  },
  {
    name: "exe.io",
    token: env.EXE_TOKEN,
    url: "https://exe.io/api",
  },
] as const;
const shortenerCountSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

const shortenWithProvider = async ({
  logger,
  onError,
  provider,
  url,
}: {
  logger?: ReturnType<typeof getLogger>;
  onError: (message: string) => never;
  provider: (typeof shortenerProviders)[number];
  url: string;
}) => {
  const searchParams = new URLSearchParams({
    api: provider.token,
    url,
  });

  const requestUrl = `${provider.url}?${searchParams.toString()}`;
  logger?.info(`Calling shortener ${provider.name}`);

  const response = await (async (): Promise<Response> => {
    try {
      return await fetch(requestUrl);
    } catch (error) {
      logger?.error(`Network error calling ${provider.name}`);
      logger?.error(error);
      return onError(`No se pudo conectar con ${provider.name}.`);
    }
  })();

  if (!response.ok) {
    const responseBody = await response.text();
    logger?.error(
      `Shortener ${provider.name} returned ${response.status}: ${responseBody || "<empty body>"}`
    );
    onError(
      `El acortador ${provider.name} devolvio ${response.status}${responseBody ? `: ${responseBody}` : "."}`
    );
  }

  const payload = await (async (): Promise<
    z.infer<typeof shortenerResponseSchema>
  > => {
    try {
      return shortenerResponseSchema.parse(await response.json());
    } catch (error) {
      logger?.error(`Invalid response payload from ${provider.name}`);
      logger?.error(error);
      return onError(
        `La respuesta de ${provider.name} no tuvo el formato esperado.`
      );
    }
  })();

  if (payload.status !== "success") {
    logger?.error(
      `Shortener ${provider.name} returned non-success status: ${payload.status}`
    );
    onError(
      `El acortador ${provider.name} devolvio un estado invalido: ${payload.status}.`
    );
  }

  logger?.info(`Shortener ${provider.name} returned ${payload.shortenedUrl}`);
  return payload.shortenedUrl;
};

export default {
  createTutorial: permissionProcedure({
    posts: ["create"],
  })
    .input(
      z.object({
        description: z.string(),
        embedUrl: webUrlSchema,
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

  shortenUrl: permissionProcedure({
    shortener: ["use"],
  })
    .use(fixedWindowRatelimitMiddleware({ limit: 5, windowSeconds: 60 }))
    .input(
      z.object({
        shortenerCount: shortenerCountSchema.default(3),
        url: webUrlSchema,
      })
    )
    .handler(async ({ context: ctx, errors, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Shortening URL: ${input.url}`);

      let shortenedUrl = input.url;
      const selectedProviders = shortenerProviders.slice(-input.shortenerCount);

      try {
        for (const provider of selectedProviders) {
          shortenedUrl = await shortenWithProvider({
            logger,
            onError: (message) => {
              throw errors.INTERNAL_SERVER_ERROR({ message });
            },
            provider,
            url: shortenedUrl,
          });
        }
      } catch (error) {
        logger?.error(`Failed to shorten URL: ${input.url}`);
        logger?.error(error);
        throw error;
      }

      logger?.info(`URL shortened successfully: ${shortenedUrl}`);
      return { shortenedUrl };
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
