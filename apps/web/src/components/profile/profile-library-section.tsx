"use client";

import {
  Bookmark02Icon,
  Delete02Icon,
  Edit02Icon,
  ViewIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ProfileActivityVisibility } from "@repo/shared/profile";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ProfileBookmarkGrid } from "@/components/profile/profile-bookmark-grid";
import type { ProfileReviewItem } from "@/components/profile/profile-review-list";
import { ProfileReviewList } from "@/components/profile/profile-review-list";
import {
  ProfileCollectionState,
  ProfileLoadMore,
  ProfilePanel,
  ProfileSectionHeader,
} from "@/components/profile/profile-section";
import { RatingDialog } from "@/components/ratings/rating-dialog";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trackEvent } from "@/lib/analytics";
import { orpc, orpcClient } from "@/lib/orpc";

const REVIEW_PAGE_SIZE = 10;

type PrivateReviewsPage = Awaited<
  ReturnType<(typeof orpcClient.rating)["getMyReviews"]>
>;
type PrivateReviewsCursor = NonNullable<PrivateReviewsPage["nextCursor"]>;

export function ProfileLibrarySection({
  visibility,
}: {
  visibility: ProfileActivityVisibility;
}) {
  return (
    <div className="space-y-5">
      <VisibilityPanel visibility={visibility} />
      <ProfilePanel className="p-5 sm:p-6">
        <ProfileSectionHeader
          description="Consulta lo que guardaste y administra las reseñas que publicaste."
          eyebrow="Biblioteca personal"
          icon={Bookmark02Icon}
          title="Favoritos y reseñas"
        />
        <Tabs className="mt-6 gap-5" defaultValue="favorites">
          <TabsList
            aria-label="Secciones de la biblioteca"
            className="h-auto w-full gap-6 rounded-none border-border/60 border-b bg-transparent p-0"
            variant="line"
          >
            <TabsTrigger className="after:bg-primary" value="favorites">
              <HugeiconsIcon aria-hidden icon={Bookmark02Icon} />
              Favoritos
            </TabsTrigger>
            <TabsTrigger className="after:bg-primary" value="reviews">
              <HugeiconsIcon aria-hidden icon={StarIcon} />
              Reseñas
            </TabsTrigger>
          </TabsList>
          <TabsContent value="favorites">
            <PrivateBookmarks />
          </TabsContent>
          <TabsContent value="reviews">
            <PrivateReviews />
          </TabsContent>
        </Tabs>
      </ProfilePanel>
    </div>
  );
}

function VisibilityPanel({
  visibility,
}: {
  visibility: ProfileActivityVisibility;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (next: Partial<ProfileActivityVisibility>) =>
      orpcClient.profile.updateVisibility(next),
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos actualizar la privacidad."
      );
    },
    onSuccess: async ({ visibility: nextVisibility }) => {
      await queryClient.invalidateQueries(
        orpc.profile.getMySettings.queryOptions()
      );
      trackEvent("profile_visibility_updated", {
        favorites: nextVisibility.favorites,
        reviews: nextVisibility.reviews,
      });
      toast.success("Privacidad actualizada");
    },
  });

  return (
    <ProfilePanel className="p-5 sm:p-6">
      <ProfileSectionHeader
        description="El contenido siempre seguirá disponible para ti aquí. Estos controles solo cambian lo que aparece en tu perfil público."
        eyebrow="Privacidad"
        icon={ViewIcon}
        title="Visibilidad de tu actividad"
      />
      <ItemGroup className="mt-6">
        <VisibilityItem
          checked={visibility.favorites}
          description="Permite que otras personas exploren los juegos y comics que guardaste."
          disabled={mutation.isPending}
          id="profile-favorites-visibility"
          label="Mostrar mis favoritos públicamente"
          onCheckedChange={(checked) => mutation.mutate({ favorites: checked })}
        />
        <VisibilityItem
          checked={visibility.reviews}
          description="Muestra tus puntuaciones y textos en tu perfil de la comunidad."
          disabled={mutation.isPending}
          id="profile-reviews-visibility"
          label="Mostrar mis reseñas públicamente"
          onCheckedChange={(checked) => mutation.mutate({ reviews: checked })}
        />
      </ItemGroup>
    </ProfilePanel>
  );
}

function VisibilityItem({
  checked,
  description,
  disabled,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Item
      className="gap-4 rounded-[1.25rem] bg-background/45 p-4"
      variant="outline"
    >
      <ItemMedia
        className="size-10 rounded-xl bg-primary/10 text-primary"
        variant="icon"
      >
        <HugeiconsIcon aria-hidden icon={ViewIcon} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>
          <label htmlFor={id}>{label}</label>
        </ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          aria-label={label}
          checked={checked}
          disabled={disabled}
          id={id}
          onCheckedChange={onCheckedChange}
        />
      </ItemActions>
    </Item>
  );
}

