import {
  ArrowRightBigIcon,
  Clock01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MembershipUpgradeExperience } from "@/features/vip-upgrade/upgrade-experience";
import { orpcClient } from "@/lib/orpc";
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
      <MembershipUpgradeExperience />

      <section className="overflow-hidden rounded-[36px] border border-amber-400/25 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.16),transparent_26%),linear-gradient(135deg,rgba(9,13,28,0.98),rgba(41,16,55,0.94))] p-6 shadow-[0_36px_120px_-68px_rgba(251,191,36,0.95)] md:p-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-amber-100 text-xs uppercase tracking-[0.26em]">
              <HugeiconsIcon className="size-3.5" icon={StarIcon} />
              VIP Games
            </div>

            <div className="space-y-3">
              <h2 className="max-w-3xl font-[Lexend] font-bold text-4xl text-white leading-[1.02] md:text-5xl">
                Mira lo nuevo primero.
                <br />
                Juega antes.
              </h2>
            </div>
          </div>

          <div className="grid items-center gap-3 md:grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <div className="rounded-2xl border border-white/10 bg-black/22 p-4">
              <div className="text-[11px] text-amber-200 uppercase tracking-[0.24em]">
                Fase 01
              </div>
              <div className="mt-2 font-[Lexend] font-semibold text-white text-xl">
                VIP 12
              </div>
            </div>
            <HugeiconsIcon
              className="text-amber-200"
              icon={ArrowRightBigIcon}
            />
            <div className="rounded-2xl border border-white/10 bg-black/22 p-4">
              <div className="text-[11px] text-amber-200 uppercase tracking-[0.24em]">
                Fase 02
              </div>
              <div className="mt-2 font-[Lexend] font-semibold text-white text-xl">
                VIP 8
              </div>
            </div>
            <HugeiconsIcon
              className="text-amber-200"
              icon={ArrowRightBigIcon}
            />
            <div className="rounded-2xl border border-white/10 bg-black/22 p-4">
              <div className="text-[11px] text-amber-200 uppercase tracking-[0.24em]">
                Fase 03
              </div>
              <div className="mt-2 font-[Lexend] font-semibold text-white text-xl">
                PÚBLICO
              </div>
            </div>
          </div>
        </div>
      </section>

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
  const heroImage = item.imageObjectKeys?.[0];

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
