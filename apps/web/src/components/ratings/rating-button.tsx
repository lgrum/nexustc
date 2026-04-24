import { Login02Icon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { SignedIn } from "@/components/auth/signed-in";
import { SignedOut } from "@/components/auth/signed-out";
import { orpcClient } from "@/lib/orpc";

import { RatingDialog } from "./rating-dialog";

type RatingButtonProps = {
  postId: string;
};

export function RatingButton({ postId }: RatingButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: userRating } = useQuery({
    queryFn: () => orpcClient.rating.getUserRating({ postId }),
    queryKey: ["rating", "user", postId],
  });

  const hasRating = !!userRating;

  return (
    <>
      <SignedIn>
        <button
          className="group relative inline-flex h-10 items-center gap-2.5 overflow-hidden rounded-full border border-amber-400/35 bg-amber-400/10 px-4 font-medium text-[12.5px] text-amber-100 shadow-[0_0_24px_-8px] shadow-amber-400/40 outline-none transition-[background-color,border-color,box-shadow] duration-200 hover:border-amber-400/55 hover:bg-amber-400/15 hover:shadow-[0_0_28px_-6px] hover:shadow-amber-400/55 focus-visible:ring-2 focus-visible:ring-amber-300/50"
          onClick={() => setDialogOpen(true)}
          type="button"
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-full bg-linear-to-r from-amber-300/20 to-transparent"
          />
          <span className="relative flex size-5 items-center justify-center">
            <span
              aria-hidden
              className="-inset-1 absolute rounded-full bg-amber-300/30 blur-md"
            />
            <HugeiconsIcon
              className={`relative size-4 transition-transform duration-200 group-hover:scale-110 ${
                hasRating ? "fill-amber-300 text-amber-300" : "text-amber-200"
              }`}
              icon={StarIcon}
              strokeWidth={1.8}
            />
          </span>
          {hasRating ? (
            <span className="relative flex items-center gap-1.5">
              <span>Tu valoración</span>
              <span className="inline-flex items-center rounded-full border border-amber-300/35 bg-black/30 px-1.5 py-px font-semibold text-[11px] text-amber-100 tabular-nums">
                {userRating.rating}/10
              </span>
            </span>
          ) : (
            <span className="relative">Valorar este post</span>
          )}
        </button>
        <RatingDialog
          onOpenChange={setDialogOpen}
          open={dialogOpen}
          postId={postId}
        />
      </SignedIn>
      <SignedOut>
        <Link
          className="group inline-flex h-10 items-center gap-2 rounded-full border border-border/70 bg-card/60 px-4 font-medium text-[12.5px] text-muted-foreground outline-none transition-colors duration-200 hover:border-amber-400/40 hover:bg-amber-400/5 hover:text-amber-100 focus-visible:ring-2 focus-visible:ring-ring/50"
          to="/auth"
        >
          <HugeiconsIcon
            className="size-4 transition-colors duration-200 group-hover:text-amber-200"
            icon={Login02Icon}
            strokeWidth={1.8}
          />
          <span>Inicia sesión para valorar</span>
        </Link>
      </SignedOut>
    </>
  );
}
