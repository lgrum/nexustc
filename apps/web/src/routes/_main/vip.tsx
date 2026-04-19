import {
  ArrowRightBigIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Crown02Icon,
  InfinityIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PATRON_TIER_GRADIENTS,
  PATRON_TIER_KEYS,
  PATRON_TIERS,
} from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { orpcClient } from "@/lib/orpc";
import { getThumbnailImageObjectKeys } from "@/lib/post-images";
import { cn, getBucketUrl } from "@/lib/utils";

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
      <TierComparison />

      <section className="animate-scale-pulse overflow-hidden rounded-[36px] ring-2 ring-primary shadow-glow-primary bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.16),transparent_26%),linear-gradient(135deg,rgba(9,13,28,0.98),rgba(41,16,55,0.94))] p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-amber-100 text-xs uppercase tracking-[0.26em]">
              <HugeiconsIcon className="size-3.5" icon={StarIcon} />
              VIP Games
            </div>

            <div className="space-y-3">
              <h2 className="max-w-3xl font-[Lexend] font-bold text-4xl text-white leading-[1.02] md:text-5xl">
                Juega antes.
                <br />
                Sin anuncios.
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

// Polygon sides per tier — free starts at triangle and grows by one side per tier.
const TIER_SIDES: Record<PatronTier, number> = {
  none: 3,
  level1: 4,
  level3: 5,
  level5: 6,
  level8: 7,
  level12: 8,
  level69: 9,
  level100: 10,
};

// Placeholder monthly prices — fill in with real Patreon amounts.
const TIER_PRICE_LABELS: Record<PatronTier, string> = {
  none: "Gratis",
  level1: "—",
  level3: "—",
  level5: "—",
  level8: "—",
  level12: "—",
  level69: "—",
  level100: "—",
};

const TIER_NAMES: Record<PatronTier, string> = {
  none: "Free",
  level1: "LvL 1",
  level3: "LvL 3",
  level5: "LvL 5",
  level8: "LvL 8",
  level12: "LvL 12",
  level69: "LvL 69",
  level100: "LvL 100",
};

const TIER_TAGLINES: Record<PatronTier, string> = {
  none: "Para empezar a explorar.",
  level1: "Un paso dentro del mundo VIP.",
  level3: "Adiós a los anuncios.",
  level5: "Acceso completo a los links.",
  level8: "Más favoritos y más fases.",
  level12: "VIP total, sin límites.",
  level69: "Nivel élite, para los dedicados.",
  level100: "Para toda la vida — la corona.",
};

function polygonClipPath(sides: number): string {
  const isEven = sides % 2 === 0;
  const startAngle = -Math.PI / 2 - (isEven ? Math.PI / sides : 0);
  const points: string[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = startAngle + (Math.PI * 2 * i) / sides;
    const x = 50 + 50 * Math.cos(angle);
    const y = 50 + 50 * Math.sin(angle);
    points.push(`${x.toFixed(3)}% ${y.toFixed(3)}%`);
  }
  return `polygon(${points.join(", ")})`;
}

function TierShape({
  className,
  tier,
}: {
  className?: string;
  tier: PatronTier;
}) {
  const sides = TIER_SIDES[tier];
  const gradient = PATRON_TIER_GRADIENTS[tier];
  const clip = polygonClipPath(sides);
  return (
    <div
      aria-hidden
      className={cn("relative isolate", className)}
      style={{ filter: "drop-shadow(0 10px 24px rgba(0,0,0,0.45))" }}
    >
      <div
        className="h-full w-full"
        style={{ background: gradient, clipPath: clip }}
      />
      <div
        className="absolute inset-0 mix-blend-overlay"
        style={{
          background:
            "linear-gradient(160deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.25) 100%)",
          clipPath: clip,
        }}
      />
    </div>
  );
}

type CellValue =
  | { kind: "check" }
  | { kind: "cross" }
  | { kind: "text"; label: string; emphasis?: boolean }
  | { kind: "infinity" };

type FeatureRow = {
  label: string;
  hint?: string;
  render: (tier: PatronTier) => CellValue;
};

const CATEGORY_LABELS = {
  completed: "Finalizados",
  ongoing: "En progreso",
} as const;

const FEATURE_ROWS: FeatureRow[] = [
  {
    label: "Precio",
    render: (tier) => ({
      emphasis: true,
      kind: "text",
      label: TIER_PRICE_LABELS[tier],
    }),
  },
  {
    label: "Sin anuncios",
    render: (tier) =>
      PATRON_TIERS[tier].adFree ? { kind: "check" } : { kind: "cross" },
  },
  {
    hint: "Qué categorías desbloquea para ti",
    label: "Links premium",
    render: (tier) => {
      const access = PATRON_TIERS[tier].premiumLinks;
      if (access.type === "none") {
        return { kind: "cross" };
      }
      if (access.type === "all") {
        return { kind: "text", label: "Todos los estados" };
      }
      return {
        kind: "text",
        label: access.categories
          .map((category) => CATEGORY_LABELS[category])
          .join(" · "),
      };
    },
  },
  {
    label: "Early access a juegos",
    render: (tier) => {
      const { level } = PATRON_TIERS[tier];
      if (level >= 3) {
        return { kind: "text", label: "Fase VIP 12 + VIP 8" };
      }
      if (level >= 1) {
        return { kind: "text", label: "Fase VIP 8" };
      }
      return { kind: "cross" };
    },
  },
  {
    label: "Favoritos máximos",
    render: (tier) => {
      const max = PATRON_TIERS[tier].maxBookmarks;
      if (!Number.isFinite(max)) {
        return { kind: "infinity" };
      }
      return { kind: "text", label: String(max) };
    },
  },
  {
    label: "Badge de perfil",
    render: (tier) => {
      const { badge } = PATRON_TIERS[tier];
      if (!badge) {
        return { kind: "cross" };
      }
      return { kind: "text", label: badge };
    },
  },
  {
    label: "Status de por vida",
    render: (tier) =>
      tier === "level100" ? { kind: "check" } : { kind: "cross" },
  },
];

