import z from "zod";

export const COMIC_PAGE_COUNT_FILTER_MAX = 200;
export const COMIC_PAGE_COUNT_FILTER_MIN = 1;

export const ORDER_OPTIONS = [
  { label: "Más Recientes", value: "newest" },
  { label: "Más Vistos", value: "views" },
  { label: "Más Antiguos", value: "oldest" },
  { label: "Título (A-Z)", value: "title_asc" },
  { label: "Título (Z-A)", value: "title_desc" },
  { label: "Mejor Valorados", value: "rating_avg" },
  { label: "Más Valoraciones", value: "rating_count" },
  { label: "Más Likes", value: "likes" },
] as const;

export const orderBySchema = z.enum([
  "newest",
  "oldest",
  "title_asc",
  "title_desc",
  "views",
  "rating_avg",
  "rating_count",
  "likes",
]);

export const gameSearchParamsSchema = z.object({
  engine: z.array(z.string()).optional().default([]),
  graphics: z.array(z.string()).optional().default([]),
  orderBy: orderBySchema.optional().default("newest"),
  page: z.coerce.number().int().min(1).optional().default(1),
  platform: z.array(z.string()).optional().default([]),
  query: z.string().optional(),
  status: z.array(z.string()).optional().default([]),
  tag: z.array(z.string()).optional().default([]),
});

export const comicSearchParamsSchema = z.object({
  maxPages: z.coerce
    .number()
    .int()
    .min(COMIC_PAGE_COUNT_FILTER_MIN)
    .max(COMIC_PAGE_COUNT_FILTER_MAX)
    .optional(),
  minPages: z.coerce
    .number()
    .int()
    .min(COMIC_PAGE_COUNT_FILTER_MIN)
    .max(COMIC_PAGE_COUNT_FILTER_MAX)
    .optional(),
  orderBy: orderBySchema.optional().default("newest"),
  page: z.coerce.number().int().min(1).optional().default(1),
  query: z.string().optional(),
  tag: z.array(z.string()).optional().default([]),
});

export type GameSearchParams = z.infer<typeof gameSearchParamsSchema>;
export type ComicSearchParams = z.infer<typeof comicSearchParamsSchema>;

export function getGameFilterCount(params: GameSearchParams) {
  return [
    params.query ? [params.query] : [],
    params.engine ?? [],
    params.graphics ?? [],
    params.platform ?? [],
    params.status ?? [],
    params.tag ?? [],
  ].reduce((count, values) => count + values.length, 0);
}

export function getComicFilterCount(params: ComicSearchParams) {
  const hasPageCountFilter =
    params.minPages !== undefined || params.maxPages !== undefined;

  return [
    params.query ? [params.query] : [],
    params.tag ?? [],
    hasPageCountFilter ? ["page-count"] : [],
  ].reduce((count, values) => count + values.length, 0);
}

export function getGameTermIds(params: GameSearchParams) {
  return [
    ...(params.engine ?? []),
    ...(params.graphics ?? []),
    ...(params.status ?? []),
    ...(params.platform ?? []),
    ...(params.tag ?? []),
  ];
}

export function getComicTermIds(params: ComicSearchParams) {
  return params.tag ?? [];
}
