import { getLogger } from "@orpc/experimental-pino";
import { eq } from "@repo/db";
import type { tutorials as TutorialTable } from "@repo/db/schema/app";
import { tutorials } from "@repo/db/schema/app";
import { env } from "@repo/env";
import { customAlphabet } from "nanoid/non-secure";
import z from "zod";

import {
  fixedWindowRatelimitMiddleware,
  permissionProcedure,
  publicProcedure,
} from "../index";

const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  9
);

type Tutorial = typeof TutorialTable.$inferSelect;

const HTML_TITLE_REGEX = /<title[^>]*>([\s\S]*?)<\/title>/i;
const META_TITLE_REGEXES = [
  /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']title["'][^>]*>/i,
] as const;
const shortenerResponseSchema = z.object({
  shortenedUrl: z.url(),
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

const decodeHtmlEntities = (value: string): string =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");

const normalizeAlias = (value: string | null): string | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036F]/g, "")
    .replaceAll(/[^a-zA-Z0-9\s-]/g, " ")
    .trim()
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-")
    .toLowerCase()
    .slice(0, 20);

  return normalized.length > 0 ? normalized : undefined;
};

const getTitleMatch = (html: string): string | null => {
  for (const regex of META_TITLE_REGEXES) {
    const match = html.match(regex)?.[1];

    if (match) {
      return decodeHtmlEntities(match).trim();
    }
  }

  const titleMatch = html.match(HTML_TITLE_REGEX)?.[1];
  return titleMatch ? decodeHtmlEntities(titleMatch).trim() : null;
};

const getAliasFromUrl = async (url: string): Promise<string | undefined> => {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; NeXusTC URLShortener/1.0; +https://nexustc18.com)",
      },
    });

    if (!response.ok) {
      return undefined;
    }

    const html = await response.text();
    return `${normalizeAlias(getTitleMatch(html))}-${nanoid()}`;
  } catch {
    return undefined;
  }
};

const shortenWithProvider = async ({
  alias,
  logger,
  onError,
  provider,
  url,
}: {
  alias?: string;
  logger?: ReturnType<typeof getLogger>;
  onError: (message: string) => never;
  provider: (typeof shortenerProviders)[number];
  url: string;
}) => {
  const searchParams = new URLSearchParams({
    api: provider.token,
    url,
  });

  if (alias) {
    searchParams.set("alias", alias);
  }

  const requestUrl = `${provider.url}?${searchParams.toString()}`;
  logger?.info(
    `Calling shortener ${provider.name} with alias ${alias ? `"${alias}"` : "none"}`
  );

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

  shortenUrl: permissionProcedure({
    shortener: ["use"],
  })
    .use(fixedWindowRatelimitMiddleware({ limit: 5, windowSeconds: 60 }))
    .input(
      z.object({
        shortenerCount: shortenerCountSchema.default(3),
        url: z.url(),
      })
    )
    .handler(async ({ context: ctx, errors, input }) => {
      const logger = getLogger(ctx);
      logger?.info(`Shortening URL: ${input.url}`);

      const alias = await getAliasFromUrl(input.url);
      logger?.info(
        `Resolved alias for shortening: ${alias ? `"${alias}"` : "not available"}`
      );
      let shortenedUrl = input.url;
      const selectedProviders = shortenerProviders.slice(-input.shortenerCount);

      try {
        for (const provider of selectedProviders) {
          shortenedUrl = await shortenWithProvider({
            alias,
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
