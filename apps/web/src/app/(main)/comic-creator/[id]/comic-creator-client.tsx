import {
  ArrowLeft01Icon,
  Book02Icon,
  FavouriteIcon,
  LinkSquare01Icon,
  StarIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";

import { PostCard } from "@/components/landing/post-card";
import type { PostProps } from "@/components/landing/post-card";
import { Button } from "@/components/ui/button";
import { getThumbnailImageObjectKeys } from "@/lib/post-images";
import { cn, getBucketUrl } from "@/lib/utils";

type ComicCreatorData = {
  creator: {
    id: string;
    name: string;
    url: string;
  };
  items: PostProps[];
  stats: {
    averageRating: number;
    totalFavorites: number;
    totalLikes: number;
    totalViews: number;
  };
};

const COMPACT_FORMATTER = new Intl.NumberFormat("es", {
  maximumFractionDigits: 1,
  notation: "compact",
});

function formatCount(value: number | undefined | null) {
  return value === undefined || value === null
    ? "0"
    : COMPACT_FORMATTER.format(value);
}

export function ComicCreatorClient({
  initialData,
}: {
  initialData: ComicCreatorData;
}) {
  const data = initialData;
  const heroImages = data.items
    .flatMap((comic) =>
      getThumbnailImageObjectKeys(
        comic.imageObjectKeys,
        1,
        comic.coverImageObjectKey
      )
    )
    .slice(0, 4);

  return (
    <main className="flex flex-col gap-8 px-4 py-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-card/70 shadow-2xl shadow-black/20">
        <CreatorBackdrop imageKeys={heroImages} />

        <div className="relative z-10 grid gap-8 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div className="flex min-w-0 flex-col gap-5">
            <Button
              className="w-fit gap-2 rounded-full border-white/10 bg-white/5"
              nativeButton={false}
              render={<Link href="/comics" />}
              size="sm"
              variant="outline"
            >
              <HugeiconsIcon className="size-4" icon={ArrowLeft01Icon} />
              Comics
            </Button>

            <div className="space-y-3">
              <p className="font-medium text-[11px] text-primary uppercase tracking-[0.32em]">
                Creador de comics
              </p>
              <h1 className="display-heading max-w-4xl text-balance text-[40px] text-foreground leading-none sm:text-[56px] md:text-[72px]">
                {data.creator.name}
              </h1>
              <div className="glow-line max-w-sm" />
              <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed md:text-base">
                Biblioteca curada con todos los comics publicados de este
                creador en NeXusTC.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {data.creator.url && (
                <a
                  className="inline-flex h-7 items-center justify-center gap-2 rounded-full bg-primary px-2.5 font-medium text-[0.8rem] text-primary-foreground transition-all hover:bg-primary/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  href={data.creator.url}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <HugeiconsIcon className="size-4" icon={LinkSquare01Icon} />
                  Sitio del creador
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <CreatorStat
              icon={Book02Icon}
              label="Comics"
              value={formatCount(data.items.length)}
            />
            <CreatorStat
              icon={FavouriteIcon}
              label="Likes"
              value={formatCount(data.stats.totalLikes)}
            />
            <CreatorStat
              icon={ViewIcon}
              label="Vistas"
              value={formatCount(data.stats.totalViews)}
            />
            <CreatorStat
              icon={StarIcon}
              label="Rating"
              value={
                data.stats.averageRating > 0
                  ? data.stats.averageRating.toFixed(1)
                  : "N/A"
              }
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="section-title">Comics publicados</p>
            <p className="text-muted-foreground text-sm">
              {data.items.length} resultados disponibles
            </p>
          </div>
        </div>

        {data.items.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {data.items.map((comic) => (
              <PostCard key={comic.id} post={comic} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-card/50 p-10 text-center">
            <HugeiconsIcon
              className="mx-auto size-10 text-muted-foreground"
              icon={Book02Icon}
            />
            <h2 className="mt-4 font-[Lexend] font-semibold text-lg">
              Sin comics visibles
            </h2>
            <p className="mx-auto mt-1 max-w-md text-muted-foreground text-sm">
              Este creador todavia no tiene comics publicados para el catalogo
              publico.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

function CreatorBackdrop({ imageKeys }: { imageKeys: string[] }) {
  return (
    <div aria-hidden="true" className="absolute inset-0">
      <div className="absolute inset-0 bg-linear-to-br from-primary/20 via-card to-secondary/10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,oklch(0.76_0.18_20/0.24),transparent_32%),radial-gradient(circle_at_85%_20%,oklch(0.74_0.17_250/0.2),transparent_30%)]" />
      <div className="absolute inset-0 bg-linear-to-t from-background via-background/65 to-background/20" />
      <div className="absolute right-4 bottom-4 hidden grid-cols-2 gap-2 opacity-45 blur-[0.2px] md:grid">
        {imageKeys.map((imageKey, index) => (
          <Image
            alt=""
            className={cn(
              "h-36 w-24 rounded-xl object-cover shadow-2xl shadow-black/50 ring-1 ring-white/10",
              index % 2 === 0 ? "-rotate-3" : "translate-y-6 rotate-3"
            )}
            height={144}
            key={imageKey}
            sizes="96px"
            src={getBucketUrl(imageKey)}
            width={96}
          />
        ))}
      </div>
    </div>
  );
}

function CreatorStat({
  icon,
  label,
  value,
}: {
  icon: typeof Book02Icon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-background/55 p-4 backdrop-blur-md">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.18em]">
        <HugeiconsIcon className="size-4 text-primary" icon={icon} />
        {label}
      </div>
      <div className="mt-2 font-[Lexend] font-bold text-2xl text-foreground">
        {value}
      </div>
    </div>
  );
}
