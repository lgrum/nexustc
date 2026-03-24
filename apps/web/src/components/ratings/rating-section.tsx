import { ArrowRight01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { RatingButton } from "./rating-button";
import { RatingDisplay } from "./rating-display";
import { RatingList } from "./rating-list";

type RatingSectionProps = {
  stats: {
    id: string;
    averageRating: number;
    ratingCount: number;
  };
};

export function RatingSection({ stats }: RatingSectionProps) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  if (!visible) {
    return (
      <div
        className="flex min-h-100 items-center justify-center rounded-3xl border bg-card p-6"
        ref={ref}
      >
        <Spinner />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-6 rounded-3xl border bg-card p-6"
      ref={ref}
    >
      {/* Header with icon and title */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/10">
            <HugeiconsIcon
              className="size-5 text-amber-500"
              icon={StarIcon}
              strokeWidth={2}
            />
          </div>
          <h2 className="font-bold text-2xl">Valoraciones</h2>
        </div>

        {/* Rating summary */}
        {stats.ratingCount > 0 ? (
          <div className="flex flex-col gap-4 rounded-2xl bg-linear-to-br from-amber-500/5 to-orange-500/5 p-4">
            <RatingDisplay
              averageRating={stats.averageRating}
              ratingCount={stats.ratingCount}
              variant="full"
            />
          </div>
        ) : (
          <p className="text-muted-foreground">
            Aún no hay valoraciones. ¡Sé el primero!
          </p>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-3">
          <RatingButton postId={stats.id} />
          {stats.ratingCount > 0 && (
            <Link params={{ id: stats.id }} to="/post/reviews/$id">
              <Button>
                <HugeiconsIcon className="size-4" icon={ArrowRight01Icon} />
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Rating list */}
      <div className="flex flex-col gap-4">
        <RatingList postId={stats.id} />
      </div>
    </div>
  );
}
