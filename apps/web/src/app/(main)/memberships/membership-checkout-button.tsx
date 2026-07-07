"use client";

import type { PatronTier } from "@repo/shared/constants";

import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function MembershipCheckoutButton({
  checkoutUrl,
  isTop,
  name,
  tier,
}: {
  checkoutUrl: string | null;
  isTop: boolean;
  name: string;
  tier: PatronTier;
}) {
  return (
    <Button
      className={cn(
        "h-8 w-full rounded-md text-[12px]",
        isTop &&
          "bg-amber-400 text-amber-950 shadow-glow-amber-400/30 hover:bg-amber-300"
      )}
      disabled={tier === "level69" || tier === "none"}
      nativeButton={!checkoutUrl}
      render={
        checkoutUrl ? (
          <a
            aria-label={`Comprar ${name} en Patreon`}
            href={checkoutUrl}
            onClick={() => {
              trackEvent("membership_tier_selected", {
                source: "memberships",
                tier,
              });
              trackEvent("checkout_started", {
                provider: "patreon",
                source: "memberships",
                tier,
              });
            }}
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
      {tier === "none" ? "Tu plan" : tier === "level69" ? "Agotado" : "Elegir"}
    </Button>
  );
}
