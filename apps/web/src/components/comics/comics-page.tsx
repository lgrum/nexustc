import {
  ArrowRight01Icon,
  Book02Icon,
  Book03Icon,
  Crown02Icon,
  DiceFaces05Icon,
  FavouriteIcon,
  Fire03Icon,
  StarIcon,
  Tag01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import Autoplay from "embla-carousel-autoplay";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { PostCard } from "@/components/landing/post-card";
import type { PostProps } from "@/components/landing/post-card";
import {
  getComicFilterCount,
  orderBySchema,
} from "@/components/search/catalog-search";
import type { comicSearchParamsSchema } from "@/components/search/catalog-search";
import {
  formatCount,
  LIBRARY_TOOLBAR_CLASS,
  LibraryEmptyState,
  LibrarySearchInput,
  MultiSelectPopover,
  SectionHeader,
  SelectedChipsRow,
  SortControl,
} from "@/components/search/library-shared";
import { TermBadge } from "@/components/term-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import type { CarouselApi } from "@/components/ui/carousel";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppForm } from "@/hooks/use-app-form";
import { useDebounceEffect } from "@/hooks/use-debounce-effect";
import { useTerms } from "@/hooks/use-terms";
import { orpcClient } from "@/lib/orpc";
import { getThumbnailImageObjectKeys } from "@/lib/post-images";
import { cn, getBucketUrl } from "@/lib/utils";

const HERO_PAGINATE_DELAY_MS = 7000;
const TOP_RANK_LIMIT = 10;
const TRENDING_LIMIT = 14;
const GENRE_STRIP_LIMIT = 14;

type ComicSearchParams = z.infer<typeof comicSearchParamsSchema>;

type ComicsPageProps = {
  params: ComicSearchParams;
  filteredPosts: PostProps[];
  onSearchChange: (params: ComicSearchParams) => void;
  onRandomSelect: (id: string) => void;
};

export function ComicsPage({
  params,
  filteredPosts,
  onSearchChange,
  onRandomSelect,
}: ComicsPageProps) {
  const popularQuery = useQuery({
    queryFn: () =>
      orpcClient.post.search({
        orderBy: "views",
        type: "comic",
      }),
    queryKey: ["comics", "popular"],
    staleTime: 1000 * 60 * 10,
  });

  const trendingQuery = useQuery({
    queryFn: () =>
      orpcClient.post.search({
        orderBy: "likes",
        type: "comic",
      }),
    queryKey: ["comics", "trending"],
    staleTime: 1000 * 60 * 10,
  });

  const handleRandomComic = async () => {
    const result = await orpcClient.post.getRandom({ type: "comic" });
    if (result) {
      onRandomSelect(result.id);
    }
  };

  const popular = popularQuery.data ?? [];
  const trending = trendingQuery.data ?? [];

  return (
    <main className="flex w-full flex-col">
      <ComicsHero
        loading={popularQuery.isPending}
        posts={popular}
        onRandom={handleRandomComic}
      />

      <div className="mt-10 px-1 md:px-3">
        <ComicsTopRanks loading={popularQuery.isPending} posts={popular} />
      </div>

      <div className="mt-12 px-1 md:px-3">
        <ComicsTrending loading={trendingQuery.isPending} posts={trending} />
      </div>

      <div className="mt-10 px-1 md:px-3">
        <ComicsGenreStrip />
      </div>

      <div className="mt-12 mb-12 px-1 md:px-3">
        <ComicsLibrary
          params={params}
          posts={filteredPosts}
          onSearchChange={onSearchChange}
          onRandom={handleRandomComic}
        />
      </div>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Hero                                    */
/* -------------------------------------------------------------------------- */

function ComicsHero({
  loading,
  posts,
  onRandom,
}: {
  loading: boolean;
  posts: PostProps[];
  onRandom: () => void;
}) {
  const top = posts.slice(0, 5);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (top.length <= 1) {
      return;
    }
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % top.length);
    }, HERO_PAGINATE_DELAY_MS);
    return () => window.clearInterval(id);
  }, [top.length]);

  if (loading) {
    return <HeroSkeleton />;
  }

  if (top.length === 0) {
    return <HeroEmpty />;
  }

  const featured = top[active] ?? top[0]!;
  const cover = pickCover(featured);
  const tags = pickTopTags(featured, 3);
  const totalRated = featured.averageRating ?? 0;

  return (
    <section
      aria-label="Comic destacado"
      className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-card/40 shadow-[0_50px_120px_-60px_oklch(0.795_0.184_86.047/0.5)]"
    >
      {/* Backdrop: blurred + saturated cover */}
      <div className="pointer-events-none absolute inset-0">
        {cover ? (
          <img
            alt=""
            aria-hidden
            className="h-full w-full object-cover saturate-[1.4] blur-2xl scale-110 opacity-50 transition-opacity duration-700"
            key={featured.id}
            src={cover}
          />
        ) : (
          <div className="h-full w-full bg-linear-to-br from-[oklch(0.25_0.05_280)] via-[oklch(0.2_0.08_320)] to-[oklch(0.15_0.04_200)]" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/80 to-background/30" />
        <div className="absolute inset-0 bg-linear-to-r from-background via-background/55 to-transparent" />
        {/* Halftone — comic-book texture */}
        <div
          className="absolute inset-0 mix-blend-overlay opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.18) 1px, transparent 1px)",
            backgroundSize: "9px 9px",
            maskImage: "linear-gradient(115deg, black 0%, transparent 65%)",
          }}
        />
        {/* Warm radial glow top-right */}
        <div className="absolute -top-1/3 -right-1/4 h-[80%] w-[60%] rounded-full bg-[radial-gradient(closest-side,oklch(0.795_0.184_86.047/0.32),transparent_70%)]" />
      </div>

      <div className="relative grid gap-8 px-5 py-8 md:grid-cols-[1.1fr_0.9fr] md:gap-12 md:px-10 md:py-12 lg:px-14 lg:py-14">
        {/* Left — editorial copy */}
        <div className="flex min-w-0 flex-col justify-center">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-background/40 px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-primary backdrop-blur-md">
            <HugeiconsIcon className="size-3" icon={Crown02Icon} />
            <span>Top Cómics · Más Leídos</span>
          </div>

          <h1
            className="display-heading mt-5 text-balance text-[clamp(2.4rem,5vw,4rem)] leading-[0.98] text-foreground"
            key={`title-${featured.id}`}
          >
            <span className="bg-linear-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent drop-shadow-[0_2px_18px_rgba(0,0,0,0.45)]">
              {featured.title}
            </span>
          </h1>

          {tags.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <Link
                  className="contents"
                  key={tag.id}
                  preload={false}
                  resetScroll={false}
                  search={{ tag: [tag.id] }}
                  to="/comics"
                >
                  <TermBadge tag={tag} />
                </Link>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 font-[Lexend] text-sm tabular-nums text-muted-foreground">
            <Stat icon={ViewIcon} value={formatCount(featured.views)} />
            <Stat
              icon={FavouriteIcon}
              tone="rose"
              value={formatCount(featured.likes)}
            />
            {totalRated > 0 && (
              <Stat
                icon={StarIcon}
                tone="amber"
                value={totalRated.toFixed(1)}
              />
            )}
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button
              className="h-11 rounded-xl bg-primary px-5 font-semibold text-[14px] text-primary-foreground shadow-[0_18px_40px_-18px_oklch(0.795_0.184_86.047/0.95)] hover:bg-primary/90"
              render={<Link params={{ id: featured.id }} to="/post/$id" />}
            >
              <HugeiconsIcon className="size-4" icon={Book02Icon} />
              Leer ahora
              <HugeiconsIcon className="size-4" icon={ArrowRight01Icon} />
            </Button>
            <Button
              className="h-11 rounded-xl border-white/15 bg-background/40 px-4 font-semibold text-[14px] backdrop-blur-md hover:bg-background/70"
              onClick={onRandom}
              type="button"
              variant="outline"
            >
              <HugeiconsIcon className="size-4" icon={DiceFaces05Icon} />
              Sorpréndeme
            </Button>
          </div>

          {/* Pagination dots when more than 1 featured */}
          {top.length > 1 && (
            <div className="mt-8 flex items-center gap-2">
              {top.map((p, idx) => (
                <button
                  aria-label={`Ver destacado ${idx + 1}: ${p.title}`}
                  className={cn(
                    "h-1 rounded-full transition-all duration-500 ease-out",
                    idx === active
                      ? "w-10 bg-primary"
                      : "w-3 bg-white/20 hover:bg-white/40"
                  )}
                  key={p.id}
                  onClick={() => setActive(idx)}
                  type="button"
                />
              ))}
              <span className="ml-2 font-mono text-[11px] tracking-widest text-muted-foreground tabular-nums">
                {String(active + 1).padStart(2, "0")} /{" "}
                {String(top.length).padStart(2, "0")}
              </span>
            </div>
          )}
        </div>

        {/* Right — poster */}
        <div className="relative min-w-0">
          <HeroPoster post={featured} />
        </div>
      </div>
    </section>
  );
}

