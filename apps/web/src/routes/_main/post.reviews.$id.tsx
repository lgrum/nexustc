import {
  ArrowLeft02Icon,
  Clock01Icon,
  Comment01Icon,
  LockPasswordIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { RatingButton } from "@/components/ratings/rating-button";
import { RatingDisplay } from "@/components/ratings/rating-display";
import { RatingList } from "@/components/ratings/rating-list";
import { Button } from "@/components/ui/button";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_main/post/reviews/$id")({
  component: ReviewsPage,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Valoraciones",
      },
    ],
  }),
});

function ReviewsPage() {
  const { id: postId } = Route.useParams();

  const { data: post } = useQuery({
    queryFn: () => orpcClient.post.getPostById(postId),
    queryKey: ["post", postId],
  });

  const { data: stats } = useQuery({
    enabled: !!post && !post.earlyAccess.isActive,
    queryFn: () => orpcClient.rating.getStats({ postId }),
    queryKey: ["rating", "stats", postId],
  });

  const isEarlyAccess = post?.earlyAccess.isActive ?? false;
  const hasRatings = !!stats && stats.ratingCount > 0;

  return (
    <main className="flex flex-col gap-8 px-4 py-6">
      <div className="mx-auto w-full max-w-4xl">
        <BackLink postId={postId} />
      </div>

      <section className="mx-auto w-full max-w-4xl">
        <ReviewsHero
          isEarlyAccess={isEarlyAccess}
          postTitle={post?.title}
          stats={hasRatings ? stats : undefined}
        />
      </section>

      {isEarlyAccess ? (
        <section className="mx-auto w-full max-w-4xl">
          <EarlyAccessGate />
        </section>
      ) : (
        <section className="mx-auto w-full max-w-4xl space-y-4">
          <div className="flex flex-wrap items-end justify-center md:justify-between gap-4">
            <div>
              <div className="section-title">
                <HugeiconsIcon className="size-4" icon={Comment01Icon} />
                Reseñas de la comunidad
              </div>
              <p className="mt-1 text-muted-foreground text-sm">
                {hasRatings
                  ? `${stats.ratingCount} ${stats.ratingCount === 1 ? "opinión compartida" : "opiniones compartidas"} por los lectores.`
                  : "Aún no hay reseñas. Comparte la primera."}
              </p>
            </div>
            <RatingButton postId={postId} />
          </div>

          <div className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card/60 p-4 sm:p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-amber-400/6 to-transparent"
            />
            <div className="relative">
              <RatingList postId={postId} />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

function BackLink({ postId }: { postId: string }) {
  return (
    <Link params={{ id: postId }} to="/post/$id">
      <Button
        className="gap-2 text-muted-foreground hover:text-foreground"
        size="sm"
        variant="ghost"
      >
        <HugeiconsIcon className="size-4" icon={ArrowLeft02Icon} />
        Volver al post
      </Button>
    </Link>
  );
}

type Stats = {
  averageRating: number;
  ratingCount: number;
};

function ReviewsHero({
  isEarlyAccess,
  postTitle,
  stats,
}: {
  isEarlyAccess: boolean;
  postTitle: string | undefined;
  stats: Stats | undefined;
}) {
  return (
    <div className="relative overflow-hidden rounded-[36px] border border-amber-300/20 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.12),transparent_34%),linear-gradient(135deg,rgba(11,15,28,0.96),rgba(34,16,48,0.92))] p-6 md:p-8">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-12 top-0 h-px bg-linear-to-r from-transparent via-amber-300/40 to-transparent"
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:items-center">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-flex size-1.5 rounded-full bg-amber-300 shadow-[0_0_10px_2px] shadow-amber-300/60"
            />
            <span className="font-medium text-[11px] text-amber-200/90 uppercase tracking-[0.28em]">
              <HugeiconsIcon
                className="mr-1.5 inline size-3.5 align-[-2px]"
                icon={StarIcon}
              />
              Valoraciones
            </span>
          </div>

          <h1 className="display-heading max-w-2xl text-[32px] text-white sm:text-[40px] md:text-[44px]">
            Reseñas de la
            <br />
            <span className="bg-linear-to-r from-amber-200 via-amber-100 to-pink-200 bg-clip-text text-transparent">
              comunidad.
            </span>
          </h1>

          {postTitle ? (
            <p className="max-w-md text-[13.5px] text-white/70 leading-relaxed text-pretty">
              Reseñas y puntuaciones de{" "}
              <span className="font-semibold text-white/90">“{postTitle}”</span>
              , escritas por otros lectores.
            </p>
          ) : (
            <p className="max-w-md text-[13.5px] text-white/70 leading-relaxed text-pretty">
              Reseñas y puntuaciones escritas por otros lectores.
            </p>
          )}

          <div className="glow-line mt-1 w-full max-w-sm" />
        </header>

        {isEarlyAccess ? (
          <HeroLockedPanel />
        ) : stats ? (
          <HeroStatsPanel stats={stats} />
        ) : (
          <HeroEmptyPanel />
        )}
      </div>
    </div>
  );
}

function HeroStatsPanel({ stats }: { stats: Stats }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="-inset-4 absolute rounded-[40px] bg-amber-300/10 blur-3xl"
      />
      <div className="relative flex flex-col gap-4 rounded-[28px] border border-amber-300/25 bg-black/30 p-5 backdrop-blur-xl sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-0.5 font-medium text-[10.5px] text-amber-100 uppercase tracking-[0.22em]">
            Promedio
          </span>
          <span className="text-[11px] text-white/55">
            {stats.ratingCount === 1
              ? "1 valoración"
              : `${stats.ratingCount} valoraciones`}
          </span>
        </div>

        <RatingDisplay
          averageRating={stats.averageRating}
          className="text-white"
          ratingCount={stats.ratingCount}
          variant="full"
        />
      </div>
    </div>
  );
}

function HeroEmptyPanel() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="-inset-4 absolute rounded-[40px] bg-amber-300/10 blur-3xl"
      />
      <div className="relative flex flex-col items-center gap-3 rounded-[28px] border border-amber-300/20 bg-black/30 p-6 text-center backdrop-blur-xl">
        <div className="relative">
          <span
            aria-hidden
            className="-inset-3 absolute rounded-full bg-amber-300/25 blur-xl"
          />
          <div className="relative flex size-14 items-center justify-center rounded-2xl border border-amber-300/35 bg-amber-300/15 shadow-[0_0_28px_-6px] shadow-amber-300/60">
            <HugeiconsIcon
              className="size-6 text-amber-200"
              icon={StarIcon}
              strokeWidth={1.8}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="display-heading text-[18px] text-white">
            Sin valoraciones todavía
          </span>
          <span className="max-w-65 text-[12px] text-white/60 leading-snug">
            Sé el primero en compartir una puntuación y reseña.
          </span>
        </div>
      </div>
    </div>
  );
}

function HeroLockedPanel() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="-inset-4 absolute rounded-[40px] bg-pink-400/10 blur-3xl"
      />
      <div className="relative flex flex-col items-center gap-3 rounded-[28px] border border-pink-300/25 bg-black/30 p-6 text-center backdrop-blur-xl">
        <div className="relative">
          <span
            aria-hidden
            className="-inset-3 absolute rounded-full bg-pink-400/25 blur-xl"
          />
          <div className="relative flex size-14 items-center justify-center rounded-2xl border border-pink-300/35 bg-pink-400/15 shadow-[0_0_28px_-6px] shadow-pink-400/60">
            <HugeiconsIcon
              className="size-6 text-pink-200"
              icon={LockPasswordIcon}
              strokeWidth={1.8}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="display-heading text-[18px] text-white">
            Bloqueado en Early Access
          </span>
          <span className="max-w-65 text-[12px] text-white/60 leading-snug">
            Las valoraciones se abren cuando el post sale al público.
          </span>
        </div>
      </div>
    </div>
  );
}