function TierHeaderCell({ tier }: { tier: PatronTier }) {
  const isTop = tier === "level100";
  return (
    <th
      className={cn(
        "relative w-32 border-border/50 border-b bg-card/40 px-3 pt-5 pb-4 text-center align-top font-normal",
        isTop && "bg-card/70"
      )}
      scope="col"
    >
      <div className="flex flex-col items-center gap-3">
        {isTop && (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-300/15 px-2 py-0.5 font-semibold text-[9.5px] text-amber-100 uppercase tracking-[0.18em]">
            <HugeiconsIcon className="size-3" icon={Crown02Icon} />
            Lifetime
          </span>
        )}
        <TierShape className="size-16" tier={tier} />
        <div className="flex flex-col gap-0.5">
          <span className="display-heading text-[17px] text-foreground">
            {TIER_NAMES[tier]}
          </span>
          <span className="font-medium text-[10.5px] text-muted-foreground uppercase tracking-[0.18em]">
            {TIER_PRICE_LABELS[tier]}
          </span>
        </div>
        <p className="min-h-8 text-[11.5px] text-muted-foreground leading-snug">
          {TIER_TAGLINES[tier]}
        </p>
        <Button
          className={cn(
            "h-8 w-full rounded-md text-[12px]",
            isTop &&
              "bg-amber-400 text-amber-950 shadow-glow-amber-400/30 hover:bg-amber-300"
          )}
          render={<Link to="/vip" />}
          variant={
            tier === "none"
              ? "outline"
              : tier === "level69"
                ? "destructive"
                : "default"
          }
          disabled={tier === "level69"}
        >
          {tier === "none"
            ? "Tu plan"
            : tier === "level69"
              ? "Agotado"
              : "Elegir"}
        </Button>
      </div>
    </th>
  );
}

function FeatureCell({ value }: { value: CellValue }) {
  if (value.kind === "check") {
    return (
      <HugeiconsIcon
        aria-label="Incluido"
        className="size-5 text-emerald-400"
        icon={CheckmarkCircle02Icon}
      />
    );
  }
  if (value.kind === "cross") {
    return (
      <HugeiconsIcon
        aria-label="No incluido"
        className="size-4 text-muted-foreground/40"
        icon={Cancel01Icon}
      />
    );
  }
  if (value.kind === "infinity") {
    return (
      <HugeiconsIcon
        aria-label="Ilimitado"
        className="size-5 text-primary"
        icon={InfinityIcon}
      />
    );
  }
  return (
    <span
      className={cn(
        "text-[12px] text-foreground leading-snug",
        value.emphasis &&
          "display-heading font-semibold text-[14px] text-foreground tracking-tight"
      )}
    >
      {value.label}
    </span>
  );
}

function TierComparison() {
  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="inline-flex size-1.5 rounded-full bg-primary shadow-[0_0_10px_2px] shadow-primary/50"
          />
          <h1 className="display-heading text-[24px] text-foreground sm:text-[28px]">
            Elige tu tier
          </h1>
        </div>
        <p className="max-w-2xl text-[13.5px] text-muted-foreground leading-relaxed">
          Desde Free hasta Lvl 100. Cada tier abre un nuevo polígono de
          beneficios — literalmente.
        </p>
        <div className="glow-line mt-2 w-full max-w-md" />
      </header>

      <div className="-mx-4 overflow-x-auto overscroll-x-contain pb-2 sm:mx-0 sm:rounded-2xl sm:border sm:border-border/70 sm:bg-card/50 sm:shadow-md">
        <table className="w-full min-w-240 border-separate border-spacing-0 text-left">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 w-45 border-border/50 border-r border-r-border/60 border-b bg-card"
                scope="col"
              />
              {PATRON_TIER_KEYS.map((tier) => (
                <TierHeaderCell key={tier} tier={tier} />
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURE_ROWS.map((row, rowIndex) => (
              <tr key={row.label}>
                <th
                  className="sticky left-0 z-10 w-45 border-border/40 border-r border-r-border/60 border-b bg-card px-4 py-3 text-left align-middle font-normal"
                  scope="row"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-[12px] text-foreground uppercase tracking-wider">
                      {row.label}
                    </span>
                    {row.hint && (
                      <span className="text-[10.5px] text-muted-foreground leading-snug">
                        {row.hint}
                      </span>
                    )}
                  </div>
                </th>
                {PATRON_TIER_KEYS.map((tier) => (
                  <td
                    className={cn(
                      "border-border/40 border-b px-2 py-3 text-center align-middle",
                      rowIndex % 2 === 0 ? "bg-card/30" : "bg-transparent",
                      tier === "level100" && "bg-amber-400/4"
                    )}
                    key={tier}
                  >
                    <FeatureCell value={row.render(tier)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11.5px] text-muted-foreground/80 leading-snug">
        Los precios y algunos detalles se actualizan según los tiers activos de
        Patreon. Si un beneficio no está disponible en tu tier, aparecerá
        bloqueado cuando intentes usarlo.
      </p>
    </section>
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
