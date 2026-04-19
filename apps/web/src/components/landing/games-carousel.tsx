import {
  ArrowRight01Icon,
  FavouriteIcon,
  StarIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PREMIUM_STATUS_CATEGORIES } from "@repo/shared/constants";
import { Link } from "@tanstack/react-router";
import Autoplay from "embla-carousel-autoplay";
import { useEffect, useState } from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import type { CarouselApi } from "@/components/ui/carousel";
import { getThumbnailImageObjectKeys } from "@/lib/post-images";
import { cn, getBucketUrl, getTierColor } from "@/lib/utils";

import type { PostProps } from "./post-card";

const ABANDONED_STATUS_NAME = "Abandonado";

function statusMatches(
  statusName: string | undefined,
  names: readonly string[]
) {
  return statusName !== undefined && names.includes(statusName);
}

function getVersionBadgeClassName(statusName: string | undefined) {
  if (statusName === ABANDONED_STATUS_NAME) {
    return "bg-red-500/20 text-red-200 border border-red-500/40";
  }
  if (statusMatches(statusName, PREMIUM_STATUS_CATEGORIES.ongoing)) {
    return "bg-amber-400/20 text-amber-100 border border-amber-400/40";
  }
  if (statusMatches(statusName, PREMIUM_STATUS_CATEGORIES.completed)) {
    return "bg-emerald-500/20 text-emerald-100 border border-emerald-500/40";
  }
  return "bg-white/15 text-white/90 border border-white/25";
}

function GameSpotlightCard({ post, rank }: { post: PostProps; rank: number }) {
  const [cover] = getThumbnailImageObjectKeys(
    post.imageObjectKeys,
    1,
    post.coverImageObjectKey
  ).map(getBucketUrl);

  const statusName = post.terms?.find(
    (term) => term.taxonomy === "status"
  )?.name;
  const versionBadgeClassName = getVersionBadgeClassName(statusName);

  return (
    <Link
      className="group block h-full"
      params={{ id: post.id }}
      preload={false}
      to="/post/$id"
    >
      <article className="card-hover relative h-full overflow-hidden rounded-2xl border border-border/70 bg-card shadow-lg">
        <div className="relative aspect-16/10 overflow-hidden">
          {cover ? (
            <img
              alt={post.title}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:scale-[1.06]"
              src={cover}
            />
          ) : (
            <div className="absolute inset-0 bg-linear-to-br from-[oklch(0.25_0.05_280)] via-[oklch(0.2_0.08_320)] to-[oklch(0.15_0.04_200)]" />
          )}

          {/* Cinematic gradient: darker floor, airy ceiling */}
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/30 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-linear-to-b from-black/45 to-transparent" />

          {/* Editorial rank numeral */}
          <span
            aria-hidden
            className="display-heading pointer-events-none absolute left-3 top-1 select-none font-extrabold text-[48px] leading-[0.85] tracking-tight text-white/70 drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]"
            style={{
              WebkitTextStroke: "1px rgba(255,255,255,0.15)",
              textShadow:
                "0 0 24px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.7)",
            }}
          >
            {String(rank).padStart(2, "0")}
          </span>

          {/* Version badge */}
          {post.version && (
            <span
              className={cn(
                "absolute right-3 top-3 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider backdrop-blur-md",
                versionBadgeClassName
              )}
            >
              {post.version}
            </span>
          )}

          {/* Bottom content block */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-4">
            <h3 className="display-heading line-clamp-2 text-balance text-[18px] leading-[1.15] text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
              {post.title}
            </h3>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 text-[12px] tabular-nums text-white/80">
                <span className="inline-flex items-center gap-1">
                  <HugeiconsIcon
                    className="size-3.5 opacity-90"
                    icon={FavouriteIcon}
                  />
                  {post.likes}
                </span>
                {post.averageRating !== 0 &&
                  post.averageRating !== undefined && (
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <HugeiconsIcon className="size-3.5" icon={StarIcon} />
                      {post.averageRating.toFixed(1)}
                    </span>
                  )}
                <span className="inline-flex items-center gap-1">
                  <HugeiconsIcon
                    className="size-3.5 opacity-90"
                    icon={ViewIcon}
                  />
                  {post.views}
                </span>
              </div>
              <span className="inline-flex size-7 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white opacity-0 backdrop-blur-md transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 translate-x-1">
                <HugeiconsIcon className="size-3.5" icon={ArrowRight01Icon} />
              </span>
            </div>
          </div>

          {/* Tier stripe — sits flush at card bottom */}
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 h-0.75 opacity-90",
              getTierColor(post.likes)
            )}
          />
        </div>
      </article>
    </Link>
  );
}

export function GamesCarousel({ games }: { games: PostProps[] }) {
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
    <div className="space-y-3">
      <Carousel
        opts={{
          align: "center",
          dragFree: true,
          loop: true,
        }}
        plugins={[
          Autoplay({
            delay: 5000,
            stopOnInteraction: false,
          }),
        ]}
        setApi={setApi}
      >
        <CarouselContent className="-ml-4">
          {games.map((game, index) => (
            <CarouselItem
              className="basis-[85%] pl-4 sm:basis-1/2 lg:basis-1/3"
              key={game.id}
            >
              <GameSpotlightCard post={game} rank={index + 1} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>

      {snaps.length > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {snaps.map((_, i) => (
            <button
              aria-label={`Ir al slide ${i + 1}`}
              className={cn(
                "h-1 rounded-full transition-all duration-300",
                i === selected
                  ? "w-6 bg-primary"
                  : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              )}
              // oxlint-disable-next-line react/no-array-index-key
              key={snaps[i]}
              onClick={() => api?.scrollTo(i)}
              type="button"
            />
          ))}
        </div>
      )}
    </div>
  );
}
