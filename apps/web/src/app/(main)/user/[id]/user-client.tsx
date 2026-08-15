"use client";

import { FavouriteIcon, StarIcon } from "@hugeicons/core-free-icons";
import type { ProfileActivityVisibility } from "@repo/shared/profile";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { ProfileBookmarkGrid } from "@/components/profile/profile-bookmark-grid";
import type { ProfileReviewItem } from "@/components/profile/profile-review-list";
import { ProfileReviewList } from "@/components/profile/profile-review-list";
import {
  ProfileCollectionState,
  ProfileLoadMore,
  ProfileSectionHeader,
} from "@/components/profile/profile-section";
import { orpcClient } from "@/lib/orpc";

const BOOKMARK_PAGE_SIZE = 12;
const REVIEW_PAGE_SIZE = 10;

type PublicBookmarksPage = Awaited<
  ReturnType<(typeof orpcClient.user)["getUserBookmarks"]>
>;
type PublicBookmarksCursor = NonNullable<PublicBookmarksPage["nextCursor"]>;
type PublicReviewsPage = Awaited<
  ReturnType<(typeof orpcClient.rating)["getByUserId"]>
>;
type PublicReviewsCursor = NonNullable<PublicReviewsPage["nextCursor"]>;

export function UserClient({
  userId,
  userName,
  visibility,
}: {
  userId: string;
  userName: string;
  visibility: ProfileActivityVisibility;
}) {
  return (
    <div className="flex flex-col gap-12">
      <PublicBookmarksSection
        isPublic={visibility.favorites}
        userId={userId}
        userName={userName}
      />
      <PublicReviewsSection
        isPublic={visibility.reviews}
        userId={userId}
        userName={userName}
      />
    </div>
  );
}

function PublicBookmarksSection({
  isPublic,
  userId,
  userName,
}: {
  isPublic: boolean;
  userId: string;
  userName: string;
}) {
  const query = useInfiniteQuery({
    enabled: isPublic,
    getNextPageParam: (lastPage: PublicBookmarksPage) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as PublicBookmarksCursor | undefined,
    queryFn: ({
      pageParam,
    }: {
      pageParam: PublicBookmarksCursor | undefined;
    }) =>
      orpcClient.user.getUserBookmarks({
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: BOOKMARK_PAGE_SIZE,
        userId,
      }),
    queryKey: ["profile", "public-bookmarks", userId],
  });
  const bookmarks = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data?.pages]
  );

  return (
    <section
      aria-busy={query.isPending}
      aria-labelledby="public-favorites-title"
    >
      <ProfileSectionHeader
        description={`Una selección de juegos y comics que ${userName} decidió guardar para volver más tarde.`}
        eyebrow="Biblioteca pública"
        icon={FavouriteIcon}
        title={`Favoritos de ${userName}`}
        titleId="public-favorites-title"
      />
      <div className="mt-5">
        {isPublic ? (
          query.isPending ? (
            <ProfileCollectionState
              description="Estamos preparando esta colección."
              kind="loading"
              title="Cargando favoritos"
            />
          ) : query.isError ? (
            <ProfileCollectionState
              description="No pudimos cargar los favoritos públicos en este momento."
              kind="error"
              onAction={() => query.refetch()}
              title="Algo salió mal"
            />
          ) : bookmarks.length === 0 ? (
            <ProfileCollectionState
              description="Cuando guarde contenido público, aparecerá organizado aquí."
              kind="empty"
              title="Aún no hay favoritos"
            />
          ) : (
            <div className="space-y-5">
              <ProfileBookmarkGrid items={bookmarks} />
              {query.hasNextPage ? (
                <ProfileLoadMore
                  isLoading={query.isFetchingNextPage}
                  onClick={() => query.fetchNextPage()}
                />
              ) : null}
            </div>
          )
        ) : (
          <ProfileCollectionState
            description="Esta persona ha decidido mantener sus favoritos fuera de su perfil público."
            kind="private"
            title="Favoritos privados"
          />
        )}
      </div>
    </section>
  );
}

function PublicReviewsSection({
  isPublic,
  userId,
  userName,
}: {
  isPublic: boolean;
  userId: string;
  userName: string;
}) {
  const query = useInfiniteQuery({
    enabled: isPublic,
    getNextPageParam: (lastPage: PublicReviewsPage) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as PublicReviewsCursor | undefined,
    queryFn: ({ pageParam }: { pageParam: PublicReviewsCursor | undefined }) =>
      orpcClient.rating.getByUserId({
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: REVIEW_PAGE_SIZE,
        userId,
      }),
    queryKey: ["profile", "public-reviews", userId],
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

  return (
    <section aria-busy={query.isPending} aria-labelledby="public-reviews-title">
      <ProfileSectionHeader
        description={`Opiniones y puntuaciones que ${userName} ha compartido sobre el contenido publicado en NeXusTC.`}
        eyebrow="Voz de la comunidad"
        icon={StarIcon}
        title={`Reseñas de ${userName}`}
        titleId="public-reviews-title"
      />
      <div className="mt-5">
        {isPublic ? (
          query.isPending ? (
            <ProfileCollectionState
              description="Estamos reuniendo las reseñas públicas."
              kind="loading"
              title="Cargando reseñas"
            />
          ) : query.isError ? (
            <ProfileCollectionState
              description="No pudimos cargar las reseñas públicas en este momento."
              kind="error"
              onAction={() => query.refetch()}
              title="Algo salió mal"
            />
          ) : reviews.length === 0 ? (
            <ProfileCollectionState
              description="Las reseñas públicas aparecerán aquí cuando comparta la primera."
              kind="empty"
              title="Aún no hay reseñas"
            />
          ) : (
            <div className="space-y-5">
              <ProfileReviewList items={reviews} />
              {query.hasNextPage ? (
                <ProfileLoadMore
                  isLoading={query.isFetchingNextPage}
                  onClick={() => query.fetchNextPage()}
                />
              ) : null}
            </div>
          )
        ) : (
          <ProfileCollectionState
            description="Esta persona ha decidido mantener sus reseñas fuera de su perfil público."
            kind="private"
            title="Reseñas privadas"
          />
        )}
      </div>
    </section>
  );
}
