import { Delete02Icon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MAX_PINNED_ITEMS_PER_POST } from "@repo/shared/constants";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";
import { toast } from "sonner";

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

  const setPinnedMutation = useMutation({
    mutationFn: ({
      pinned,
      postId: post,
      userId,
    }: {
      pinned: boolean;
      postId: string;
      userId: string;
    }) => orpcClient.rating.setPinned({ pinned, postId: post, userId }),
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : `No se pudo actualizar la resena fijada.`;

      toast.error(
        message.includes(`${MAX_PINNED_ITEMS_PER_POST}`)
          ? message
          : `Ocurrio un error. ${message}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ratings", postId] });
    },
  });

  const handleDelete = () => {
    if (!deleteTarget) {
      return;
    }

    if (deleteTarget.isOwnRating) {
      deleteOwnMutation.mutate({ postId: deleteTarget.postId });
      return;
    }

    deleteAnyMutation.mutate({
      postId: deleteTarget.postId,
      userId: deleteTarget.userId,
    });
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
          Aun no hay valoraciones. Se el primero.
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
          const canPin = rating.review.trim().length > 0;

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
                  {rating.pinnedAt && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
                      Fijado
                    </span>
                  )}
                  <span className="text-muted-foreground text-xs">•</span>
                  <time className="text-muted-foreground text-xs">
                    {format(rating.createdAt, "d MMM yyyy", { locale: es })}
                  </time>
                  <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {canPin && (
                      <HasPermissions permissions={{ ratings: ["pin"] }}>
                        <Button
                          loading={
                            setPinnedMutation.isPending &&
                            setPinnedMutation.variables?.postId ===
                              rating.postId &&
                            setPinnedMutation.variables?.userId ===
                              rating.userId
                          }
                          onClick={() =>
                            setPinnedMutation.mutate({
                              pinned: rating.pinnedAt === null,
                              postId: rating.postId,
                              userId: rating.userId,
                            })
                          }
                          size="xs"
                          variant="ghost"
                        >
                          {rating.pinnedAt ? "Desfijar" : "Fijar"}
                        </Button>
                      </HasPermissions>
                    )}
                    {canDelete && (
                      <Button
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
                </div>

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
            <AlertDialogTitle>Eliminar valoracion</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.isOwnRating
                ? "Estas seguro de que quieres eliminar tu valoracion? Esta accion no se puede deshacer."
                : "Estas seguro de que quieres eliminar esta valoracion? Esta accion no se puede deshacer."}
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