function HeroPoster({ post }: { post: PostProps }) {
  const cover = pickCover(post);

  return (
    <Link
      className="group relative mx-auto block aspect-[3/4] w-[min(360px,75%)] md:w-[min(420px,100%)]"
      params={{ id: post.id }}
      preload={false}
      to="/post/$id"
    >
      {/* Aura behind the poster */}
      <div className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-[radial-gradient(closest-side,oklch(0.795_0.184_86.047/0.4),transparent_75%)] blur-2xl opacity-90 transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/15 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7)] transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:-rotate-1 group-hover:scale-[1.02]">
        {cover ? (
          <img
            alt={post.title}
            className="h-full w-full object-cover"
            src={cover}
          />
        ) : (
          <div className="h-full w-full bg-linear-to-br from-[oklch(0.25_0.05_280)] via-[oklch(0.2_0.08_320)] to-[oklch(0.15_0.04_200)]" />
        )}
        {/* Glossy top sheen */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-2/5 bg-linear-to-b from-white/15 to-transparent" />
        {/* Bottom shadow */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-black/60 to-transparent" />

        {/* Corner rank */}
        <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-black/55 px-2 py-1 font-[Lexend] text-[10px] font-bold uppercase tracking-[0.18em] text-primary backdrop-blur-md">
          <HugeiconsIcon className="size-3" icon={Crown02Icon} />
          #1
        </div>

        {/* Hover affordance */}
        <div className="absolute right-3 bottom-3 inline-flex size-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white opacity-0 backdrop-blur-md transition-all duration-300 group-hover:translate-x-0 translate-x-1 group-hover:opacity-100">
          <HugeiconsIcon className="size-4" icon={ArrowRight01Icon} />
        </div>
      </div>
    </Link>
  );
}

function HeroSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-card/40">
      <div className="grid gap-8 px-5 py-8 md:grid-cols-[1.1fr_0.9fr] md:gap-12 md:px-10 md:py-12 lg:px-14 lg:py-14">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-5 w-44 rounded-full" />
          <Skeleton className="h-12 w-3/4 rounded-2xl" />
          <Skeleton className="h-12 w-2/3 rounded-2xl" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-full" />
          </div>
          <div className="mt-2 flex gap-3">
            <Skeleton className="h-11 w-32 rounded-xl" />
            <Skeleton className="h-11 w-36 rounded-xl" />
          </div>
        </div>
        <div className="mx-auto aspect-[3/4] w-[min(360px,75%)] md:w-[min(420px,100%)]">
          <Skeleton className="h-full w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function HeroEmpty() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-card/40 px-6 py-14 text-center shadow-[0_30px_80px_-40px_oklch(0.795_0.184_86.047/0.4)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(closest-side,oklch(0.795_0.184_86.047/0.18),transparent_75%)]" />
      <HugeiconsIcon
        className="relative mx-auto size-10 text-primary/80"
        icon={Book03Icon}
      />
      <h1 className="display-heading relative mx-auto mt-4 max-w-md text-balance text-3xl text-foreground md:text-4xl">
        Tu próximo cómic favorito espera
      </h1>
      <p className="relative mx-auto mt-2 max-w-md text-muted-foreground text-sm">
        Aún no hay destacados. Vuelve pronto, estamos curando una selección.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Top Ranks (Top 10)                            */
