import { FavouriteIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { useDebounceEffect } from "@/hooks/use-debounce-effect";
import { authClient } from "@/lib/auth-client";
import { orpc, queryClient } from "@/lib/orpc";
import { cn } from "@/lib/utils";

import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { PostActionButton } from "./post-action-button";

type LikeRecord = {
  postId: string;
};

type LikeMutationContext = {
  previousLikes: LikeRecord[] | undefined;
};

function LikeButtonUI({
  isLiked,
  isLoading,
  isDisabled,
  onClick,
}: {
  isLiked: boolean;
  isLoading: boolean;
  isDisabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <PostActionButton
      active={isLiked}
      disabled={isLoading || isDisabled}
      onClick={onClick}
      tone="rose"
    >
      <HugeiconsIcon
        className={cn("text-rose-600", isLiked ? "fill-rose-600" : "fill-none")}
        icon={FavouriteIcon}
      />
      Me Gusta
    </PostActionButton>
  );
}

export function LikeButton({ postId }: { postId: string }) {
  const { data: auth } = authClient.useSession();
  const [cooldown, setCooldown] = useState(false);

  // Reset cooldown after 2 seconds
  useDebounceEffect(
    () => {
      if (cooldown) {
        setCooldown(false);
      }
    },
    2000,
    [cooldown]
  );

  // Query to fetch user's likes
  const likesQueryOptions = orpc.user.getLikes.queryOptions();
  const { data: userLikes, isLoading: isLoadingLikes } = useQuery({
    ...likesQueryOptions,
    enabled: !!auth,
  });

  // Calculate if current post is liked
  const isLiked = userLikes?.some((b) => b.postId === postId) ?? false;

  // Mutation with optimistic updates
  const likeMutation = useMutation(
    orpc.user.toggleLike.mutationOptions<LikeMutationContext>({
      onError: (error, variables, onMutateResult) => {
        // Rollback on error
        if (onMutateResult?.previousLikes !== undefined) {
          queryClient.setQueryData(
            likesQueryOptions.queryKey,
            onMutateResult.previousLikes
          );
        }

        // Show error toast with appropriate message
        const action = variables.liked ? "agregar" : "quitar";
        toast.error(
          `Error al ${action} me gusta: ${error instanceof Error ? error.message : "Error desconocido"}`,
          { duration: 5000 }
        );
      },

      onMutate: async (variables) => {
        // Cancel outgoing refetches
        await queryClient.cancelQueries(likesQueryOptions);

        // Snapshot current value
        const previousLikes = queryClient.getQueryData<LikeRecord[]>(
          likesQueryOptions.queryKey
        );

        // Optimistically update cache
        queryClient.setQueryData(
          likesQueryOptions.queryKey,
          (old: LikeRecord[] | undefined) => {
            if (!old) {
              return old;
            }

            if (variables.liked) {
              // Add like optimistically
              return [...old, { postId: variables.postId }];
            }
            // Remove like optimistically
            return old.filter((b) => b.postId !== variables.postId);
          }
        );

        return { previousLikes };
      },

      onSettled: () => {
        // Refetch to ensure consistency
        queryClient.invalidateQueries(likesQueryOptions);
      },
    })
  );

  // Unauthenticated state - static disabled button
  if (!auth) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <LikeButtonUI isDisabled={true} isLiked={false} isLoading={false} />
          }
        />
        <TooltipContent>Inicia sesión para dar me gusta</TooltipContent>
      </Tooltip>
    );
  }

  const handleClick = () => {
    if (cooldown || likeMutation.isPending || isLoadingLikes) {
      return;
    }

    setCooldown(true);

    likeMutation.mutate({
      liked: !isLiked,
      postId,
    });
  };

  return (
    <LikeButtonUI
      isLiked={isLiked}
      isLoading={isLoadingLikes || cooldown || likeMutation.isPending}
      onClick={handleClick}
    />
  );
}
