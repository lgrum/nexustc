import { Clock01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { PatronTier } from "@repo/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { TierShape } from "@/components/tier-shape";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { orpcClient } from "@/lib/orpc";
import { getThumbnailImageObjectKeys } from "@/lib/post-images";
import { getBucketUrl } from "@/lib/utils";

export const Route = createFileRoute("/_main/vip")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - VIP",
      },
    ],
  }),
  loader: async () => await orpcClient.post.getVipFeed(),
});

function RouteComponent() {
  const initialItems = Route.useLoaderData();
  const { data: items = initialItems } = useQuery({
    initialData: initialItems,
    queryFn: () => orpcClient.post.getVipFeed(),
    queryKey: ["posts", "vip-feed"],
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  return (
    <main className="flex flex-col gap-8 px-4 py-6">
      <VipHero />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="section-title">En Early Access Ahora</div>
            <p className="mt-1 text-muted-foreground text-sm">
              {items.length === 0
                ? "No hay lanzamientos VIP activos ahora mismo."
                : `${items.length} publicaciones activas en la ventana VIP.`}
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <Card className="rounded-[28px] border-dashed border-border/70 bg-card/60">
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-amber-400/10 text-amber-300">
                <HugeiconsIcon className="size-7" icon={Clock01Icon} />
              </div>
              <div className="space-y-1">
                <h2 className="font-[Lexend] font-semibold text-xl">
                  La vitrina VIP está vacía por ahora
                </h2>
                <p className="max-w-xl text-muted-foreground text-sm leading-relaxed">
                  En cuanto entre una nueva publicación en la secuencia VIP 12 →
                  VIP 8 → público, aparecerá aquí automáticamente.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item) => (
              <VipFeedCard item={item} key={item.id} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function VipHero() {
  return (
    <section className="relative overflow-hidden rounded-[36px] border border-amber-300/20 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.14),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.12),transparent_34%),linear-gradient(135deg,rgba(11,15,28,0.96),rgba(34,16,48,0.92))] p-6 md:p-8">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/40 to-transparent"
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
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
              VIP Games
            </span>
          </div>
          <h1 className="display-heading max-w-2xl text-[34px] text-white sm:text-[42px] md:text-[46px]">
            Juega antes.
            <br />
            <span className="bg-gradient-to-r from-amber-200 via-amber-100 to-pink-200 bg-clip-text text-transparent">
              Sin anuncios.
            </span>
          </h1>
          <p className="max-w-md text-[13.5px] text-white/70 leading-relaxed text-balance">
            Cada lanzamiento avanza por tres fases — primero los VIP 12, luego
            los VIP 8, y al final, todo el público.
          </p>
          <div className="glow-line mt-1 w-full max-w-sm" />
        </header>

        <EarlyAccessProgression />
      </div>
    </section>
  );
}

const PHASES: readonly {
  index: string;
  tier: PatronTier;
  name: string;
  hint: string;
}[] = [
  {
    hint: "Adelanto exclusivo",
    index: "01",
    name: "VIP 12",
    tier: "level12",
  },
  {
    hint: "Acceso intermedio",
    index: "02",
    name: "VIP 8",
    tier: "level8",
  },
  {
    hint: "Para todos",
    index: "03",
    name: "Público",
    tier: "none",
  },
];

function EarlyAccessProgression() {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="-translate-y-1/2 pointer-events-none absolute top-8 right-[16.66%] left-[16.66%] h-1.5 overflow-hidden rounded-full border border-amber-300/15 bg-amber-300/[0.04] sm:top-10"
      >
        <div className="absolute inset-y-0 left-0 w-1/3 animate-track-flow bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />
      </div>

      <ol className="relative grid grid-cols-3 gap-2">
        {PHASES.map((phase) => (
          <PhaseNode key={phase.index} phase={phase} />
        ))}
      </ol>
    </div>
  );
}

function PhaseNode({ phase }: { phase: (typeof PHASES)[number] }) {
  return (
    <li className="flex flex-col items-center gap-3 text-center">
      <div className="relative">
        <span
          aria-hidden
          className="-inset-3 absolute rounded-full bg-amber-300/20 blur-2xl"
        />
        <TierShape className="relative size-16 sm:size-20" tier={phase.tier} />
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span className="font-medium text-[10px] text-amber-200/70 uppercase tracking-[0.24em]">
          Fase {phase.index}
        </span>
        <span className="display-heading text-[18px] text-white">
          {phase.name}
        </span>
        <span className="text-[11px] text-white/55 leading-snug">
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

  return (
    <div>
      <div className="text-[11px] text-white/60 uppercase tracking-[0.24em]">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2 font-[Lexend] font-bold text-white text-2xl">
        <span>{String(countdown.days).padStart(2, "0")}d</span>
        <span>{String(countdown.hours).padStart(2, "0")}h</span>
        <span>{String(countdown.minutes).padStart(2, "0")}m</span>
      </div>
    </div>
  );
}

function VipFeedCard({
  item,
}: {
  item: Awaited<ReturnType<typeof orpcClient.post.getVipFeed>>[number];
}) {
  const teaser =
    item.content.length > 220
      ? `${item.content.slice(0, 217).trimEnd()}...`
      : item.content;
  const [heroImage] = getThumbnailImageObjectKeys(
    item.imageObjectKeys,
    1,
    item.coverImageObjectKey
  );

  return (
    <Link
      className="group block rounded-[30px] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-300/70 focus-visible:ring-offset-4 focus-visible:ring-offset-background"
      params={{ id: item.id }}
      to="/post/$id"
    >
      <Card className="overflow-hidden rounded-[30px] border border-amber-400/18 bg-[linear-gradient(160deg,rgba(18,24,38,0.98),rgba(11,17,32,0.9))] p-0 shadow-[0_32px_90px_-70px_rgba(251,191,36,0.9)] transition-transform duration-200 group-hover:-translate-y-1 group-hover:border-amber-300/35 group-hover:shadow-[0_40px_120px_-72px_rgba(251,191,36,1)]">
        <div className="grid gap-0 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="relative min-h-72 overflow-hidden">
            {heroImage ? (
              <img
                alt={item.title}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                src={getBucketUrl(heroImage)}
              />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.24),transparent_35%),linear-gradient(135deg,rgba(15,23,42,1),rgba(49,18,67,0.92))]" />
            )}
            <div className="absolute inset-0 bg-linear-to-t from-black via-black/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-2 p-4">
              <Badge className="border-amber-300/20 bg-amber-300/10 text-amber-100 hover:bg-amber-300/10">
                {item.earlyAccess.viewerCanAccess
                  ? "Abierto para tu cuenta"
                  : `${item.earlyAccess.requiredTierLabel ?? "VIP"} ahora`}
              </Badge>
              <Badge className="border-white/10 bg-black/35 text-white/80 hover:bg-black/35">
                {item.earlyAccess.currentState === "VIP12_ONLY"
                  ? "VIP 12"
                  : "VIP 8"}
              </Badge>
            </div>
          </div>

          <CardContent className="flex h-full flex-col gap-5 p-5">
            <div className="space-y-2">
              <div className="text-[11px] text-amber-200 uppercase tracking-[0.24em]">
                VIP Preview
              </div>
              <h2 className="font-[Lexend] font-semibold text-2xl text-white leading-tight">
                {item.title}
              </h2>
              <p className="text-sm text-white/72 leading-relaxed">{teaser}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-1">
              <VipCountdown
                label="Cierra esta fase en"
                targetAt={item.earlyAccess.currentPhaseEndsAt}
              />
              <VipCountdown
                label="Público en"
                targetAt={item.earlyAccess.publicReleaseAt}
              />
            </div>

            <div className="mt-auto flex items-center justify-between gap-3 text-sm text-white/72">
              <span>Entrar al post VIP</span>
              <span className="font-semibold text-amber-200 transition-transform duration-200 group-hover:translate-x-1">
                Abrir ahora
              </span>
            </div>
          </CardContent>
        </div>
      </Card>
    </Link>
  );
}
