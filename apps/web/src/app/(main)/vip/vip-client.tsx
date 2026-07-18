"use client";

import {
  ArrowRight01Icon,
  Book03Icon,
  Clock01Icon,
  GameController03Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { PatronTier } from "@repo/shared/constants";
import { getEarlyAccessPolicy } from "@repo/shared/early-access";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { LibraryPagination } from "@/components/search/library-shared";
import { TierShape } from "@/components/tier-shape";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { trackEvent } from "@/lib/analytics";
import type { orpcClient } from "@/lib/orpc";
import { cn, getBucketUrl } from "@/lib/utils";

export type VipContentType = "comic" | "post";

export function VipClient({
  contentType,
  feed,
}: {
  contentType: VipContentType;
  feed: Awaited<ReturnType<typeof orpcClient.post.getVipFeed>>;
}) {
  const router = useRouter();
  const { items, pagination } = feed;

  const handlePageChange = useCallback(
    (page: number) => {
      const params = new URLSearchParams();
      if (contentType === "comic") {
        params.set("type", "comic");
      }
      if (page > 1) {
        params.set("page", String(page));
      }
      const query = params.toString();
      router.push(query ? `/vip?${query}` : "/vip", { scroll: false });
    },
    [contentType, router]
  );

  useEffect(() => {
    trackEvent("vip_page_viewed", {
      earlyAccessItemCount: items.length,
    });
  }, [contentType, items.length]);

  return (
    <main className="flex flex-col gap-8 px-4 py-6">
      <VipContentSelector contentType={contentType} />
      <VipHero contentType={contentType} />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="section-title">En Early Access Ahora</div>
          </div>
        </div>

        {items.length === 0 ? (
          <Card className="rounded-2xl border-dashed border-border/70 bg-card/60">
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-300">
                <HugeiconsIcon className="size-6" icon={Clock01Icon} />
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="font-lexend font-semibold text-xl text-foreground">
                  La vitrina VIP está vacía por ahora
                </h2>
                <p className="max-w-xl text-muted-foreground text-sm leading-relaxed">
                  {contentType === "comic"
                    ? "En cuanto un comic entre en la secuencia VIP 8 → VIP 5 → público, aparecerá aquí automáticamente."
                    : "En cuanto un juego entre en la secuencia VIP 12 → VIP 8 → público, aparecerá aquí automáticamente."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid items-stretch gap-2 xl:grid-cols-3">
              {items.map((item) => (
                <VipFeedCard item={item} key={item.id} />
              ))}
            </div>
            <LibraryPagination
              onPageChange={handlePageChange}
              pagination={pagination}
            />
          </div>
        )}
      </section>
    </main>
  );
}

const VIP_CONTENT_OPTIONS = [
  {
    href: "/vip",
    icon: GameController03Icon,
    label: "Juegos",
    type: "post",
  },
  {
    href: "/vip?type=comic",
    icon: Book03Icon,
    label: "Comics",
    type: "comic",
  },
] as const;

function VipContentSelector({ contentType }: { contentType: VipContentType }) {
  return (
    <nav
      aria-label="Tipo de contenido en acceso anticipado"
      className="mx-auto grid w-full max-w-md grid-cols-2 gap-1 rounded-2xl border border-border/70 bg-card/70 p-1.5 shadow-md backdrop-blur-sm"
    >
      {VIP_CONTENT_OPTIONS.map((option) => {
        const isActive = option.type === contentType;
        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-semibold text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400/70",
              isActive
                ? "bg-amber-400/15 text-amber-100 shadow-sm ring-1 ring-amber-400/35"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            )}
            href={option.href}
            key={option.type}
          >
            <HugeiconsIcon className="size-4" icon={option.icon} />
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}

function VipHero({ contentType }: { contentType: VipContentType }) {
  const content = VIP_CONTENT_CONFIG[contentType];
  return (
    <section className="relative overflow-hidden rounded-3xl bg-linear-to-br from-amber-400/15 via-amber-400/5 to-transparent p-6 ring-1 shadow-glow-amber-400/15 ring-amber-400/30 md:p-8">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-12 top-0 h-px bg-linear-to-r from-transparent via-amber-300/40 to-transparent"
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
        <header className="flex flex-col gap-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-flex size-1.5 rounded-full bg-amber-300 shadow-[0_0_10px_2px] shadow-amber-300/60"
            />
            <span className="inline-flex items-center gap-1.5 font-medium text-[11px] uppercase tracking-[0.28em] text-amber-200/90">
              <HugeiconsIcon
                className="size-3.5 fill-amber-300 text-amber-300"
                icon={StarIcon}
              />
              {content.eyebrow}
            </span>
          </div>
          <h1 className="display-heading max-w-2xl text-[34px] text-foreground sm:text-[42px] md:text-[46px]">
            {content.title}
            <br />
            <span className="bg-linear-to-r from-amber-200 via-amber-100 to-pink-200 bg-clip-text text-transparent">
              {content.highlight}
            </span>
          </h1>
          <p className="max-w-md text-balance text-muted-foreground text-sm leading-relaxed">
            {content.description}
          </p>
          <div className="glow-line mt-1 w-full max-w-sm" />
        </header>

        <EarlyAccessProgression phases={content.phases} />
      </div>
    </section>
  );
}

type VipPhase = {
  index: string;
  tier: PatronTier;
  name: string;
  hint: string;
  leadLabel: string;
};

const PUBLIC_PHASE = {
  hint: "Para todos",
  index: "03",
  leadLabel: "Lanzamiento",
  name: "Público",
  tier: "none",
} as const satisfies VipPhase;

const VIP_CONTENT_CONFIG = {
  comic: {
    description:
      "VIP 8 accede 48 horas antes del estreno; VIP 5 se suma durante las 24 horas finales antes del lanzamiento público.",
    eyebrow: "VIP Comics",
    highlight: "Página a página.",
    phases: [
      {
        hint: "24h en exclusiva",
        index: "01",
        leadLabel: "48h antes",
        name: "VIP 8",
        tier: "level8",
      },
      {
        hint: "24h de adelanto",
        index: "02",
        leadLabel: "24h antes",
        name: "VIP 5",
        tier: "level5",
      },
      PUBLIC_PHASE,
    ],
    title: "Lee antes.",
  },
  post: {
    description:
      "Cada lanzamiento avanza por tres fases — primero los VIP 12, luego los VIP 8, y al final, todo el público.",
    eyebrow: "VIP Juegos",
    highlight: "Sin anuncios.",
    phases: [
      {
        hint: "Adelanto exclusivo",
        index: "01",
        leadLabel: "72h antes",
        name: "VIP 12",
        tier: "level12",
      },
      {
        hint: "Acceso intermedio",
        index: "02",
        leadLabel: "48h antes",
        name: "VIP 8",
        tier: "level8",
      },
      PUBLIC_PHASE,
    ],
    title: "Juega antes.",
  },
} as const satisfies Record<
  VipContentType,
  {
    description: string;
    eyebrow: string;
    highlight: string;
    phases: readonly VipPhase[];
    title: string;
  }
>;

function EarlyAccessProgression({ phases }: { phases: readonly VipPhase[] }) {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="-translate-y-1/2 pointer-events-none absolute top-8 right-[16.66%] left-[16.66%] h-1.5 overflow-hidden rounded-full border border-amber-400/20 bg-amber-400/5 sm:top-10"
      >
        <div className="absolute inset-y-0 left-0 w-1/3 animate-track-flow bg-linear-to-r from-transparent via-amber-300/80 to-transparent" />
      </div>

      <ol className="relative grid grid-cols-3 gap-2">
        {phases.map((phase) => (
          <PhaseNode key={phase.index} phase={phase} />
        ))}
      </ol>
    </div>
  );
}

function PhaseNode({ phase }: { phase: VipPhase }) {
  return (
    <li className="flex flex-col items-center gap-3 text-center">
      <div className="relative">
        <span
          aria-hidden="true"
          className="-inset-3 absolute rounded-full bg-amber-300/20 blur-2xl"
        />
        <TierShape className="relative size-16 sm:size-20" tier={phase.tier} />
      </div>
      <div className="flex flex-col items-center gap-1">
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 font-medium text-[10px] text-amber-100">
          <HugeiconsIcon className="size-3" icon={Clock01Icon} />
          {phase.leadLabel}
        </span>
        <span className="font-medium text-[10px] uppercase tracking-[0.24em] text-amber-200/75">
          Fase {phase.index}
        </span>
        <span className="display-heading text-[18px] text-foreground">
          {phase.name}
        </span>
        <span className="text-[11px] leading-snug text-muted-foreground">
          {phase.hint}
        </span>
      </div>
    </li>
  );
}

function useCountdown(targetAt: Date | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!targetAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [targetAt]);

  if (!targetAt) {
    return null;
  }

  const remainingMs = Math.max(targetAt.getTime() - now, 0);
  const totalMinutes = Math.floor(remainingMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  return { days, hours, minutes };
}

function VipCountdown({
  label,
  targetAt,
}: {
  label: string;
  targetAt: Date | null;
}) {
  const countdown = useCountdown(targetAt);

  if (!countdown) {
    return null;
  }

  const parts = [
    { suffix: "d", value: countdown.days },
    { suffix: "h", value: countdown.hours },
    { suffix: "m", value: countdown.minutes },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <span className="inline-flex items-center gap-1.5 font-medium text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
        <HugeiconsIcon className="size-3" icon={Clock01Icon} />
        {label}
      </span>
      <div className="flex items-baseline gap-1 font-lexend tabular-nums">
        {parts.map((part, index) => (
          <span className="inline-flex items-baseline" key={part.suffix}>
            {index > 0 && (
              <span className="mr-1 text-muted-foreground/30">·</span>
            )}
            <span className="font-bold text-lg leading-none text-foreground">
              {String(part.value).padStart(2, "0")}
            </span>
            <span className="ml-0.5 font-medium text-[10px] text-muted-foreground">
              {part.suffix}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function VipFeedCard({
  item,
}: {
  item: Awaited<ReturnType<typeof orpcClient.post.getVipFeed>>["items"][number];
}) {
  const teaser =
    item.content.length > 220
      ? `${item.content.slice(0, 217).trimEnd()}...`
      : item.content;
  const heroImage = item.imageObjectKeys?.[0] ?? item.coverImageObjectKey;
  const { firstPhaseTier } = getEarlyAccessPolicy(item.type);
  const phaseLabel = item.earlyAccess.requiredTierLabel
    ? `${item.earlyAccess.requiredTier === firstPhaseTier ? "Solo" : "Desde"} ${item.earlyAccess.requiredTierLabel}`
    : "Acceso anticipado";
  const href =
    item.type === "comic" ? `/comic/${item.slug}` : `/post/${item.id}`;

  return (
    <Link
      className="group block h-full rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-400/70 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      onClick={() =>
        trackEvent("vip_content_clicked", {
          contentId: item.id,
          earlyAccessState: item.earlyAccess.currentState,
          viewerCanAccess: item.earlyAccess.viewerCanAccess,
        })
      }
      href={href}
    >
      <Card className="h-full overflow-hidden rounded-2xl border-border/70 bg-card/70 p-0 shadow-md backdrop-blur-sm transition-[transform,border-color,box-shadow] duration-200 group-hover:-translate-y-0.5 group-hover:border-amber-400/40 group-hover:shadow-glow-amber-400/15">
        <div className="grid h-full grid-rows-[auto_1fr]">
          <div className="relative aspect-video overflow-hidden">
            {heroImage ? (
              <Image
                alt={item.title}
                className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                fill
                sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                src={getBucketUrl(heroImage)}
              />
            ) : (
              <div className="absolute inset-0 bg-linear-to-br from-amber-400/20 via-primary/10 to-transparent" />
            )}
            <div className="absolute inset-0 bg-linear-to-t from-background via-background/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 p-3">
              <Badge className="gap-1.5 border-amber-400/40 bg-amber-400/15 text-amber-100 hover:bg-amber-400/15">
                <HugeiconsIcon
                  className="size-3 fill-amber-300 text-amber-300"
                  icon={StarIcon}
                />
                {phaseLabel}
              </Badge>
              {item.earlyAccess.viewerCanAccess && (
                <Badge variant="secondary">Tu nivel entra</Badge>
              )}
            </div>
          </div>

          <CardContent className="flex h-full flex-col gap-4 p-5">
            <div className="flex flex-col gap-2">
              <h2 className="font-lexend font-semibold text-foreground text-xl leading-tight">
                {item.title}
              </h2>
              {teaser ? (
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {teaser}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 grid-cols-2">
              <VipCountdown
                label="Próxima fase"
                targetAt={item.earlyAccess.currentPhaseEndsAt}
              />
              <VipCountdown
                label="Público total"
                targetAt={item.earlyAccess.publicReleaseAt}
              />
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 border-border/60 border-t pt-3 text-sm">
              <span className="text-muted-foreground">
                Entrar al {item.type === "comic" ? "comic" : "juego"} VIP
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-amber-200 transition-transform duration-200 group-hover:translate-x-0.5">
                Abrir
                <HugeiconsIcon className="size-3.5" icon={ArrowRight01Icon} />
              </span>
            </div>
          </CardContent>
        </div>
      </Card>
    </Link>
  );
}
