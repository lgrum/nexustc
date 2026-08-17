"use client";

import {
  Award01Icon,
  Coins01Icon,
  FavouriteIcon,
  Fire03Icon,
  GameIcon,
  PackageIcon,
  StarIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import type { ProfileActivityVisibility } from "@repo/shared/profile";
import { PROFILE_SHOWCASE_PAGE_SIZES } from "@repo/shared/profile-customization";
import type { EffectiveProfileShowcase } from "@repo/shared/profile-customization";
import { useInfiniteQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

import { ProfileBookmarkGrid } from "@/components/profile/profile-bookmark-grid";
import type { ProfileReviewItem } from "@/components/profile/profile-review-list";
import { ProfileReviewList } from "@/components/profile/profile-review-list";
import {
  ProfileCollectionState,
  ProfileLoadMore,
  ProfileSectionHeader,
} from "@/components/profile/profile-section";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { formatCollectibleDate } from "@/lib/format-date";
import { orpcClient } from "@/lib/orpc";
import { cn, getBucketUrl } from "@/lib/utils";

import { PublicCollectionSection } from "./public-collection-section";

type PublicBookmarksPage = Awaited<
  ReturnType<(typeof orpcClient.user)["getUserBookmarks"]>
>;
type PublicBookmarksCursor = NonNullable<PublicBookmarksPage["nextCursor"]>;
type PublicReviewsPage = Awaited<
  ReturnType<(typeof orpcClient.rating)["getByUserId"]>
>;
type PublicReviewsCursor = NonNullable<PublicReviewsPage["nextCursor"]>;

export function UserClient({
  preview = false,
  publicCards,
  publicPacks,
  showEmptyShowcases = false,
  showcases,
  userId,
  userName,
  visibility,
}: {
  preview?: boolean;
  publicCards?: Awaited<
    ReturnType<(typeof orpcClient.cards)["publicCollection"]>
  > | null;
  publicPacks?: Awaited<
    ReturnType<(typeof orpcClient.packs)["publicCollection"]>
  > | null;
  userId: string;
  userName: string;
  visibility: ProfileActivityVisibility;
  showcases?: EffectiveProfileShowcase[];
  showEmptyShowcases?: boolean;
}) {
  if (showcases) {
    return (
      <div className="flex flex-col gap-12">
        {showcases.map((showcase) => {
          if (showcase.type === "favorite-games") {
            return (
              <FavoriteGamesSection
                games={showcase.games}
                key={showcase.type}
                showEmpty={showEmptyShowcases}
                userName={userName}
                variant={showcase.variant}
              />
            );
          }
          if (showcase.type === "xp") {
            return <XpShowcase key={showcase.type} showcase={showcase} />;
          }
          if (showcase.type === "streak") {
            return <StreakShowcase key={showcase.type} showcase={showcase} />;
          }
          if (showcase.type === "eteris") {
            return <EterisShowcase key={showcase.type} showcase={showcase} />;
          }
          if (showcase.type === "card") {
            return (
              <CardShowcase
                key={showcase.type}
                showcase={showcase}
                showEmpty={showEmptyShowcases}
              />
            );
          }
          if (showcase.type === "rare-card") {
            return (
              <CardShowcase
                key={showcase.type}
                showcase={showcase}
                showEmpty={showEmptyShowcases}
              />
            );
          }
          if (showcase.type === "unopened-pack") {
            return (
              <PackShowcase
                key={showcase.type}
                showcase={showcase}
                showEmpty={showEmptyShowcases}
              />
            );
          }
          return showcase.rendererKey === "library" ? (
            <PublicBookmarksSection
              isPublic
              key={showcase.type}
              omitUnavailable
              preview={preview}
              userId={userId}
              userName={userName}
              variant={showcase.variant}
            />
          ) : (
            <PublicReviewsSection
              isPublic
              key={showcase.type}
              omitUnavailable
              preview={preview}
              userId={userId}
              userName={userName}
              variant={showcase.variant}
            />
          );
        })}
        {publicCards !== undefined && publicPacks !== undefined ? (
          <PublicCollectionSection
            initialCards={publicCards}
            initialPacks={publicPacks}
            userId={userId}
          />
        ) : null}
      </div>
    );
  }

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
      {publicCards !== undefined && publicPacks !== undefined ? (
        <PublicCollectionSection
          initialCards={publicCards}
          initialPacks={publicPacks}
          userId={userId}
        />
      ) : null}
    </div>
  );
}

function CardShowcase({
  showcase,
  showEmpty,
}: {
  showcase: Extract<EffectiveProfileShowcase, { type: "card" | "rare-card" }>;
  showEmpty: boolean;
}) {
  if (showcase.cards.length === 0 && !showEmpty) {
    return null;
  }
  const title = showcase.type === "card" ? "Cartas destacadas" : "Cartas raras";
  return (
    <section
      aria-labelledby={`${showcase.type}-showcase-title`}
      data-showcase-variant={showcase.variant}
    >
      <ProfileSectionHeader
        description={
          showcase.type === "card"
            ? "Una selección manual de Card Instances que conservas actualmente."
            : "Una selección automática ordenada por rareza, edición y Mint Number."
        }
        icon={SparklesIcon}
        title={title}
        titleId={`${showcase.type}-showcase-title`}
      />
      <div className="mt-5" data-profile-collectible-cards>
        {showcase.cards.length === 0 ? (
          <ProfileCollectionState
            description="Las cartas seleccionadas ya no están disponibles o todavía no hay cartas para mostrar."
            kind="empty"
            title="Aún no hay cartas"
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-3">
            {showcase.cards.map((card) => (
              <article
                className="flex min-w-0 gap-3 rounded-2xl border border-border/70 bg-background/35 p-3"
                key={card.id}
              >
                {(() => {
                  const thumbnail = card.template.renderedVariants.find(
                    (variant) => variant.variant === "thumbnail"
                  );
                  return thumbnail ? (
                    <Image
                      alt={
                        card.template.disabled
                          ? "Carta no disponible"
                          : `Arte de ${card.characterName}`
                      }
                      className="size-20 shrink-0 rounded-xl object-cover"
                      height={80}
                      src={getBucketUrl(thumbnail.objectKey)}
                      width={56}
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="size-20 shrink-0 rounded-xl bg-primary/10"
                    />
                  );
                })()}
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">
                    {card.template.disabled
                      ? "Contenido no disponible"
                      : card.characterName}
                  </h3>
                  <p className="truncate text-muted-foreground text-sm">
                    {card.gameName} · {card.seriesName}
                  </p>
                  <p className="mt-1 text-sm">
                    {card.rarity} · {card.mintDisplay}
                  </p>
                  {card.listingUrl ? (
                    <Link
                      className="mt-1 inline-block font-medium text-emerald-500 text-xs underline-offset-2 hover:underline"
                      href={card.listingUrl}
                    >
                      En venta{card.listingIsBundle ? " · Lote" : ""}
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function PackShowcase({
  showcase,
  showEmpty,
}: {
  showcase: Extract<EffectiveProfileShowcase, { type: "unopened-pack" }>;
  showEmpty: boolean;
}) {
  if (showcase.packs.length === 0 && !showEmpty) {
    return null;
  }
  return (
    <section
      aria-labelledby="unopened-pack-showcase-title"
      data-showcase-variant={showcase.variant}
    >
      <ProfileSectionHeader
        description="Packs sin abrir que conservas ahora, del más nuevo al más antiguo."
        icon={PackageIcon}
        title="Packs sin abrir"
        titleId="unopened-pack-showcase-title"
      />
      <div className="mt-5" data-profile-collectible-packs>
        {showcase.packs.length === 0 ? (
          <ProfileCollectionState
            description="Los packs transferidos o abiertos dejan de aparecer automáticamente."
            kind="empty"
            title="Aún no hay packs sin abrir"
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-3">
            {showcase.packs.map((pack, index) => (
              <article
                className="rounded-2xl border border-border/70 bg-background/35 p-4"
                key={`${pack.templateId}:${pack.issuedAt.toISOString()}:${index}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {pack.disabled
                        ? "Contenido no disponible"
                        : pack.templateName}
                    </h3>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {pack.disabled
                        ? "Este pack está temporalmente deshabilitado."
                        : `Revisión ${pack.revision}`}
                    </p>
                  </div>
                  <HugeiconsIcon
                    aria-hidden
                    className="size-5 text-primary"
                    icon={PackageIcon}
                  />
                </div>
                <p className="mt-3 text-muted-foreground text-xs">
                  Emitido el {formatCollectibleDate(pack.issuedAt)}
                </p>
                {pack.listingUrl ? (
                  <Link
                    className="mt-2 inline-block font-medium text-emerald-500 text-xs underline-offset-2 hover:underline"
                    href={pack.listingUrl}
                  >
                    En venta{pack.listingIsBundle ? " · Lote" : ""}
                  </Link>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ScalarCard({
  className,
  eyebrow,
  icon,
  title,
  value,
}: {
  className?: string;
  eyebrow: string;
  icon: IconSvgElement;
  title: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.5rem] border border-primary/20 bg-gradient-to-br from-primary/12 via-card to-card p-5",
        className
      )}
      data-profile-scalar-card
    >
      <div className="flex items-center gap-3 text-primary">
        <HugeiconsIcon aria-hidden className="size-5" icon={icon} />
        <p className="font-bold text-xs uppercase tracking-[0.18em]">
          {eyebrow}
        </p>
      </div>
      <p className="mt-3 font-lexend font-semibold text-4xl tabular-nums tracking-tight">
        {value}
      </p>
      <p className="mt-2 text-muted-foreground text-sm">{title}</p>
    </div>
  );
}

function XpShowcase({
  showcase,
}: {
  showcase: Extract<EffectiveProfileShowcase, { type: "xp" }>;
}) {
  const nextLevel =
    showcase.nextLevelRequirement === null ? null : showcase.accountLevel + 1;
  return (
    <section
      className="@container/experience"
      aria-labelledby="xp-showcase-title"
      data-showcase-variant={showcase.variant}
    >
      <ProfileSectionHeader
        eyebrow="Progresión"
        icon={Award01Icon}
        title="Experiencia"
        titleId="xp-showcase-title"
      />
      <div
        className={cn(
          "mt-5 grid items-stretch gap-4",
          showcase.variant !== "compact" &&
            "@md/experience:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.3fr)]"
        )}
        data-profile-experience-panels
      >
        <ScalarCard
          className="h-full"
          eyebrow="Nivel de cuenta"
          icon={Award01Icon}
          title="Nivel actual"
          value={`Nivel ${showcase.accountLevel}`}
        />
        <div className="flex h-full flex-col justify-center rounded-[1.5rem] border bg-card/70 p-5">
          {nextLevel ? (
            <Progress
              aria-label={`Progreso hacia el nivel ${nextLevel}`}
              value={Math.round(showcase.progress * 100)}
            >
              <ProgressLabel>
                {showcase.currentLevelXp} / {showcase.nextLevelRequirement} XP
              </ProgressLabel>
              <ProgressValue />
            </Progress>
          ) : (
            <p className="font-semibold">Nivel máximo alcanzado</p>
          )}
          {showcase.xpRemaining === null ? null : (
            <p className="mt-3 text-muted-foreground text-sm">
              Faltan {showcase.xpRemaining} XP para el siguiente nivel.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function StreakShowcase({
  showcase,
}: {
  showcase: Extract<EffectiveProfileShowcase, { type: "streak" }>;
}) {
  return (
    <section
      aria-labelledby="streak-showcase-title"
      data-showcase-variant={showcase.variant}
    >
      <ProfileSectionHeader
        eyebrow="Constancia actual"
        icon={Fire03Icon}
        title="Racha"
        titleId="streak-showcase-title"
      />
      <ScalarCard
        className="mt-5"
        eyebrow="Racha vigente"
        icon={Fire03Icon}
        title={
          showcase.nextMilestone
            ? `Próximo hito: ${showcase.nextMilestone} días`
            : "Hito máximo alcanzado"
        }
        value={`${showcase.currentStreak} días`}
      />
    </section>
  );
}

function EterisShowcase({
  showcase,
}: {
  showcase: Extract<EffectiveProfileShowcase, { type: "eteris" }>;
}) {
  return (
    <section
      aria-labelledby="eteris-showcase-title"
      data-showcase-variant={showcase.variant}
    >
      <ProfileSectionHeader
        eyebrow="Saldo público"
        icon={Coins01Icon}
        title="Eteris"
        titleId="eteris-showcase-title"
      />
      <ScalarCard
        className="mt-5"
        eyebrow="Saldo actual"
        icon={Coins01Icon}
        title="Eteris disponibles"
        value={showcase.balance}
      />
    </section>
  );
}

function FavoriteGameCover({
  game,
  priority = false,
}: {
  game: Extract<
    EffectiveProfileShowcase,
    { type: "favorite-games" }
  >["games"][number];
  priority?: boolean;
}) {
  return game.coverImageObjectKey ? (
    <Image
      alt={`Portada de ${game.title}`}
      className="object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
      fill
      priority={priority}
      sizes="(max-width: 640px) 90vw, 420px"
      src={getBucketUrl(game.coverImageObjectKey)}
    />
  ) : (
    <div className="grid h-full place-items-center bg-gradient-to-br from-primary/25 via-card to-muted">
      <HugeiconsIcon
        aria-hidden
        className="size-10 text-primary/70"
        icon={GameIcon}
      />
    </div>
  );
}

function FavoriteGamesSection({
  games,
  showEmpty,
  userName,
  variant,
}: {
  games: Extract<EffectiveProfileShowcase, { type: "favorite-games" }>["games"];
  showEmpty: boolean;
  userName: string;
  variant: EffectiveProfileShowcase["variant"];
}) {
  if (games.length === 0) {
    return showEmpty ? (
      <section
        className="@container/favorite-games"
        aria-labelledby="favorite-games-title"
        data-showcase-variant={variant}
      >
        <ProfileSectionHeader
          description={`La selección personal de ${userName}, ordenada de imprescindible a favorita.`}
          eyebrow="Ranking personal"
          icon={GameIcon}
          title="Juegos favoritos"
          titleId="favorite-games-title"
        />
        <div className="mt-5">
          <ProfileCollectionState
            description="Busca un juego público en el editor para crear tu selección."
            kind="empty"
            title="Elige tu primer juego favorito"
          />
        </div>
      </section>
    ) : null;
  }
  const [featured] = games;
  return (
    <section
      className="@container/favorite-games"
      aria-labelledby="favorite-games-title"
      data-showcase-variant={variant}
    >
      <ProfileSectionHeader
        description={`La selección personal de ${userName}, ordenada de imprescindible a favorita.`}
        eyebrow="Ranking personal"
        icon={GameIcon}
        title="Juegos favoritos"
        titleId="favorite-games-title"
      />
      {games.length === 1 && featured ? (
        <Link
          className="group mt-5 grid min-h-64 overflow-hidden rounded-[1.75rem] border border-primary/25 bg-card shadow-lg shadow-black/10 @2xl/favorite-games:grid-cols-[minmax(13rem,0.7fr)_1fr]"
          href={`/post/${featured.slug}`}
        >
          <div className="relative min-h-56 overflow-hidden">
            <FavoriteGameCover game={featured} priority />
          </div>
          <div className="flex flex-col justify-end p-6 @2xl/favorite-games:p-8">
            <span className="font-bold text-primary text-xs uppercase tracking-[0.2em]">
              Elección principal
            </span>
            <h3 className="mt-2 text-balance font-black text-3xl tracking-tight">
              {featured.title}
            </h3>
            <span className="mt-5 font-semibold text-sm">Ver juego →</span>
          </div>
        </Link>
      ) : (
        <ol
          className={cn(
            "mt-5 grid gap-3",
            variant === "featured"
              ? "@2xl/favorite-games:grid-cols-2"
              : "grid-cols-1"
          )}
        >
          {games.map((game, index) => (
            <li key={game.id}>
              <Link
                className="group flex min-h-24 items-stretch overflow-hidden rounded-2xl border bg-card/70 transition-colors hover:border-primary/40"
                href={`/post/${game.slug}`}
              >
                <span className="grid w-12 shrink-0 place-items-center bg-primary/10 font-black text-primary text-lg">
                  {index + 1}
                </span>
                <span className="relative w-24 shrink-0 overflow-hidden">
                  <FavoriteGameCover game={game} />
                </span>
                <span className="flex min-w-0 items-center p-4 font-bold">
                  <span className="line-clamp-2">{game.title}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function PublicBookmarksSection({
  isPublic,
  omitUnavailable = false,
  preview = false,
  userId,
  userName,
  variant = "standard",
}: {
  isPublic: boolean;
  omitUnavailable?: boolean;
  preview?: boolean;
  userId: string;
  userName: string;
  variant?: EffectiveProfileShowcase["variant"];
}) {
  const pageSize = PROFILE_SHOWCASE_PAGE_SIZES.library[variant];
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
        limit: pageSize,
        ...(preview ? { preview: true } : {}),
        userId,
      }),
    queryKey: ["profile", "public-bookmarks", userId, variant, preview],
  });
  const bookmarks = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data?.pages]
  );

  if (
    omitUnavailable &&
    (query.isError || (!query.isPending && bookmarks.length === 0))
  ) {
    return null;
  }

  return (
    <section
      aria-busy={query.isPending}
      aria-labelledby="public-favorites-title"
      data-showcase-variant={variant}
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
              {variant !== "compact" && query.hasNextPage ? (
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
  omitUnavailable = false,
  preview = false,
  userId,
  userName,
  variant = "standard",
}: {
  isPublic: boolean;
  omitUnavailable?: boolean;
  preview?: boolean;
  userId: string;
  userName: string;
  variant?: EffectiveProfileShowcase["variant"];
}) {
  const pageSize = PROFILE_SHOWCASE_PAGE_SIZES.reviews[variant];
  const query = useInfiniteQuery({
    enabled: isPublic,
    getNextPageParam: (lastPage: PublicReviewsPage) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as PublicReviewsCursor | undefined,
    queryFn: ({ pageParam }: { pageParam: PublicReviewsCursor | undefined }) =>
      orpcClient.rating.getByUserId({
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: pageSize,
        ...(preview ? { preview: true } : {}),
        userId,
      }),
    queryKey: ["profile", "public-reviews", userId, variant, preview],
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

  if (
    omitUnavailable &&
    (query.isError || (!query.isPending && reviews.length === 0))
  ) {
    return null;
  }

  return (
    <section
      aria-busy={query.isPending}
      aria-labelledby="public-reviews-title"
      data-showcase-variant={variant}
    >
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
              {variant !== "compact" && query.hasNextPage ? (
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
