import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";

type RatingDisplayProps = {
  averageRating: number;
  ratingCount?: number;
  variant?: "compact" | "full";
  className?: string;
};

/**
 * Displays rating information
 * - compact: Shows star icon with average and count (for post cards)
 * - full: Shows all 10 stars with visual fill based on average
 */
export function RatingDisplay({
  averageRating,
  ratingCount,
  variant = "compact",
  className,
}: RatingDisplayProps) {
  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <HugeiconsIcon
          className="size-4 fill-amber-400 text-amber-400"
          icon={StarIcon}
        />
        <span className="font-semibold text-sm">
          {averageRating.toFixed(1)}
        </span>
        {ratingCount !== undefined && (
          <span className="text-muted-foreground text-xs">({ratingCount})</span>
        )}
      </div>
    );
  }

  // Full variant - show 10 stars with partial fill support
  const filledStars = Math.floor(averageRating);
  const partialFill = averageRating - filledStars;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Large rating number with score interpretation */}
      <div className="flex items-baseline gap-2">
        <span className="font-bold text-4xl tracking-tight">
          {averageRating.toFixed(1)}
        </span>
        <span className="text-lg text-muted-foreground">/10</span>
      </div>

      {/* Star display */}
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 10 }, (_, i) => {
          const isFilled = i < filledStars;
          const isPartial = i === filledStars && partialFill > 0;

          return (
            <div
              className="relative"
              key={`star-display-${i}-${averageRating}`}
            >
              {/* Background star (empty) */}
              <svg
                aria-hidden="true"
                className="size-6 fill-muted text-muted"
                stroke="currentColor"
                strokeWidth={1}
                viewBox="0 0 24 24"
              >
                <path
                  d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {/* Foreground star (filled or partial) */}
              {(isFilled || isPartial) && (
                <svg
                  aria-hidden="true"
                  className="absolute inset-0 size-6 fill-amber-400 text-amber-400"
                  stroke="currentColor"
                  strokeWidth={1}
                  style={
                    isPartial
                      ? {
                          clipPath: `inset(0 ${100 - partialFill * 100}% 0 0)`,
                        }
                      : undefined
                  }
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>
          );
        })}
      </div>

      {/* Rating count with label */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">
          Basado en{" "}
          <span className="font-medium text-foreground">{ratingCount}</span>{" "}
          {ratingCount === 1 ? "valoración" : "valoraciones"}
        </span>
      </div>
    </div>
  );
}
