import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Crown02Icon,
  InfinityIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PATREON_TIER_MAPPING,
  PATRON_TIER_KEYS,
  PATRON_TIER_PROFILE_BADGES,
  PATRON_TIERS,
  userMeetsTierLevel,
} from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import { EARLY_ACCESS_DEFAULTS } from "@repo/shared/early-access";
import { createFileRoute } from "@tanstack/react-router";

import { TierShape } from "@/components/tier-shape";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_main/memberships")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Membresías",
      },
    ],
  }),
});

function RouteComponent() {
  return (
    <main className="flex flex-col gap-8 px-4 py-6">
      <TierComparison />
    </main>
  );
}

const TIER_SETTINGS: Record<
  PatronTier,
  {
    price: string;
    name: string;
    activeCheckout: boolean;
    emojis: number;
    avatar: "static" | "animated";
    banner: "none" | "static" | "animated";
  }
> = {
  none: {
    price: "Gratis",
    name: "Free",
    activeCheckout: true,
    emojis: 0,
    avatar: "static",
    banner: "none",
  },
  level1: {
    price: "$1.25/mes",
    name: "LvL 1",
    activeCheckout: true,
    emojis: 3,
    avatar: "static",
    banner: "none",
  },
  level3: {
    price: "$3.25/mes",
    name: "LvL 3",
    activeCheckout: true,
    emojis: 7,
    avatar: "animated",
    banner: "none",
  },
  level5: {
    price: "$5.99/mes",
    name: "LvL 5",
    activeCheckout: true,
    emojis: 13,
    avatar: "animated",
    banner: "static",
  },
  level8: {
    price: "$8.99/mes",
    name: "LvL 8",
    activeCheckout: true,
    emojis: 22,
    avatar: "animated",
    banner: "animated",
  },
  level12: {
    price: "$12.34/mes",
    name: "LvL 12",
    activeCheckout: true,
    emojis: Number.POSITIVE_INFINITY,
    avatar: "animated",
    banner: "animated",
  },
  level69: {
    price: "—",
    name: "LvL 69",
    activeCheckout: false,
    emojis: Number.POSITIVE_INFINITY,
    avatar: "animated",
    banner: "animated",
  },
  level100: {
    price: "$199.00 único",
    name: "LvL 100",
    activeCheckout: true,
    emojis: Number.POSITIVE_INFINITY,
    avatar: "animated",
    banner: "animated",
  },
};

const TIER_TO_PATREON_ID: Partial<Record<PatronTier, string>> =
  Object.fromEntries(
    Object.entries(PATREON_TIER_MAPPING).map(([id, tier]) => [tier, id])
  );

function patreonCheckoutUrl(tier: PatronTier): string | null {
  if (!TIER_SETTINGS[tier].activeCheckout) {
    return null;
  }
  const id = TIER_TO_PATREON_ID[tier];
  if (!id) {
    return null;
  }
  return `https://www.patreon.com/checkout/NeXusTC18?rid=${id}&vanity=14169847`;
}

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
  completed: "Finalizados/Abandonados",
  ongoing: "En Progreso",
} as const;

function getTierEarlyAccessValue(tier: PatronTier): CellValue {
  if (userMeetsTierLevel({ tier }, "level12")) {
    return {
      kind: "text",
      label: `${EARLY_ACCESS_DEFAULTS.vip12Hours + EARLY_ACCESS_DEFAULTS.vip8Hours} hs`,
    };
  }

  if (userMeetsTierLevel({ tier }, "level8")) {
    return { kind: "text", label: `${EARLY_ACCESS_DEFAULTS.vip8Hours} hs` };
  }

  return { kind: "cross" };
}

