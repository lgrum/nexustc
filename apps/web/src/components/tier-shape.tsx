import { PATRON_TIER_GRADIENTS } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";

import { cn } from "@/lib/utils";

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

export function TierShape({
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
