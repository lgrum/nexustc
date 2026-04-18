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
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { TermBadge } from "@/components/term-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UserLabel } from "@/components/users/user-label";
import { useTerms } from "@/hooks/use-terms";
import { authClient } from "@/lib/auth-client";
import { orpcClient, safeOrpcClient } from "@/lib/orpc";
import { getCoverImageObjectKey } from "@/lib/post-images";
import { cn, defaultFacehashProps, getBucketUrl } from "@/lib/utils";

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
          <SectionTitle
            title="Juegos de la Semana"
            icon={GameController03Icon}
          />
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
  const mainImage = getCoverImageObjectKey(
    main?.imageObjectKeys,
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
          className="group relative block overflow-hidden rounded-xl border border-border flex-1 min-h-105"
          params={{ id: main.id }}
          preload={false}
          to="/post/$id"
        >
          {/* Image */}
          {mainImage && (
            <img
              alt={main.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              src={getBucketUrl(mainImage)}
            />
          )}
          {!mainImage && (
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
        <div className="grid grid-cols-2 md:grid-cols-none md:grid-rows-2 gap-4 md:aspect-1/2">
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
          <span className="truncate font-semibold text-base">{user.name}</span>
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
              "min-h-14 cursor-pointer rounded-xl border border-primary/30 bg-linear-to-r from-primary/20 via-accent/15 to-primary/5 px-3 py-3 shadow-[0_14px_35px_-24px_hsl(var(--primary))] transition-all duration-200 hover:border-primary/50 hover:from-primary/30 hover:via-accent/20 hover:to-primary/10",
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
  const { data: terms } = useTerms();
  const tags = terms?.filter((term) => term.taxonomy === "tag") ?? [];

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
    <div className="flex items-center gap-3">
      <div className="bg-linear-135 from-primary/30 to-secondary/30 border border-primary flex size-8 items-center justify-center rounded-lg">
        <HugeiconsIcon className="size-4 text-primary" icon={icon} />
      </div>
      <div className="section-title">{title}</div>
    </div>
  );
}
