import { Delete02Icon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";

import { HasPermissions } from "@/components/auth/has-role";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { UserLabel } from "@/components/users/user-label";
import { authClient } from "@/lib/auth-client";
import { orpcClient } from "@/lib/orpc";

import { ReviewMarkdown } from "./review-markdown";
import { StarRatingInput } from "./star-rating-input";

type RatingListProps = {
  postId: string;
};

export function RatingList({ postId }: RatingListProps) {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();

  const [deleteTarget, setDeleteTarget] = useState<{
    postId: string;
    userId: string;
    isOwnRating: boolean;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryFn: () => orpcClient.rating.getByPostId({ postId }),
    queryKey: ["ratings", postId],
  });

  const deleteOwnMutation = useMutation({
    mutationFn: ({ postId: post }: { postId: string }) =>
      orpcClient.rating.delete({ postId: post }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ratings", postId] });
      queryClient.invalidateQueries({ queryKey: ["rating", "user", postId] });
      queryClient.invalidateQueries({ queryKey: ["rating", "stats", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      setDeleteTarget(null);
    },
  });

  const deleteAnyMutation = useMutation({
    mutationFn: ({
      postId: post,
      userId,
    }: {
      postId: string;
      userId: string;
    }) => orpcClient.rating.deleteAny({ postId: post, userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ratings", postId] });
      queryClient.invalidateQueries({ queryKey: ["rating", "stats", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      setDeleteTarget(null);
    },
  });

  const handleDelete = () => {
    if (!deleteTarget) {
      return;
    }

    if (deleteTarget.isOwnRating) {
      deleteOwnMutation.mutate({ postId: deleteTarget.postId });
    } else {
      deleteAnyMutation.mutate({
        postId: deleteTarget.postId,
        userId: deleteTarget.userId,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!data || data.ratings.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <HugeiconsIcon
            className="size-6 text-muted-foreground"
            icon={StarIcon}
          />
        </div>
        <p className="text-muted-foreground">
          Aún no hay valoraciones. ¡Sé el primero!
        </p>
      </div>
    );
  }

  const authorMap = new Map(data.authors.map((a) => [a.id, a]));

  return (
    <>
      <div className="flex flex-col gap-3">
        {data.ratings.map((rating) => {
          const author = authorMap.get(rating.userId);
          const isOwnRating = session?.user?.id === rating.userId;
          const canDelete = isOwnRating;

          return (
            <div
              className="group flex gap-4 rounded-2xl border bg-background p-4 transition-colors hover:bg-muted/30"
              key={rating.userId}
            >
              {author ? (
                <Link params={{ id: author.id }} to="/user/$id">
                  <ProfileAvatar
                    className="size-10 ring-2 ring-background transition-transform group-hover:scale-105"
                    user={author}
                  />
                </Link>
              ) : (
                <Avatar className="size-10 ring-2 ring-background">
                  <AvatarFallback className="bg-muted">?</AvatarFallback>
                </Avatar>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                {/* Header row */}
                <div className="flex flex-wrap items-center gap-2">
                  {author ? (
                    <Link params={{ id: author.id }} to="/user/$id">
                      <UserLabel
                        className="font-semibold transition-colors hover:text-primary"
                        user={author}
                      />
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">
                      Usuario eliminado
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">•</span>
                  <time className="text-muted-foreground text-xs">
                    {format(rating.createdAt, "d MMM yyyy", { locale: es })}
                  </time>
                  {/* Delete buttons */}
                  {canDelete && (
                    <Button
                      className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() =>
                        setDeleteTarget({
                          isOwnRating: true,
                          postId: rating.postId,
                          userId: rating.userId,
                        })
                      }
                      size="icon-xs"
                      variant="ghost"
                    >
                      <HugeiconsIcon
                        className="size-4 text-destructive"
                        icon={Delete02Icon}
                      />
                    </Button>
                  )}
                  {!isOwnRating && (
                    <HasPermissions permissions={{ ratings: ["delete"] }}>
                      <Button
                        className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={() =>
                          setDeleteTarget({
                            isOwnRating: false,
                            postId: rating.postId,
                            userId: rating.userId,
                          })
                        }
                        size="icon-xs"
                        variant="ghost"
                      >
                        <HugeiconsIcon
                          className="size-4 text-destructive"
                          icon={Delete02Icon}
                        />
                      </Button>
                    </HasPermissions>
                  )}
                </div>

                {/* Star rating display */}
                <div className="flex items-center gap-2">
                  <StarRatingInput
                    disabled
                    onChange={() => {
                      // Read-only display
                    }}
                    size="sm"
                    value={rating.rating}
                  />
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-600 text-sm">
                    {rating.rating}/10
                  </span>
                </div>

                {/* Review content */}
                {rating.review && (
                  <div className="mt-1 text-foreground/90 text-sm leading-relaxed">
                    <ReviewMarkdown>{rating.review}</ReviewMarkdown>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        open={!!deleteTarget}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar valoración</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.isOwnRating
                ? "¿Estás seguro de que quieres eliminar tu valoración? Esta acción no se puede deshacer."
                : "¿Estás seguro de que quieres eliminar esta valoración? Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
