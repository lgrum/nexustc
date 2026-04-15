import { Notification03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  AuthDialog,
  AuthDialogContent,
  AuthDialogTrigger,
} from "@/components/auth/auth-dialog";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { orpc, queryClient } from "@/lib/orpc";
import { cn } from "@/lib/utils";

type FollowButtonProps = {
  contentId: string;
};

function FollowButtonUI({
  isFollowing,
  isLoading,
  onClick,
}: {
  isFollowing: boolean;
  isLoading: boolean;
  onClick?: () => void;
}) {
  return (
    <Button
      className={cn(
        "text-white ring-2 hover:bg-emerald-500/80 hover:scale-105 shadow-glow-[oklch(49.6%_0.17_162.48)] hover:shadow-glow-[oklch(69.6%_0.17_162.48)]",
        isFollowing
          ? "ring-emerald-500 bg-emerald-500/50"
          : "ring-emerald-500/35 bg-emerald-500/30"
      )}
      disabled={isLoading}
      onClick={onClick}
    >
      <HugeiconsIcon
        className={cn(isFollowing && "text-emerald-500")}
        icon={Notification03Icon}
      />
      {isFollowing ? "Siguiendo" : "Seguir"}
    </Button>
  );
}

export function FollowButton({ contentId }: FollowButtonProps) {
  const { data: auth } = authClient.useSession();
  const isAuthed = Boolean(auth?.session);
  const followStateQueryOptions = orpc.notification.getFollowState.queryOptions(
    {
      input: { contentId },
    }
  );

  const followStateQuery = useQuery({
    ...followStateQueryOptions,
    enabled: isAuthed,
  });

  const followMutation = useMutation(
    orpc.notification.followContent.mutationOptions({
      onMutate: async () => {
        await queryClient.cancelQueries({
          queryKey: followStateQueryOptions.queryKey,
        });

        const previousState = queryClient.getQueryData<boolean>(
          followStateQueryOptions.queryKey
        );

        queryClient.setQueryData(followStateQueryOptions.queryKey, true);

        return { previousState };
      },
      onError: (error, _variables, context) => {
        queryClient.setQueryData(
          followStateQueryOptions.queryKey,
          context?.previousState ?? false
        );
        toast.error(
          error instanceof Error
            ? error.message
            : "No pudimos seguir este contenido."
        );
      },
      onSettled: async () => {
        await invalidateNotificationFollowQueries(contentId);
      },
      onSuccess: () => {
        toast.success("Ahora recibirás updates de este contenido.");
      },
    })
  );

  const unfollowMutation = useMutation(
    orpc.notification.unfollowContent.mutationOptions({
      onMutate: async () => {
        await queryClient.cancelQueries({
          queryKey: followStateQueryOptions.queryKey,
        });

        const previousState = queryClient.getQueryData<boolean>(
          followStateQueryOptions.queryKey
        );

        queryClient.setQueryData(followStateQueryOptions.queryKey, false);

        return { previousState };
      },
      onError: (error, _variables, context) => {
        queryClient.setQueryData(
          followStateQueryOptions.queryKey,
          context?.previousState ?? true
        );
        toast.error(
          error instanceof Error
            ? error.message
            : "No pudimos dejar de seguir este contenido."
        );
      },
      onSettled: async () => {
        await invalidateNotificationFollowQueries(contentId);
      },
      onSuccess: () => {
        toast.success("Dejarás de recibir actualizaciones de este contenido.");
      },
    })
  );

  if (!isAuthed) {
    return (
      <AuthDialog>
        <AuthDialogTrigger
          render={<FollowButtonUI isFollowing={false} isLoading={false} />}
        />
        <AuthDialogContent />
      </AuthDialog>
    );
  }

  const isFollowing = followStateQuery.data ?? false;
  const isLoading =
    followStateQuery.isLoading ||
    followMutation.isPending ||
    unfollowMutation.isPending;

  return (
    <FollowButtonUI
      isFollowing={isFollowing}
      isLoading={isLoading}
      onClick={() => {
        if (isFollowing) {
          unfollowMutation.mutate({ contentId });
          return;
        }

        followMutation.mutate({ contentId });
      }}
    />
  );
}

async function invalidateNotificationFollowQueries(contentId: string) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: orpc.notification.getFollowState.queryKey({
        input: { contentId },
      }),
    }),
    queryClient.invalidateQueries({
      queryKey: orpc.notification.getFollowing.queryKey({
        input: { limit: 20 },
      }),
    }),
  ]);
}
