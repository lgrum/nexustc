import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { SignedIn } from "@/components/auth/signed-in";
import { SignedOut } from "@/components/auth/signed-out";
import { Button } from "@/components/ui/button";
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

  return (
    <>
      <SignedIn>
        <Button
          className="gap-2"
          onClick={() => setDialogOpen(true)}
          size="sm"
          variant="outline"
        >
          <HugeiconsIcon
            className={userRating ? "fill-amber-400 text-amber-400" : ""}
            icon={StarIcon}
          />
          {userRating ? (
            <span>Tu valoración: {userRating.rating}</span>
          ) : (
            <span>Valorar</span>
          )}
        </Button>
        <RatingDialog
          onOpenChange={setDialogOpen}
          open={dialogOpen}
          postId={postId}
        />
      </SignedIn>
      <SignedOut>
        <Link to="/auth">
          <Button className="gap-2" size="sm" variant="outline">
            <HugeiconsIcon icon={StarIcon} />
            <span>Iniciar sesión para valorar</span>
          </Button>
        </Link>
      </SignedOut>
    </>
  );
}
