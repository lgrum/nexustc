import {
  FavouriteIcon,
  Login03Icon,
  StarIcon,
  ViewIcon,
  GameController03Icon,
  UserGroupIcon,
  Tag01Icon,
  Time04Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PREMIUM_STATUS_CATEGORIES } from "@repo/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage, Facehash } from "facehash";
import { useEffect, useState } from "react";

import {
  AuthDialog,
  AuthDialogContent,
  AuthDialogTrigger,
} from "@/components/auth/auth-dialog";
import { GamesCarousel } from "@/components/landing/games-carousel";
import { PostCard } from "@/components/landing/post-card";
import type { PostProps } from "@/components/landing/post-card";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { TermBadge } from "@/components/term-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UserLabel } from "@/components/users/user-label";
import { authClient } from "@/lib/auth-client";
import { orpc, orpcClient, safeOrpcClient } from "@/lib/orpc";
import { getThumbnailImageObjectKeys } from "@/lib/post-images";
import { cn, defaultFacehashProps, getBucketUrl } from "@/lib/utils";

const POPULAR_TAG_MIN_POST_USAGE = 3;
const POPULAR_TAGS_LIMIT = 24;
const RECENT_POSTS_LIMIT = 12;

export const Route = createFileRoute("/_main/")({
  component: HomeComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Principal",
      },
    ],
  }),
  loader: async () => {
    const [recentUsersResult, weeklyGamesResult, featuredPostsResult] =
      await Promise.all([
        safeOrpcClient.user.getRecentUsers(),
        safeOrpcClient.post.getWeekly(),
        safeOrpcClient.post.getFeatured(),
      ]);

    const [recentUsersError, recentUsers, recentUsersDefined] =
      recentUsersResult;
    const [weeklyGamesError, weeklyGames, weeklyGamesDefined] =
      weeklyGamesResult;
    const [featuredPostsError, featuredPosts, featuredPostsDefined] =
      featuredPostsResult;

    return {
      featuredPosts: featuredPostsDefined
        ? { data: undefined, error: { code: featuredPostsError.code } }
        : featuredPosts
          ? { data: featuredPosts, error: undefined }
          : { data: undefined, error: { code: "UNKNOWN" } },
      recentUsers: recentUsersDefined
        ? { data: undefined, error: { code: recentUsersError.code } }
        : recentUsers
          ? { data: recentUsers, error: undefined }
          : { data: undefined, error: { code: "UNKNOWN" } },
      weeklyGames: weeklyGamesDefined
        ? { data: undefined, error: { code: weeklyGamesError.code } }
        : weeklyGames
          ? { data: weeklyGames, error: undefined }
          : { data: undefined, error: { code: "UNKNOWN" } },
    };
  },
});

function HomeComponent() {
  const { weeklyGames } = Route.useLoaderData();

  return (
    <main className="flex w-full gap-6">
      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <HeroSection />

        <section className="py-5 space-y-3">
          <div className="px-3">
            <SectionTitle
              title="Juegos de la Semana"
              icon={GameController03Icon}
            />
          </div>
          <GamesCarousel games={weeklyGames.data ?? []} />
        </section>

        <div className="glow-line mx-4" />

        <RecentPostsSection />

        {/* Active Users + Tags — mobile only */}
        <div className="flex flex-col px-4 md:hidden">
          <div className="glow-line" />
          <ActiveUsersSection />
          <div className="glow-line" />
          <TagsSection />
        </div>
      </div>

      {/* Sidebar — desktop only */}
      <aside className="hidden w-80 shrink-0 md:block pb-4">
        <div className="sticky top-4 flex flex-col gap-4">
          <AuthAction />
          <div className="glow-line" />
          <ActiveUsersSection />
          <div className="glow-line" />
          <TagsSection />
        </div>
      </aside>
    </main>
  );
}