function EarlyAccessGate() {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card/60 p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-amber-400/8 via-amber-400/2 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 -right-16 h-48 w-48 rounded-full bg-amber-400/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 -left-20 h-48 w-48 rounded-full bg-pink-400/10 blur-3xl"
      />

      <div className="relative flex flex-col items-center gap-5 text-center">
        <div className="relative">
          <span
            aria-hidden
            className="-inset-3 absolute rounded-full bg-amber-400/25 blur-xl"
          />
          <div className="relative flex size-16 items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-400/15 shadow-[0_0_32px_-4px] shadow-amber-400/55">
            <HugeiconsIcon
              className="size-7 text-amber-200"
              icon={Clock01Icon}
              strokeWidth={1.8}
            />
          </div>
        </div>

        <div className="flex max-w-lg flex-col gap-2">
          <span className="inline-flex self-center items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 font-semibold text-[10.5px] text-amber-200 uppercase tracking-[0.24em]">
            Early Access
          </span>
          <h2 className="display-heading text-balance text-[24px] text-foreground leading-[1.15] sm:text-[26px]">
            Las valoraciones esperan la salida pública
          </h2>
          <p className="text-pretty text-[13px] text-muted-foreground leading-relaxed">
            Así evitamos que comentarios, reseñas o puntuaciones revelen
            demasiado antes del lanzamiento general. Vuelve cuando termine la
            ventana VIP.
          </p>
        </div>

        <div className="glow-line mx-auto w-[60%] max-w-xs" />
      </div>
    </div>
  );
}
