import {
  Delete02Icon,
  FavouriteIcon,
  MoreHorizontalIcon,
  PinIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MAX_PINNED_ITEMS_PER_POST } from "@repo/shared/constants";
import type { Role } from "@repo/shared/permissions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const confirm = useConfirm();
  const role = session?.user.role as Role | undefined;
  const canPinReviews = role
    ? authClient.admin.checkRolePermission({
        permissions: { ratings: ["pin"] },
        role,
      })
    : false;
  const canDeleteAnyReviews = role
    ? authClient.admin.checkRolePermission({
        permissions: { ratings: ["delete"] },
        role,
      })
    : false;

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

  const toggleReviewLikeMutation = useMutation({
    mutationFn: ({
      liked,
      postId: targetPostId,
      ratingUserId,
    }: {
      liked: boolean;
      postId: string;
      ratingUserId: string;
    }) =>
      orpcClient.rating.toggleReviewLike({
        liked,
        postId: targetPostId,
        ratingUserId,
      }),
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el like.";
      toast.error(message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ratings", postId] });
    },
  });

  const handleDelete = async ({
    isOwnRating,
    postId: targetPostId,
    userId,
  }: {
    isOwnRating: boolean;
    postId: string;
    userId: string;
  }) => {
    const isConfirmed = await confirm({
      cancelText: "Cancelar",
      confirmText: "Eliminar",
      description: isOwnRating
        ? "¿Estás seguro de que quieres eliminar tu valoración? Esta acción no se puede deshacer."
        : "¿Estás seguro de que quieres eliminar esta valoración? Esta acción no se puede deshacer.",
      title: "Eliminar valoración",
    });

    if (!isConfirmed) {
      return;
    }

    if (isOwnRating) {
      deleteOwnMutation.mutate({ postId: targetPostId });
      return;
    }

    deleteAnyMutation.mutate({
      postId: targetPostId,
      userId,
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
    <div className="flex flex-col gap-3">
      {data.ratings.map((rating) => {
        const author = authorMap.get(rating.userId);
        const isOwnRating = session?.user?.id === rating.userId;
        const canDelete = isOwnRating || (!isOwnRating && canDeleteAnyReviews);
        const canPin = rating.review.trim().length > 0 && canPinReviews;
        const showActionsMenu = canDelete || canPin;

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
                <span className="text-muted-foreground text-xs">•</span>
                <time className="text-muted-foreground text-xs">
                  {format(rating.createdAt, "d MMM yyyy", { locale: es })}
                </time>
                {rating.pinnedAt ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1 py-1 font-medium text-muted-foreground text-xs">
                    <HugeiconsIcon className="size-5" icon={PinIcon} />
                  </span>
                ) : null}
                {showActionsMenu ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          className="ml-auto"
                          size="icon"
                          variant="ghost"
                        />
                      }
                    >
                      <HugeiconsIcon icon={MoreHorizontalIcon} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {canPin ? (
                        <DropdownMenuItem
                          onClick={() =>
                            setPinnedMutation.mutate({
                              pinned: rating.pinnedAt === null,
                              postId: rating.postId,
                              userId: rating.userId,
                            })
                          }
                          variant={rating.pinnedAt ? "destructive" : "default"}
                        >
                          <HugeiconsIcon icon={PinIcon} />
                          {rating.pinnedAt ? "Desfijar" : "Fijar"}
                        </DropdownMenuItem>
                      ) : null}
                      {canDelete && canPin ? <DropdownMenuSeparator /> : null}
                      {canDelete ? (
                        <DropdownMenuItem
                          onClick={() =>
                            handleDelete({
                              isOwnRating,
                              postId: rating.postId,
                              userId: rating.userId,
                            })
                          }
                          variant="destructive"
                        >
                          <HugeiconsIcon icon={Delete02Icon} />
                          Eliminar
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
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

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="h-8 gap-1 px-2 text-xs"
                  disabled={toggleReviewLikeMutation.isPending}
                  onClick={() => {
                    if (!session?.user) {
                      toast.info("Inicia sesion para dar like.");
                      return;
                    }

                    toggleReviewLikeMutation.mutate({
                      liked: !rating.likedByViewer,
                      postId: rating.postId,
                      ratingUserId: rating.userId,
                    });
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    className={
                      rating.likedByViewer
                        ? "size-4 fill-rose-600 text-rose-600"
                        : "size-4"
                    }
                    icon={FavouriteIcon}
                  />
                  {rating.likeCount}
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