function PrivateBookmarks() {
  const queryClient = useQueryClient();
  const queryOptions = orpc.user.getBookmarksFull.queryOptions();
  const query = useQuery(queryOptions);
  const removeMutation = useMutation({
    mutationFn: (postId: string) =>
      orpcClient.user.toggleBookmark({ bookmarked: false, postId }),
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos quitar el favorito."
      );
    },
    onSuccess: async (_data, postId) => {
      await Promise.all([
        queryClient.invalidateQueries(queryOptions),
        queryClient.invalidateQueries(orpc.user.getBookmarks.queryOptions()),
        queryClient.invalidateQueries({
          queryKey: ["profile", "public-bookmarks"],
        }),
      ]);
      trackEvent("post_bookmark_toggled", {
        bookmarked: false,
        postId,
        source: "profile_library",
      });
      toast.success("Eliminado de favoritos");
    },
  });

  if (query.isPending) {
    return (
      <ProfileCollectionState
        description="Estamos preparando tu biblioteca."
        kind="loading"
        title="Cargando favoritos"
      />
    );
  }

  if (query.isError) {
    return (
      <ProfileCollectionState
        description="No pudimos cargar tus favoritos en este momento."
        kind="error"
        onAction={() => query.refetch()}
        title="Algo salió mal"
      />
    );
  }

  if (!query.data || query.data.length === 0) {
    return (
      <ProfileCollectionState
        description="Guarda contenido desde cualquier juego o comic para encontrarlo aquí."
        kind="empty"
        title="Tu biblioteca está vacía"
      />
    );
  }

  return (
    <ProfileBookmarkGrid
      items={query.data}
      renderOwnerAction={(item) => (
        <Button
          aria-label={`Quitar ${item.title} de favoritos`}
          className="rounded-full bg-background/90 shadow-lg backdrop-blur-md"
          disabled={removeMutation.isPending}
          onClick={() => removeMutation.mutate(item.id)}
          size="icon-sm"
          title="Quitar de favoritos"
          variant="outline"
        >
          <HugeiconsIcon aria-hidden icon={Delete02Icon} />
        </Button>
      )}
    />
  );
}

function PrivateReviews() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const query = useInfiniteQuery({
    getNextPageParam: (lastPage: PrivateReviewsPage) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as PrivateReviewsCursor | undefined,
    queryFn: ({ pageParam }: { pageParam: PrivateReviewsCursor | undefined }) =>
      orpcClient.rating.getMyReviews({
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: REVIEW_PAGE_SIZE,
      }),
    queryKey: ["profile", "my-reviews"],
  });
  const deleteMutation = useMutation({
    mutationFn: (postId: string) => orpcClient.rating.delete({ postId }),
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos eliminar la reseña."
      );
    },
    onSuccess: async (_data, postId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profile", "my-reviews"] }),
        queryClient.invalidateQueries({
          queryKey: ["profile", "public-reviews"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["rating", "user", postId],
        }),
        queryClient.invalidateQueries({ queryKey: ["ratings", postId] }),
        queryClient.invalidateQueries({
          queryKey: ["rating", "stats", postId],
        }),
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
      ]);
      trackEvent("post_rating_deleted", {
        postId,
        source: "profile_library",
      });
      toast.success("Reseña eliminada");
    },
  });
  const reviews = useMemo(() => {
    const seen = new Set<string>();
    const items: ProfileReviewItem[] = [];

    for (const page of query.data?.pages ?? []) {
      const postMap = new Map(page.posts.map((post) => [post.id, post]));

      for (const rating of page.ratings) {
        if (seen.has(rating.postId)) {
          continue;
        }

        const post = postMap.get(rating.postId);
        if (!post) {
          continue;
        }

        seen.add(rating.postId);
        items.push({
          createdAt: rating.createdAt,
          postId: rating.postId,
          postSlug: post.slug,
          postTitle: post.title,
          postType: post.type,
          rating: rating.rating,
          review: rating.review,
          updatedAt: rating.updatedAt,
        });
      }
    }

    return items;
  }, [query.data?.pages]);

  const handleDelete = async (item: ProfileReviewItem) => {
    const confirmed = await confirm({
      cancelText: "Conservar reseña",
      confirmButton: { variant: "destructive" },
      confirmText: "Eliminar",
      description: `Se eliminará tu reseña de “${item.postTitle}”. Esta acción no se puede deshacer.`,
      title: "Eliminar reseña",
    });

    if (confirmed) {
      deleteMutation.mutate(item.postId);
    }
  };

  if (query.isPending) {
    return (
      <ProfileCollectionState
        description="Estamos reuniendo tus reseñas."
        kind="loading"
        title="Cargando reseñas"
      />
    );
  }

  if (query.isError) {
    return (
      <ProfileCollectionState
        description="No pudimos cargar tus reseñas en este momento."
        kind="error"
        onAction={() => query.refetch()}
        title="Algo salió mal"
      />
    );
  }

  if (reviews.length === 0) {
    return (
      <ProfileCollectionState
        description="Cuando publiques una reseña, podrás editarla y gestionarla desde aquí."
        kind="empty"
        title="Aún no escribiste reseñas"
      />
    );
  }

  return (
    <div className="space-y-5">
      <ProfileReviewList
        items={reviews}
        renderOwnerActions={(item) => (
          <div className="flex items-center gap-1">
            <Button
              aria-label={`Editar reseña de ${item.postTitle}`}
              onClick={() => setEditingPostId(item.postId)}
              size="icon-sm"
              title="Editar reseña"
              variant="ghost"
            >
              <HugeiconsIcon aria-hidden icon={Edit02Icon} />
            </Button>
            <Button
              aria-label={`Eliminar reseña de ${item.postTitle}`}
              disabled={deleteMutation.isPending}
              onClick={() => handleDelete(item)}
              size="icon-sm"
              title="Eliminar reseña"
              variant="destructive"
            >
              <HugeiconsIcon aria-hidden icon={Delete02Icon} />
            </Button>
          </div>
        )}
      />
      {query.hasNextPage ? (
        <ProfileLoadMore
          isLoading={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        />
      ) : null}
      {editingPostId ? (
        <RatingDialog
          onOpenChange={(open) => {
            if (!open) {
              setEditingPostId(null);
            }
          }}
          open
          postId={editingPostId}
        />
      ) : null}
    </div>
  );
}