const FEATURE_ROWS: FeatureRow[] = [
  {
    label: "Precio",
    render: (tier) => ({
      emphasis: true,
      kind: "text",
      label: TIER_SETTINGS[tier].price,
    }),
  },
  {
    label: "Sin anuncios",
    render: (tier) =>
      PATRON_TIERS[tier].adFree ? { kind: "check" } : { kind: "cross" },
  },
  {
    label: "Links premium",
    render: (tier) => {
      const access = PATRON_TIERS[tier].premiumLinks;
      if (access.type === "none") {
        return { kind: "cross" };
      }
      if (access.type === "all") {
        return { kind: "text", label: "Todos" };
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
    render: getTierEarlyAccessValue,
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
    label: "Emojis desbloqueados",
    render: (tier) => {
      const max = TIER_SETTINGS[tier].emojis;
      if (max === 0) {
        return { kind: "cross" };
      }
      if (!Number.isFinite(max)) {
        return { kind: "infinity" };
      }
      return { kind: "text", label: String(max) };
    },
  },
  {
    label: "Avatar",
    render: (tier) => {
      const { avatar } = TIER_SETTINGS[tier];
      if (avatar === "static") {
        return { kind: "text", label: "Estático" };
      }
      return { kind: "text", label: "Animado" };
    },
  },
  {
    label: "Banner",
    render: (tier) => {
      const { banner } = TIER_SETTINGS[tier];
      if (banner === "none") {
        return { kind: "cross" };
      }
      if (banner === "static") {
        return { kind: "text", label: "Estático" };
      }
      return { kind: "text", label: "Animado" };
    },
  },
  {
    label: "Badge de perfil",
    render: (tier) => {
      const { badge } = PATRON_TIERS[tier];
      const profileBadge = PATRON_TIER_PROFILE_BADGES[tier] ?? badge;
      if (!profileBadge) {
        return { kind: "cross" };
      }
      return { kind: "text", label: profileBadge };
    },
  },
  {
    label: "TextBox Exclusivo",
    render: (tier) => {
      if (tier === "none") {
        return { kind: "cross" };
      }
      return { kind: "check" };
    },
  },
  {
    label: "Status de por vida",
    render: (tier) =>
      tier === "level100" || tier === "level69"
        ? { kind: "check" }
        : { kind: "cross" },
  },
];

function TierHeaderCell({ tier }: { tier: PatronTier }) {
  const isTop = tier === "level100";
  const checkoutUrl = patreonCheckoutUrl(tier);
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
          <span
            aria-label="Lifetime"
            className="absolute top-2 right-2 z-10 inline-flex size-6 items-center justify-center rounded-full border border-amber-300/40 bg-amber-300/15 text-amber-100"
          >
            <HugeiconsIcon className="size-3.5" icon={Crown02Icon} />
          </span>
        )}
        <TierShape className="size-16" tier={tier} />
        <div className="flex flex-col gap-0.5">
          <span className="display-heading text-[17px] text-foreground">
            {TIER_SETTINGS[tier].name}
          </span>
          <span className="font-medium text-[10.5px] text-muted-foreground uppercase tracking-[0.18em]">
            {TIER_SETTINGS[tier].price}
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
          disabled={tier === "level69" || tier === "none"}
          render={
            checkoutUrl ? (
              <a
                aria-label={`Comprar ${TIER_SETTINGS[tier].name} en Patreon`}
                href={checkoutUrl}
                rel="noopener noreferrer"
                target="_blank"
              />
            ) : undefined
          }
          variant={
            tier === "none"
              ? "outline"
              : tier === "level69"
                ? "destructive"
                : "default"
          }
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
        className="mx-auto size-5 text-emerald-400"
        icon={CheckmarkCircle02Icon}
      />
    );
  }
  if (value.kind === "cross") {
    return (
      <HugeiconsIcon
        aria-label="No incluido"
        className="mx-auto size-4 text-muted-foreground/40"
        icon={Cancel01Icon}
      />
    );
  }
  if (value.kind === "infinity") {
    return (
      <HugeiconsIcon
        aria-label="Ilimitado"
        className="mx-auto size-5 text-primary"
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