function HeroSection() {
  const { featuredPosts } = Route.useLoaderData();

  if (
    featuredPosts.error ||
    !featuredPosts.data ||
    featuredPosts.data.length === 0
  ) {
    return <PlaceholderHero />;
  }

  const posts = featuredPosts.data;
  const main = posts.find((p) => p.position === "main");
  const [mainImage] = getThumbnailImageObjectKeys(
    main?.imageObjectKeys,
    1,
    main?.coverImageObjectKey
  );
  const secondary = posts
    .filter((p) => p.position === "secondary")
    .toSorted((a, b) => a.order - b.order);

  return (
    <div className="flex flex-col md:flex-row gap-4 min-h-0 md:max-h-150">
      {/* Main hero card */}
      {main && (
        <Link
          className="group relative block overflow-hidden rounded-2xl border border-border/60 flex-1 min-h-105 shadow-lg"
          params={{ id: main.id }}
          preload={false}
          to="/post/$id"
        >
          {/* Image */}
          {mainImage && (
            <img
              alt={main.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
              src={getBucketUrl(mainImage)}
            />
          )}
          {!mainImage && (
            <div className="h-full w-full bg-linear-to-br from-[oklch(0.25_0.05_280)] via-[oklch(0.2_0.08_320)] to-[oklch(0.15_0.04_200)]" />
          )}

          {/* Vignette that keeps the image visible */}
          <div className="pointer-events-none absolute inset-0 hero-vignette" />

          {/* Featured pill */}
          <div className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-background/50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            Destacado
          </div>

          {/* Content */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-5 md:p-7">
            <h2 className="display-heading mb-3 text-balance text-[34px] md:text-[40px] text-white leading-[1.02] drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
              {main.title}
            </h2>
            <div className="flex gap-5 text-muted-foreground text-[13px] tabular-nums">
              <span className="inline-flex items-center gap-1.5">
                <HugeiconsIcon
                  className="size-3.5 fill-red-500 text-red-500"
                  icon={FavouriteIcon}
                />
                <span className="font-semibold text-foreground">128</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <HugeiconsIcon
                  className="size-3.5 fill-amber-400 text-amber-400"
                  icon={StarIcon}
                />
                <span className="font-semibold text-foreground">4.8</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <HugeiconsIcon
                  className="size-3.5 opacity-80"
                  icon={ViewIcon}
                />
                <span className="font-semibold text-foreground">2.4K</span>
              </span>
            </div>
          </div>
        </Link>
      )}

      {/* Secondary hero cards */}
      {secondary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-none md:grid-rows-2 gap-4 md:aspect-1/2">
          {secondary.map((post) => (
            <HeroSecondaryCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {!main && <PlaceholderHero />}
    </div>
  );
}

const ABANDONED_STATUS_NAME = "Abandonado";

function getSecondaryStatusClassName(statusName: string | undefined) {
  if (statusName === ABANDONED_STATUS_NAME) {
    return "bg-red-500/20 text-red-200 border border-red-500/40";
  }
  if (
    statusName !== undefined &&
    PREMIUM_STATUS_CATEGORIES.ongoing.includes(
      statusName as (typeof PREMIUM_STATUS_CATEGORIES.ongoing)[number]
    )
  ) {
    return "bg-amber-400/20 text-amber-100 border border-amber-400/40";
  }
  if (
    statusName !== undefined &&
    PREMIUM_STATUS_CATEGORIES.completed.includes(
      statusName as (typeof PREMIUM_STATUS_CATEGORIES.completed)[number]
    )
  ) {
    return "bg-emerald-500/20 text-emerald-100 border border-emerald-500/40";
  }
  return "bg-white/15 text-white/90 border border-white/25";
}

function HeroSecondaryCard({ post }: { post: PostProps }) {
  const [cover] = getThumbnailImageObjectKeys(
    post.imageObjectKeys,
    1,
    post.coverImageObjectKey
  );
  const statusName = post.terms?.find(
    (term) => term.taxonomy === "status"
  )?.name;
  const versionClassName = getSecondaryStatusClassName(statusName);

  return (
    <Link
      className="group relative block h-full min-h-48 overflow-hidden rounded-2xl border border-border/60 shadow-lg card-hover"
      params={{ id: post.id }}
      preload={false}
      to="/post/$id"
    >
      {cover ? (
        <img
          alt={post.title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:scale-[1.05]"
          src={getBucketUrl(cover)}
        />
      ) : (
        <div className="absolute inset-0 bg-linear-to-br from-[oklch(0.25_0.05_280)] via-[oklch(0.2_0.08_320)] to-[oklch(0.15_0.04_200)]" />
      )}

      {/* Cinematic gradient */}
      <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/85 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-black/35 to-transparent" />

      {post.version && (
        <span
          className={cn(
            "absolute right-3 top-3 z-10 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider backdrop-blur-md",
            versionClassName
          )}
        >
          {post.version}
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 z-10 p-4">
        <h3 className="display-heading line-clamp-2 text-balance text-[16px] leading-[1.15] text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]">
          {post.title}
        </h3>
        <div className="mt-1.5 flex items-center gap-3 text-[11.5px] tabular-nums text-white/75">
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon className="size-3 opacity-90" icon={FavouriteIcon} />
            {post.likes}
          </span>
          {post.averageRating !== 0 && post.averageRating !== undefined && (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <HugeiconsIcon className="size-3" icon={StarIcon} />
              {post.averageRating.toFixed(1)}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <HugeiconsIcon className="size-3 opacity-90" icon={ViewIcon} />
            {post.views}
          </span>
        </div>
      </div>
    </Link>
  );
}

function PlaceholderHero() {
  return (
    <div className="relative h-105 overflow-hidden rounded-2xl border border-border/60 shadow-lg">
      <div className="h-full w-full bg-linear-to-br from-[oklch(0.25_0.05_280)] via-[oklch(0.2_0.08_320)] to-[oklch(0.15_0.04_200)]" />
      <div className="pointer-events-none absolute inset-0 hero-vignette" />
      <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">
        <h2 className="display-heading text-3xl md:text-4xl text-white">
          NeXusTC
        </h2>
        <p className="mt-2 text-muted-foreground text-sm">
          Descubre los mejores juegos y cómics
        </p>
      </div>
    </div>
  );
}

function ActiveUsersSection() {
  const { recentUsers } = Route.useLoaderData();

  return (
    <section className="space-y-3">
      <SectionTitle title="Usuarios Activos" icon={UserGroupIcon} />
      {!!recentUsers.error && (
        <p className="text-red-500 text-sm">Error: {recentUsers.error.code}</p>
      )}
      <Card className="py-2">
        <CardContent className="flex flex-col gap-2 px-2">
          {recentUsers.data?.map((user) => (
            <Link
              className="relative flex items-center gap-1.5 rounded-md py-1.5 px-2 hover:bg-accent transition-colors data-[active=true]:bg-accent"
              key={user.id}
              params={{ id: user.id }}
              to="/user/$id"
            >
              <ProfileAvatar className="size-8" user={user} />
              <UserLabel user={user} />
            </Link>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function AuthAction() {
  const auth = authClient.useSession();
  const user = auth.data?.user;
  const imageSrc = user?.image ? getBucketUrl(user.image) : undefined;
  const [mounted, setMounted] = useState(false);
  const profileSummaryQuery = useQuery({
    ...orpc.profile.getSummary.queryOptions({
      input: { userId: user?.id ?? "" },
    }),
    enabled: Boolean(user?.id),
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  if (auth.isPending) {
    return (
      <Button
        className="min-h-14 cursor-default rounded-xl border border-sidebar-border/70 bg-sidebar-accent/50 px-3 py-3 shadow-[0_10px_30px_-20px_hsl(var(--sidebar-accent-foreground))]"
        size="lg"
        variant="ghost"
      >
        <div className="size-10 animate-pulse rounded-full bg-sidebar-border" />
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <span className="w-24 animate-pulse rounded bg-sidebar-border text-transparent">
            Cargando
          </span>
          <span className="w-16 animate-pulse rounded bg-sidebar-border text-transparent text-xs">
            Estado
          </span>
        </span>
      </Button>
    );
  }

  if (user) {
    const labelUser = profileSummaryQuery.data ?? user;

    return (
      <Button
        className={cn(
          "min-h-16 cursor-pointer rounded-xl border border-primary/25 bg-linear-to-r from-primary/18 via-accent/10 to-sidebar-accent/80 px-3 py-3 shadow-[0_14px_35px_-24px_hsl(var(--primary))] transition-all duration-200 hover:border-primary/40 hover:from-primary/24 hover:to-sidebar-accent",
          "group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:p-0!"
        )}
        render={<Link to="/profile" />}
        size="lg"
        variant="ghost"
        nativeButton={false}
      >
        <Avatar className="size-12 rounded-full border border-primary/25">
          <AvatarImage src={imageSrc} />
          <AvatarFallback
            className="rounded-full"
            facehashProps={defaultFacehashProps}
            name={user.name}
          />
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
          <UserLabel className="font-semibold text-base" user={labelUser} />
          <span className="truncate text-sidebar-foreground/70 text-sm">
            Ver perfil
          </span>
        </span>
      </Button>
    );
  }

  return (
    <AuthDialog>
      <AuthDialogTrigger
        render={
          <Button
            className={cn(
              "min-h-14 cursor-pointer rounded-xl border border-primary/30 bg-card/60 px-3 py-3 transition-all duration-200 hover:border-primary/60 hover:bg-card",
              "group-data-[collapsible=icon]:size-11! group-data-[collapsible=icon]:rounded-full group-data-[collapsible=icon]:p-0!"
            )}
            size="lg"
            variant="ghost"
          />
        }
      >
        <Facehash
          className="size-12 rounded-full border border-primary/25"
          name=""
          {...defaultFacehashProps}
        />
        <span className="flex min-w-0 flex-1 flex-col items-start leading-tight">
          <span className="font-semibold text-sm">Iniciar sesión</span>
          <span className="truncate text-sidebar-foreground/70 text-xs">
            Accede a tu perfil
          </span>
        </span>
        <HugeiconsIcon
          className="ml-auto size-4 text-primary group-data-[collapsible=icon]:hidden"
          icon={Login03Icon}
        />
      </AuthDialogTrigger>
      <AuthDialogContent />
    </AuthDialog>
  );
}

function TagsSection() {
  const { data: tags = [] } = useQuery({
    queryFn: () =>
      orpcClient.term.getPopularTags({
        limit: POPULAR_TAGS_LIMIT,
        minPostUsage: POPULAR_TAG_MIN_POST_USAGE,
      }),
    queryKey: [
      "terms",
      "popular-tags",
      POPULAR_TAG_MIN_POST_USAGE,
      POPULAR_TAGS_LIMIT,
    ],
  });

  return (
    <section className="space-y-3">
      <SectionTitle title="Tags Populares" icon={Tag01Icon} />
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Link
            className="flex grow"
            key={tag.id}
            preload={false}
            search={{ tag: [tag.id] }}
            to="/search"
          >
            <TermBadge className="w-full" tag={tag} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function RecentPostsSection() {
  const {
    data: recentPosts,
    isLoading,
    isError,
  } = useQuery({
    queryFn: () => orpcClient.post.getRecent({ limit: RECENT_POSTS_LIMIT }),
    queryKey: ["posts", "recent", RECENT_POSTS_LIMIT],
  });

  return (
    <section className="px-3 py-5 space-y-3">
      <SectionTitle title="Publicaciones Recientes" icon={Time04Icon} />

      {isLoading && (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          {Array.from({ length: RECENT_POSTS_LIMIT }).map((_, i) => (
            // oxlint-disable-next-line react/no-array-index-key static skeleton placeholders
            <Skeleton className="aspect-video w-full" key={i} />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-center text-muted-foreground text-sm">
          Error al cargar los posts recientes
        </p>
      )}

      {!(isLoading || isError) && (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          {recentPosts?.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}

function SectionTitle({
  title,
  icon,
}: {
  title: string;
  icon: IconSvgElement;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="inline-flex size-1.5 rounded-full bg-primary shadow-[0_0_10px_2px] shadow-primary/40"
      />
      <HugeiconsIcon className="size-4 text-primary/80" icon={icon} />
      <div className="section-title">{title}</div>
      <div className="ml-2 h-px flex-1 bg-linear-to-r from-border to-transparent" />
    </div>
  );
}
