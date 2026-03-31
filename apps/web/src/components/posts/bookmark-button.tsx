import { Bookmark02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useDebounceEffect } from "@/hooks/use-debounce-effect";
import { authClient } from "@/lib/auth-client";
import { orpc, queryClient } from "@/lib/orpc";
import { cn } from "@/lib/utils";

import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

type BookmarkRecord = {
  postId: string;
};

type BookmarkMutationContext = {
  previousBookmarks: BookmarkRecord[] | undefined;
};

function BookmarkButtonUI({
  isBookmarked,
  isLoading,
  isDisabled,
  onClick,
}: {
  isBookmarked: boolean;
  isLoading: boolean;
  isDisabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      className={cn(
        "text-white",
        isBookmarked
          ? "border-blue-600 bg-blue-600/30"
          : "border-blue-800 bg-blue-600/10"
      )}
      disabled={isLoading || isDisabled}
      onClick={onClick}
    >
      <HugeiconsIcon
        className={cn(
          "text-blue-500",
          isBookmarked ? "fill-blue-500" : "fill-none"
        )}
        icon={Bookmark02Icon}
      />
      {isBookmarked ? "Guardado" : "Guardar"}
    </Button>
  );
}

export function BookmarkButton({ postId }: { postId: string }) {
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

  // Query to fetch user's bookmarks
  const bookmarksQueryOptions = orpc.user.getBookmarks.queryOptions();
  const { data: userBookmarks, isLoading: isLoadingBookmarks } = useQuery({
    ...bookmarksQueryOptions,
    enabled: !!auth,
  });

  // Calculate if current post is bookmarked
  const isBookmarked = userBookmarks?.some((b) => b.postId === postId) ?? false;

  // Mutation with optimistic updates
  const bookmarkMutation = useMutation(
    orpc.user.toggleBookmark.mutationOptions<BookmarkMutationContext>({
      onError: (error, variables, onMutateResult) => {
        // Rollback on error
        if (onMutateResult?.previousBookmarks !== undefined) {
          queryClient.setQueryData(
            bookmarksQueryOptions.queryKey,
            onMutateResult.previousBookmarks
          );
        }

        // Show error toast with appropriate message
        const action = variables.bookmarked ? "guardar" : "quitar";
        toast.error(
          `Error al ${action} marcador: ${error instanceof Error ? error.message : "Error desconocido"}`,
          { duration: 5000 }
        );
      },

      onMutate: async (variables) => {
        // Cancel outgoing refetches
        await queryClient.cancelQueries(bookmarksQueryOptions);

        // Snapshot current value
        const previousBookmarks = queryClient.getQueryData<BookmarkRecord[]>(
          bookmarksQueryOptions.queryKey
        );

        // Optimistically update cache
        queryClient.setQueryData(
          bookmarksQueryOptions.queryKey,
          (old: BookmarkRecord[] | undefined) => {
            if (!old) {
              return old;
            }

            if (variables.bookmarked) {
              // Add bookmark optimistically
              return [...old, { postId: variables.postId }];
            }
            // Remove bookmark optimistically
            return old.filter((b) => b.postId !== variables.postId);
          }
        );

        return { previousBookmarks };
      },

      onSettled: () => {
        // Refetch to ensure consistency
        queryClient.invalidateQueries(bookmarksQueryOptions);
      },
    })
  );

  // Unauthenticated state - static disabled button
  if (!auth) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <BookmarkButtonUI
              isBookmarked={false}
              isDisabled={true}
              isLoading={false}
            />
          }
        />
        <TooltipContent>Inicia sesión para guardar posts</TooltipContent>
      </Tooltip>
    );
  }

  const handleClick = () => {
    if (cooldown || bookmarkMutation.isPending || isLoadingBookmarks) {
      return;
    }

    setCooldown(true);

    bookmarkMutation.mutate({
      bookmarked: !isBookmarked,
      postId,
    });
  };

  return (
    <BookmarkButtonUI
      isBookmarked={isBookmarked}
      isLoading={isLoadingBookmarks || cooldown || bookmarkMutation.isPending}
      onClick={handleClick}
    />
  );
}