/* -------------------------------------------------------------------------- */

function ComicsTopRanks({
  loading,
  posts,
}: {
  loading: boolean;
  posts: PostProps[];
}) {
  const ranked = posts.slice(0, TOP_RANK_LIMIT);

  return (
    <section aria-label="Top 10 cómics" className="space-y-4">
      <SectionHeader
        eyebrow="Ranking"
        icon={Crown02Icon}
        subtitle="Los más leídos por la comunidad"
        title="Top 10 de la semana"
      />

      {loading && <RankSkeleton />}

      {!loading && ranked.length === 0 && (
        <p className="rounded-xl border border-dashed border-white/10 bg-card/30 p-6 text-center text-muted-foreground text-sm">
          Aún no hay datos de ranking suficientes.
        </p>
      )}

      {!loading && ranked.length > 0 && (
        <ol className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {ranked.map((post, index) => (
            <RankItem key={post.id} post={post} rank={index + 1} />
          ))}
        </ol>
      )}
    </section>
  );
}

function RankItem({ post, rank }: { post: PostProps; rank: number }) {
  const cover = pickCover(post);
  const isPodium = rank <= 3;
  const rankLabel = String(rank).padStart(2, "0");

  return (
    <li>
      <Link
        className="group block h-full"
        params={{ id: post.id }}
        preload={false}
        to="/post/$id"
      >
        <article className="card-hover relative h-full overflow-hidden rounded-2xl border border-white/10 bg-card shadow-lg">
          <div className="relative aspect-3/4 overflow-hidden">
            {cover ? (
              <img
                alt={post.title}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:scale-[1.06]"
                src={cover}
              />
            ) : (
              <div className="absolute inset-0 bg-linear-to-br from-[oklch(0.25_0.05_280)] via-[oklch(0.2_0.08_320)] to-[oklch(0.15_0.04_200)]" />
            )}

            {/* Cinematic floor */}
            <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/90 via-black/35 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-linear-to-b from-black/40 to-transparent" />

            {/* Editorial rank numeral — overlapping bottom-left */}
            <span
              aria-hidden
              className={cn(
                "display-heading pointer-events-none absolute left-2 bottom-1 select-none font-extrabold text-[44px] leading-[0.8] tracking-tighter drop-shadow-[0_4px_18px_rgba(0,0,0,0.85)] md:text-[66px]",
                isPodium ? "text-primary/90" : "text-white/65"
              )}
              style={{
                WebkitTextStroke: isPodium
                  ? "1px oklch(0.795 0.184 86.047 / 0.55)"
                  : "1px rgba(255,255,255,0.2)",
                textShadow: isPodium
                  ? "0 0 32px oklch(0.795 0.184 86.047 / 0.55), 0 2px 6px rgba(0,0,0,0.7)"
                  : "0 0 24px rgba(0,0,0,0.55), 0 2px 6px rgba(0,0,0,0.7)",
              }}
            >
              {rankLabel}
            </span>

            {/* Podium pill */}
            {isPodium && (
              <div className="absolute right-2.5 top-2.5 aspect-square inline-flex items-center gap-1 rounded-full border border-primary/45 bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary backdrop-blur-md">
                <HugeiconsIcon className="size-4" icon={Crown02Icon} />
              </div>
            )}

            {/* Bottom content block — pulled right of the numeral */}
            <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-end p-3.5 pl-[44%]">
              <div className="min-w-0 text-right">
                <h3 className="display-heading line-clamp-2 text-balance text-[14px] leading-[1.18] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]">
                  {post.title}
                </h3>
                <div className="mt-1.5 flex items-center justify-end gap-2 text-[11px] tabular-nums text-white/75">
                  <span className="inline-flex items-center gap-1">
                    <HugeiconsIcon
                      className="size-3 opacity-90"
                      icon={ViewIcon}
                    />
                    {formatCount(post.views)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <HugeiconsIcon className="size-3" icon={FavouriteIcon} />
                    {formatCount(post.likes)}
                  </span>
                  {post.averageRating !== undefined &&
                    post.averageRating > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-300">
                        <HugeiconsIcon className="size-3" icon={StarIcon} />
                        {post.averageRating.toFixed(1)}
                      </span>
                    )}
                </div>
              </div>
            </div>
          </div>
        </article>
      </Link>
    </li>
  );
}

function RankSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: TOP_RANK_LIMIT }).map((_, i) => (
        <Skeleton
          className="aspect-[3/4] w-full rounded-2xl"
          // oxlint-disable-next-line react/no-array-index-key static skeleton placeholders
          key={i}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Trending — Carousel                             */
/* -------------------------------------------------------------------------- */

function ComicsTrending({
  loading,
  posts,
}: {
  loading: boolean;
  posts: PostProps[];
}) {
  const trending = posts.slice(0, TRENDING_LIMIT);
  const [api, setApi] = useState<CarouselApi | undefined>();
  const [snaps, setSnaps] = useState<number[]>([]);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!api) {
      return;
    }
    setSnaps(api.scrollSnapList());
    setSelected(api.selectedScrollSnap());
    const onSelect = () => setSelected(api.selectedScrollSnap());
    const onReInit = () => {
      setSnaps(api.scrollSnapList());
      setSelected(api.selectedScrollSnap());
    };
    api.on("select", onSelect);
    api.on("reInit", onReInit);
    return () => {
      api.off?.("select", onSelect);
      api.off?.("reInit", onReInit);
    };
  }, [api]);

  return (
    <section aria-label="Cómics en tendencia" className="space-y-4">
      <SectionHeader
        eyebrow="Tendencia"
        icon={Fire03Icon}
        subtitle="Lo que la comunidad no puede dejar de leer"
        title="En llamas ahora mismo"
        accentClassName="text-rose-400"
        accentHaloClassName="bg-rose-500/40"
      />

      {loading && <TrendingSkeleton />}

      {!loading && trending.length === 0 && (
        <p className="rounded-xl border border-dashed border-white/10 bg-card/30 p-6 text-center text-muted-foreground text-sm">
          Aún no hay tendencias para mostrar.
        </p>
      )}

      {!loading && trending.length > 0 && (
        <div className="-mx-1 md:mx-0">
          <Carousel
            opts={{
              align: "start",
              dragFree: true,
              loop: true,
            }}
            plugins={[
              Autoplay({
                delay: 4500,
                stopOnInteraction: false,
              }),
            ]}
            setApi={setApi}
          >
            <CarouselContent className="-ml-3">
              {trending.map((post, index) => (
                <CarouselItem
                  className="basis-[58%] pl-3 sm:basis-[38%] md:basis-[28%] lg:basis-[22%] xl:basis-[18%]"
                  key={post.id}
                >
                  <TrendingCard post={post} rank={index + 1} />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          {snaps.length > 1 && (
            <div className="mt-4 flex items-center justify-center gap-1.5">
              {snaps.map((_, i) => (
                <button
                  aria-label={`Ir al slide ${i + 1}`}
                  className={cn(
                    "h-1 rounded-full transition-all duration-300",
                    i === selected
                      ? "w-6 bg-rose-400"
                      : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  )}
                  // oxlint-disable-next-line react/no-array-index-key
                  key={i}
                  onClick={() => api?.scrollTo(i)}
                  type="button"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TrendingCard({ post, rank }: { post: PostProps; rank: number }) {
  const cover = pickCover(post);

  return (
    <Link
      className="group block h-full"
      params={{ id: post.id }}
      preload={false}
      to="/post/$id"
    >
      <article className="card-hover relative h-full overflow-hidden rounded-2xl border border-white/10 bg-card shadow-lg">
        <div className="relative aspect-[3/4] overflow-hidden">
          {cover ? (
            <img
              alt={post.title}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:scale-[1.06]"
              src={cover}
            />
          ) : (
            <div className="absolute inset-0 bg-linear-to-br from-[oklch(0.25_0.05_280)] via-[oklch(0.2_0.08_320)] to-[oklch(0.15_0.04_200)]" />
          )}

          {/* Cinematic floor */}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/25 to-transparent" />

          {/* Trending pill */}
          <div className="absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full border border-rose-400/50 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-100 backdrop-blur-md">
            <HugeiconsIcon className="size-2.5" icon={Fire03Icon} />
            <span>#{rank}</span>
          </div>

          {/* Bottom block */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-3.5">
            <h3 className="display-heading line-clamp-2 text-balance text-[15px] leading-[1.18] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">
              {post.title}
            </h3>
            <div className="mt-1.5 flex items-center gap-2.5 text-[11px] tabular-nums text-white/75">
              <span className="inline-flex items-center gap-1">
                <HugeiconsIcon className="size-3" icon={FavouriteIcon} />
                {formatCount(post.likes)}
              </span>
              <span className="inline-flex items-center gap-1">
                <HugeiconsIcon className="size-3 opacity-90" icon={ViewIcon} />
                {formatCount(post.views)}
              </span>
              {post.averageRating !== undefined && post.averageRating > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <HugeiconsIcon className="size-3" icon={StarIcon} />
                  {post.averageRating.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </div>
      </article>
    </Link>
  );
}

function TrendingSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton
          className="aspect-[3/4] w-[180px] shrink-0 rounded-2xl"
          // oxlint-disable-next-line react/no-array-index-key static skeleton placeholders
          key={i}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Genre Strip                                 */
/* -------------------------------------------------------------------------- */

function ComicsGenreStrip() {
  const termsQuery = useTerms();

  const genreTags = useMemo(() => {
    const all = termsQuery.data ?? [];
    return all
      .filter((term) => term.taxonomy === "tag")
      .slice(0, GENRE_STRIP_LIMIT);
  }, [termsQuery.data]);

  if (termsQuery.isPending) {
    return (
      <section aria-label="Géneros" className="space-y-3">
        <SectionHeader
          eyebrow="Géneros"
          icon={Tag01Icon}
          subtitle="Filtra por estilo, tono o temática"
          title="Explora por género"
        />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              className="h-8 w-24 rounded-full"
              // oxlint-disable-next-line react/no-array-index-key static skeleton placeholders
              key={i}
            />
          ))}
        </div>
      </section>
    );
  }

  if (genreTags.length === 0) {
    return null;
  }

  return (
    <section aria-label="Géneros" className="space-y-3">
      <SectionHeader
        eyebrow="Géneros"
        icon={Tag01Icon}
        subtitle="Filtra por estilo, tono o temática"
        title="Explora por género"
      />
      <div className="flex flex-wrap gap-1.5">
        {genreTags.map((tag) => (
          <Link
            className="contents"
            key={tag.id}
            preload={false}
            resetScroll={false}
            search={{ tag: [tag.id] }}
            to="/comics"
          >
            <TermBadge tag={tag} />
          </Link>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Library                                   */
/* -------------------------------------------------------------------------- */

function ComicsLibrary({
  params,
  posts,
  onSearchChange,
  onRandom,
}: {
  params: ComicSearchParams;
  posts: PostProps[];
  onSearchChange: (params: ComicSearchParams) => void;
  onRandom: () => void;
}) {
  const activeFilterCount = getComicFilterCount(params);
  const isFiltered = activeFilterCount > 0;

  return (
    <section aria-label="Biblioteca de cómics" className="space-y-5">
      <SectionHeader
        eyebrow="Biblioteca"
        icon={Book03Icon}
        subtitle={
          isFiltered
            ? `${posts.length} resultados con tus filtros`
            : "Lo último publicado, ordenado por novedad"
        }
        title={isFiltered ? "Tu selección" : "Recién publicados"}
        rightSlot={
          <Badge
            className="rounded-full border-primary/30 bg-primary/10 text-primary"
            variant="outline"
          >
            {activeFilterCount === 1
              ? "1 filtro activo"
              : `${activeFilterCount} filtros activos`}
          </Badge>
        }
      />

      <ComicsLibraryToolbar
        onRandom={onRandom}
        onSearchChange={onSearchChange}
        params={params}
      />

      <div className="glow-line" />

      {posts.length === 0 ? (
        <LibraryEmptyState
          filteredMessage="Prueba con otra combinación de tags o quita la búsqueda."
          isFiltered={isFiltered}
          unfilteredTitle="Aún no hay cómics publicados"
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}

const libraryFormSchema = z.object({
  orderBy: orderBySchema,
  query: z.string(),
  tag: z.array(z.string()),
});

function ComicsLibraryToolbar({
  params,
  onSearchChange,
  onRandom,
}: {
  params: ComicSearchParams;
  onSearchChange: (params: ComicSearchParams) => void;
  onRandom: () => void;
}) {
  const termsQuery = useTerms();

  const form = useAppForm({
    defaultValues: {
      orderBy: params.orderBy ?? "newest",
      query: params.query ?? "",
      tag: params.tag ?? [],
    },
    validators: { onSubmit: libraryFormSchema },
  });

  const formValues = useStore(form.store, (state) => state.values);

  useDebounceEffect(
    () => {
      onSearchChange({
        orderBy: formValues.orderBy,
        query: formValues.query || undefined,
        tag: formValues.tag,
      });
    },
    300,
    [formValues.query, formValues.tag, formValues.orderBy]
  );

  const tagOptions = useMemo(() => {
    const data = termsQuery.data ?? [];
    return data
      .filter((term) => term.taxonomy === "tag")
      .map((term) => ({ id: term.id, color: term.color, name: term.name }));
  }, [termsQuery.data]);

  const selectedTagSet = new Set(formValues.tag);
  const selectedTagOptions = tagOptions.filter((tag) =>
    selectedTagSet.has(tag.id)
  );

  const toggleTag = (id: string) => {
    const next = selectedTagSet.has(id)
      ? formValues.tag.filter((t) => t !== id)
      : [...formValues.tag, id];
    form.setFieldValue("tag", next);
  };

  return (
    <form
      className={LIBRARY_TOOLBAR_CLASS}
      onSubmit={(event) => event.preventDefault()}
    >
      <LibrarySearchInput
        id="comics-library-search"
        onChange={(value) => form.setFieldValue("query", value)}
        onClear={() => form.setFieldValue("query", "")}
        value={formValues.query}
      />

      <SortControl
        onChange={(value) => form.setFieldValue("orderBy", value)}
        value={formValues.orderBy}
      />

      <MultiSelectPopover
        icon={Tag01Icon}
        loading={termsQuery.isPending}
        onToggle={toggleTag}
        options={tagOptions}
        searchPlaceholder="Filtrar tags…"
        selectedIds={selectedTagSet}
        triggerLabel="Tags"
      />

      <Button
        className="h-11 rounded-xl border-white/15 bg-background/60 px-3"
        onClick={onRandom}
        title="Cómic aleatorio"
        type="button"
        variant="outline"
      >
        <HugeiconsIcon className="size-4" icon={DiceFaces05Icon} />
        <span className="hidden sm:inline">Aleatorio</span>
      </Button>

      <SelectedChipsRow
        chips={selectedTagOptions.map((tag) => ({
          group: "tag",
          id: tag.id,
          name: tag.name,
        }))}
        onClearAll={() => form.setFieldValue("tag", [])}
        onRemove={(chip) => toggleTag(chip.id)}
      />
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Comics-only helpers                             */
/* -------------------------------------------------------------------------- */

function pickCover(post: PostProps): string | null {
  const [first] = getThumbnailImageObjectKeys(
    post.imageObjectKeys,
    1,
    post.coverImageObjectKey
  );
  return first ? getBucketUrl(first) : null;
}

type PickedTag = { id: string; name: string; color: string | null };

function pickTopTags(post: PostProps, limit: number): PickedTag[] {
  const terms = (post.terms ?? []) as {
    id?: string;
    name: string;
    taxonomy: string;
    color?: string | null;
  }[];
  return terms
    .filter((term) => term.taxonomy === "tag" && term.id)
    .slice(0, limit)
    .map((term) => ({
      id: term.id!,
      color: term.color ?? null,
      name: term.name,
    }));
}

function Stat({
  icon,
  tone,
  value,
}: {
  icon: IconSvgElement;
  tone?: "amber" | "rose";
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <HugeiconsIcon
        className={cn(
          "size-3.5",
          tone === "amber" && "text-amber-300",
          tone === "rose" && "text-rose-400",
          !tone && "opacity-80"
        )}
        icon={icon}
      />
      <span className="font-semibold text-foreground">{value}</span>
    </span>
  );
}
