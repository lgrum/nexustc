import { FavouriteIcon, StarIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GamesCarousel } from "@/components/landing/games-carousel";
import { PostCard } from "@/components/landing/post-card";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { TermBadge } from "@/components/term-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserLabel } from "@/components/users/user-label";
import { useTerms } from "@/hooks/use-terms";
import { orpcClient, safeOrpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

const RECENT_POSTS_LIMIT = 12;

export const Route = createFileRoute("/_main/")({
  component: HomeComponent,
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
      recentUsers: recentUsersDefined
        ? { error: { code: recentUsersError.code }, data: undefined }
        : recentUsers
          ? { error: undefined, data: recentUsers }
          : { error: { code: "UNKNOWN" }, data: undefined },
      weeklyGames: weeklyGamesDefined
        ? { error: { code: weeklyGamesError.code }, data: undefined }
        : weeklyGames
          ? { error: undefined, data: weeklyGames }
          : { error: { code: "UNKNOWN" }, data: undefined },
      featuredPosts: featuredPostsDefined
        ? { error: { code: featuredPostsError.code }, data: undefined }
        : featuredPosts
          ? { error: undefined, data: featuredPosts }
          : { error: { code: "UNKNOWN" }, data: undefined },
    };
  },
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Principal",
      },
    ],
  }),
});

function HomeComponent() {
  const { weeklyGames } = Route.useLoaderData();

  return (
    <main className="flex w-full gap-6 pb-4">
      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <HeroSection />

        <section className="px-4 py-5">
          <div className="section-title mb-3.5">Juegos de la Semana</div>
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
      <aside className="hidden w-72 shrink-0 pt-2 pr-4 md:block">
        <div className="sticky top-16 flex flex-col gap-1">
          <TagsSection />
          <div className="glow-line" />
          <ActiveUsersSection />
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
  const secondary = posts
    .filter((p) => p.position === "secondary")
    .sort((a, b) => a.order - b.order);

  return (
    <div>
      {/* Main hero card */}
      {main && (
        <Link
          className="group relative block h-105 overflow-hidden"
          params={{ id: main.id }}
          preload={false}
          to="/post/$id"
        >
          {/* Image */}
          {main.imageObjectKeys?.[0] && (
            <img
              alt={main.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              src={getBucketUrl(main.imageObjectKeys[0])}
            />
          )}
          {!main.imageObjectKeys?.[0] && (
            <div className="h-full w-full bg-linear-to-br from-[oklch(0.25_0.05_280)] via-[oklch(0.2_0.08_320)] to-[oklch(0.15_0.04_200)]" />
          )}

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/30 to-transparent" />

          {/* Content */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-4">
            <h2 className="mb-2 font-[Lexend] font-extrabold text-[32px] text-white leading-[1.1] drop-shadow-lg">
              {main.title}
            </h2>
            <div className="flex gap-4 text-muted-foreground text-xs">
              <span className="inline-flex items-center gap-1">
                <HugeiconsIcon
                  className="size-3.5 fill-red-500 text-red-500"
                  icon={FavouriteIcon}
                />
                <span className="font-semibold text-foreground">128</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <HugeiconsIcon
                  className="size-3.5 fill-amber-400 text-amber-400"
                  icon={StarIcon}
                />
                <span className="font-semibold text-foreground">4.8</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <HugeiconsIcon className="size-3.5" icon={ViewIcon} />
                <span className="font-semibold text-foreground">2.4K</span>
              </span>
            </div>
          </div>
        </Link>
      )}

      {/* Secondary hero cards */}
      {secondary.length > 0 && (
        <div className="grid grid-cols-2 gap-0 md:gap-2.5 md:px-4 md:py-3">
          {secondary.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}

      {!main && <PlaceholderHero />}
    </div>
  );
}

function PlaceholderHero() {
  return (
    <div className="relative h-105 overflow-hidden">
      <div className="h-full w-full bg-linear-to-br from-[oklch(0.25_0.05_280)] via-[oklch(0.2_0.08_320)] to-[oklch(0.15_0.04_200)]" />
      <div className="absolute inset-0 bg-linear-to-t from-background via-background/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <h2 className="font-[Lexend] font-extrabold text-3xl text-white">
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
    <section className="py-5">
      <div className="section-title mb-3.5">Usuarios Activos</div>
      {!!recentUsers.error && (
        <p className="text-red-500 text-sm">Error: {recentUsers.error.code}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {recentUsers.data?.map((user) => (
          <Link
            className="flex items-center gap-1.5 border border-border bg-card px-2.5 py-1.5"
            key={user.id}
            params={{ id: user.id }}
            to="/user/$id"
          >
            <ProfileAvatar className="size-8" user={user} />
            <UserLabel user={user} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function TagsSection() {
  const { data: terms } = useTerms();
  const tags = terms?.filter((term) => term.taxonomy === "tag") ?? [];

  return (
    <section className="py-5">
      <div className="section-title mb-3.5">Tags Populares</div>
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
    queryKey: ["posts", "recent", RECENT_POSTS_LIMIT],
    queryFn: () => orpcClient.post.getRecent({ limit: RECENT_POSTS_LIMIT }),
  });

  return (
    <section className="px-4 py-5">
      <div className="section-title mb-3.5">Publicaciones Recientes</div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          {Array.from({ length: RECENT_POSTS_LIMIT }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
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
