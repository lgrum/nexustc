import {
  FavouriteIcon,
  Home01Icon,
  Search01Icon,
  Book03Icon,
  Clock01Icon,
  StarIcon,
  ViewIcon,
  Login03Icon,
  ArrowRight01Icon,
  Fire03Icon,
  GameController03Icon,
  UserGroupIcon,
  TagsIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import Autoplay from "embla-carousel-autoplay";
import { Avatar, AvatarFallback, AvatarImage, Facehash } from "facehash";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

import {
  AuthDialog,
  AuthDialogContent,
  AuthDialogTrigger,
} from "@/components/auth/auth-dialog";
import { PostCard } from "@/components/landing/post-card";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { TermBadge } from "@/components/term-badge";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import type { CarouselApi } from "@/components/ui/carousel";
import { Skeleton } from "@/components/ui/skeleton";
import { UserLabel } from "@/components/users/user-label";
import { useTerms } from "@/hooks/use-terms";
import { authClient } from "@/lib/auth-client";
import { orpcClient, safeOrpcClient } from "@/lib/orpc";
import { cn, defaultFacehashProps, getBucketUrl } from "@/lib/utils";

const RECENT_POSTS_LIMIT = 12;

export const Route = createFileRoute("/demo/d")({
  component: DemoLandingPage,
  head: () => ({
    meta: [{ title: "NeXusTC - Demo Landing" }],
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

/* ─────────────────────────── Main Page ─────────────────────────── */

function DemoLandingPage() {
  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-background text-foreground">
      {/* Ambient background effects */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse 600px 400px at 85% 5%, oklch(82.777% 0.16583 79.425 / 0.12), transparent),
            radial-gradient(ellipse 500px 500px at 10% 90%, oklch(57.096% 0.29724 304.654 / 0.08), transparent),
            radial-gradient(ellipse 400px 300px at 50% 50%, oklch(0.6597 0.2275 21.0495 / 0.04), transparent)
          `,
        }}
      />

      {/* Noise texture overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }}
      />

      <div className="relative z-10">
        <DemoHeader />

        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Hero */}
          <DemoHeroSection />

          {/* Divider */}
          <div className="mx-auto my-8 max-w-4xl">
            <div className="demo-glow-divider h-px w-full" />
          </div>

          {/* Two-column layout */}
          <div className="flex gap-8 pb-12">
            {/* Main content */}
            <div className="flex min-w-0 flex-1 flex-col gap-10">
              <DemoGamesSection />
              <DemoRecentPostsSection />

              {/* Mobile-only sidebar sections */}
              <div className="flex flex-col gap-8 lg:hidden">
                <div className="demo-glow-divider h-px w-full" />
                <DemoActiveUsersSection />
                <div className="demo-glow-divider h-px w-full" />
                <DemoTagsSection />
              </div>
            </div>

            {/* Sidebar — desktop only */}
            <aside className="hidden w-80 shrink-0 lg:block">
              <div className="sticky top-20 flex flex-col gap-6">
                <DemoAuthAction />
                <DemoActiveUsersSection />
                <div className="demo-glow-divider h-px w-full" />
                <DemoTagsSection />
              </div>
            </aside>
          </div>
        </main>

        <DemoFooter />
      </div>

      {/* Inline styles for demo-specific decorations */}
      <style>
        {`
          .demo-glow-divider {
            background: linear-gradient(
              90deg,
              transparent 0%,
              oklch(0.795 0.184 86.047 / 0.4) 20%,
              oklch(57.096% 0.29724 304.654 / 0.5) 50%,
              oklch(0.6597 0.2275 21.0495 / 0.4) 80%,
              transparent 100%
            );
          }

          .demo-card-shine {
            background: linear-gradient(
              135deg,
              oklch(1 0 0 / 0.03) 0%,
              oklch(1 0 0 / 0.06) 50%,
              oklch(1 0 0 / 0.02) 100%
            );
          }

          .demo-section-icon {
            background: linear-gradient(135deg, oklch(0.795 0.184 86.047 / 0.15), oklch(57.096% 0.29724 304.654 / 0.15));
            border: 1px solid oklch(0.795 0.184 86.047 / 0.2);
          }

          @keyframes demo-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
          }

          @keyframes demo-pulse-glow {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }

          .demo-hero-badge {
            animation: demo-pulse-glow 3s ease-in-out infinite;
          }
        `}
      </style>
    </div>
  );
}

/* ─────────────────────────── Header ─────────────────────────── */

const demoNavItems = [
  { href: "/", icon: Home01Icon, label: "Inicio" },
  { href: "/search", icon: Search01Icon, label: "Buscar" },
  { href: "/tutorials", icon: Book03Icon, label: "Tutoriales" },
  { href: "/chronos", icon: Clock01Icon, label: "Chronos" },
] as const;

function DemoHeader() {
  const auth = authClient.useSession();
  const user = auth.data?.user;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link className="group flex items-center gap-2" to="/">
          <div className="flex size-9 items-center justify-center rounded-lg bg-linear-to-br from-primary to-accent shadow-[0_0_20px_oklch(0.795_0.184_86.047/0.3)]">
            <span className="font-[Lexend] font-extrabold text-background text-sm">
              N
            </span>
          </div>
          <div>
            <h1 className="font-[Lexend] font-extrabold text-lg leading-tight tracking-tight">
              <span className="bg-linear-to-br from-primary to-accent bg-clip-text text-transparent">
                NeXusTC
              </span>
            </h1>
          </div>
        </Link>

        {/* Center nav */}
        <nav className="hidden md:flex">
          <div className="flex items-center gap-1 rounded-full border border-border/50 bg-card/50 px-2 py-1 backdrop-blur-sm">
            {demoNavItems.map((item) => (
              <DemoNavItem key={item.href} {...item} />
            ))}
          </div>
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-3">
          {user && user.role !== "user" && (
            <Button
              className="hidden sm:inline-flex"
              nativeButton={false}
              render={<Link to="/admin" />}
              size="sm"
              variant="outline"
            >
              Admin
            </Button>
          )}
          <DemoProfileNavItem />
        </div>
      </div>
    </header>
  );
}

function DemoNavItem({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: typeof Home01Icon;
}) {
  const location = useLocation();

  const isActive =
    href === "/"
      ? location.pathname === "/" || location.pathname === "/demo/d"
      : location.pathname.startsWith(href);

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium text-sm transition-all duration-200",
        isActive
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
      to={href}
    >
      {isActive && (
        <motion.span
          className="absolute inset-0 rounded-full bg-primary/10"
          layoutId="demo-nav-pill"
          transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
        />
      )}
      <HugeiconsIcon className="relative size-4" icon={icon} />
      <span className="relative">{label}</span>
    </Link>
  );
}

function DemoProfileNavItem() {
  const { data: auth } = authClient.useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAuthed = mounted && Boolean(auth?.session);
  const displayName = isAuthed ? (auth?.user.name ?? "cronos") : "cronos";
  const imageSrc = isAuthed
    ? auth?.user.image
      ? getBucketUrl(auth.user.image)
      : undefined
    : undefined;

  if (!isAuthed) {
    return (
      <AuthDialog>
        <AuthDialogTrigger
          render={
            <Button
              className="gap-2 rounded-full border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
              size="sm"
              variant="outline"
            />
          }
        >
          <HugeiconsIcon className="size-4" icon={Login03Icon} />
          <span className="hidden sm:inline">Iniciar sesión</span>
        </AuthDialogTrigger>
        <AuthDialogContent />
      </AuthDialog>
    );
  }

  return (
    <Link className="group flex items-center gap-2" to="/profile">
      <Avatar className="size-8 rounded-full ring-2 ring-primary/30 transition-all group-hover:ring-primary/60">
        <AvatarImage src={imageSrc} />
        <AvatarFallback
          className="rounded-full"
          facehashProps={defaultFacehashProps}
          name={displayName}
        />
      </Avatar>
    </Link>
  );
}

/* ─────────────────────────── Hero Section ─────────────────────────── */

function DemoHeroSection() {
  const { featuredPosts } = Route.useLoaderData();

  if (
    featuredPosts.error ||
    !featuredPosts.data ||
    featuredPosts.data.length === 0
  ) {
    return <DemoPlaceholderHero />;
  }

  const posts = featuredPosts.data;
  const main = posts.find((p) => p.position === "main");
  const secondary = posts
    .filter((p) => p.position === "secondary")
    .toSorted((a, b) => a.order - b.order);

  return (
    <section className="relative pb-4 pt-6">
      {/* Section label */}
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 flex items-center gap-3"
        initial={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.4 }}
      >
        <div className="demo-section-icon flex size-8 items-center justify-center rounded-lg">
          <HugeiconsIcon className="size-4 text-primary" icon={Fire03Icon} />
        </div>
        <div>
          <h2 className="font-[Lexend] font-bold text-base tracking-tight">
            Destacado
          </h2>
          <p className="text-muted-foreground text-xs">
            Lo mejor de la comunidad
          </p>
        </div>
      </motion.div>

      <div className="flex flex-col gap-4 lg:flex-row lg:max-h-130">
        {/* Main featured card */}
        {main && (
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1"
            initial={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Link
              className="group relative block h-full min-h-80 overflow-hidden rounded-2xl border border-border/50 lg:min-h-0"
              params={{ id: main.id }}
              preload={false}
              to="/post/$id"
            >
              {/* Image */}
              {main.imageObjectKeys?.[0] ? (
                <img
                  alt={main.title}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  src={getBucketUrl(main.imageObjectKeys[0])}
                />
              ) : (
                <div className="h-full w-full bg-linear-to-br from-[oklch(0.25_0.05_280)] via-[oklch(0.2_0.08_320)] to-[oklch(0.15_0.04_200)]" />
              )}

              {/* Gradient overlays */}
              <div className="absolute inset-0 bg-linear-to-t from-background via-background/40 to-transparent" />
              <div className="absolute inset-0 bg-linear-to-r from-background/20 to-transparent" />

              {/* Featured badge */}
              <div className="demo-hero-badge absolute top-4 left-4 flex items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1 text-background shadow-[0_0_20px_oklch(0.795_0.184_86.047/0.4)]">
                <HugeiconsIcon className="size-3.5" icon={Fire03Icon} />
                <span className="font-[Lexend] font-semibold text-xs">
                  DESTACADO
                </span>
              </div>

              {/* Content */}
              <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                <h2 className="mb-3 max-w-lg font-[Lexend] font-extrabold text-2xl text-white leading-[1.15] drop-shadow-lg sm:text-3xl lg:text-[32px]">
                  {main.title}
                </h2>
                <div className="flex gap-5 text-xs">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 backdrop-blur-sm">
                    <HugeiconsIcon
                      className="size-3.5 fill-red-500 text-red-500"
                      icon={FavouriteIcon}
                    />
                    <span className="font-semibold text-white">128</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 backdrop-blur-sm">
                    <HugeiconsIcon
                      className="size-3.5 fill-amber-400 text-amber-400"
                      icon={StarIcon}
                    />
                    <span className="font-semibold text-white">4.8</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 backdrop-blur-sm">
                    <HugeiconsIcon
                      className="size-3.5 text-white/70"
                      icon={ViewIcon}
                    />
                    <span className="font-semibold text-white">2.4K</span>
                  </span>
                </div>
              </div>
            </Link>
          </motion.div>
        )}

        {/* Secondary cards */}
        {secondary.length > 0 && (
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="grid grid-cols-2 gap-4 lg:w-85 lg:grid-cols-1 lg:grid-rows-2"
            initial={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {secondary.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </motion.div>
        )}

        {!main && <DemoPlaceholderHero />}
      </div>
    </section>
  );
}

function DemoPlaceholderHero() {
  return (
    <section className="relative pt-6 pb-4">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 flex items-center gap-3"
        initial={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.4 }}
      >
        <div className="demo-section-icon flex size-8 items-center justify-center rounded-lg">
          <HugeiconsIcon className="size-4 text-primary" icon={Fire03Icon} />
        </div>
        <div>
          <h2 className="font-[Lexend] font-bold text-base tracking-tight">
            Destacado
          </h2>
          <p className="text-muted-foreground text-xs">
            Lo mejor de la comunidad
          </p>
        </div>
      </motion.div>

      <div
        className="relative overflow-hidden rounded-2xl border border-border/50"
        style={{ height: "420px" }}
      >
        <div className="h-full w-full bg-linear-to-br from-[oklch(0.25_0.05_280)] via-[oklch(0.2_0.08_320)] to-[oklch(0.15_0.04_200)]" />
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/30 to-transparent" />

        {/* Decorative grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(1 0 0 / 0.3) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.3) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="absolute inset-x-0 bottom-0 p-6">
          <div className="demo-hero-badge mb-4 inline-flex items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1 text-background">
            <HugeiconsIcon className="size-3.5" icon={Fire03Icon} />
            <span className="font-[Lexend] font-semibold text-xs">
              BIENVENIDO
            </span>
          </div>
          <h2 className="font-[Lexend] font-extrabold text-3xl text-white sm:text-4xl">
            NeXusTC
          </h2>
          <p className="mt-2 max-w-md text-muted-foreground text-sm">
            Descubre los mejores juegos y cómics de la comunidad. Explora,
            comenta y comparte con otros usuarios.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Games Carousel ─────────────────────────── */

function DemoGamesSection() {
  const { weeklyGames } = Route.useLoaderData();
  const [api, setApi] = useState<CarouselApi | undefined>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) {
      return;
    }
    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    return () => {
      api.off?.("select", onSelect);
    };
  }, [api]);

  const games = weeklyGames.data ?? [];

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay: 0.3 }}
    >
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="demo-section-icon flex size-8 items-center justify-center rounded-lg">
            <HugeiconsIcon
              className="size-4 text-primary"
              icon={GameController03Icon}
            />
          </div>
          <div>
            <h2 className="font-[Lexend] font-bold text-base tracking-tight">
              Juegos de la Semana
            </h2>
            <p className="text-muted-foreground text-xs">
              Los más populares esta semana
            </p>
          </div>
        </div>

        {/* Carousel indicators */}
        {count > 0 && (
          <div className="hidden items-center gap-1 sm:flex">
            {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
              <button
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === current
                    ? "w-6 bg-primary"
                    : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
                // oxlint-disable-next-line react/no-array-index-key static carousel dots
                key={`dot-${i}`}
                onClick={() => api?.scrollTo(i)}
                type="button"
              />
            ))}
          </div>
        )}
      </div>

      <Carousel
        opts={{ dragFree: true, loop: true }}
        plugins={[Autoplay({ delay: 4000, stopOnInteraction: false })]}
        setApi={setApi}
      >
        <CarouselContent className="-ml-3">
          {games.map((game) => (
            <CarouselItem
              className="basis-1/2 pl-3 md:basis-1/3 lg:basis-1/4"
              key={game.id}
            >
              <PostCard post={game} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    </motion.section>
  );
}

/* ─────────────────────────── Recent Posts ─────────────────────────── */

function DemoRecentPostsSection() {
  const {
    data: recentPosts,
    isLoading,
    isError,
  } = useQuery({
    queryFn: () => orpcClient.post.getRecent({ limit: RECENT_POSTS_LIMIT }),
    queryKey: ["posts", "recent", RECENT_POSTS_LIMIT],
  });

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      initial={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay: 0.4 }}
    >
      {/* Section header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="demo-section-icon flex size-8 items-center justify-center rounded-lg">
            <HugeiconsIcon className="size-4 text-primary" icon={Clock01Icon} />
          </div>
          <div>
            <h2 className="font-[Lexend] font-bold text-base tracking-tight">
              Publicaciones Recientes
            </h2>
            <p className="text-muted-foreground text-xs">
              Lo último de la comunidad
            </p>
          </div>
        </div>

        <Link
          className="group flex items-center gap-1 text-muted-foreground text-sm transition-colors hover:text-primary"
          to="/search"
        >
          <span>Ver todo</span>
          <HugeiconsIcon
            className="size-3.5 transition-transform group-hover:translate-x-0.5"
            icon={ArrowRight01Icon}
          />
        </Link>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: RECENT_POSTS_LIMIT }).map((_, i) => (
            // oxlint-disable-next-line react/no-array-index-key static skeleton placeholders
            <Skeleton
              className="aspect-video w-full rounded-xl"
              key={`skel-${i}`}
            />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-center rounded-xl border border-border/50 bg-card/50 py-12">
          <p className="text-muted-foreground text-sm">
            Error al cargar los posts recientes
          </p>
        </div>
      )}

      {!(isLoading || isError) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {recentPosts?.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </motion.section>
  );
}

/* ─────────────────────────── Auth Action (Sidebar) ─────────────────────────── */

function DemoAuthAction() {
  const auth = authClient.useSession();
  const user = auth.data?.user;
  const imageSrc = user?.image ? getBucketUrl(user.image) : undefined;

  if (auth.isPending) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-card/50 p-4">
        <div className="size-12 animate-pulse rounded-full bg-muted" />
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <Link
        className="group flex items-center gap-3 rounded-2xl border border-primary/20 bg-linear-to-r from-primary/10 via-card/50 to-card/80 p-4 transition-all duration-300 hover:border-primary/40 hover:shadow-[0_0_30px_oklch(0.795_0.184_86.047/0.15)]"
        to="/profile"
      >
        <Avatar className="size-12 rounded-full ring-2 ring-primary/30 transition-all group-hover:ring-primary/50">
          <AvatarImage src={imageSrc} />
          <AvatarFallback
            className="rounded-full"
            facehashProps={defaultFacehashProps}
            name={user.name}
          />
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-sm">{user.name}</span>
          <span className="text-muted-foreground text-xs">Ver perfil</span>
        </div>
        <HugeiconsIcon
          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
          icon={ArrowRight01Icon}
        />
      </Link>
    );
  }

  return (
    <AuthDialog>
      <AuthDialogTrigger
        render={
          <button
            className="group flex w-full items-center gap-3 rounded-2xl border border-primary/25 bg-linear-to-r from-primary/15 via-card/50 to-card/80 p-4 text-left transition-all duration-300 hover:border-primary/45 hover:shadow-[0_0_30px_oklch(0.795_0.184_86.047/0.15)]"
            type="button"
          />
        }
      >
        <Facehash
          className="size-12 rounded-full ring-2 ring-primary/20"
          name=""
          {...defaultFacehashProps}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold text-sm">Iniciar sesión</span>
          <span className="text-muted-foreground text-xs">
            Accede a tu perfil
          </span>
        </div>
        <HugeiconsIcon
          className="size-4 text-primary transition-transform group-hover:translate-x-0.5"
          icon={Login03Icon}
        />
      </AuthDialogTrigger>
      <AuthDialogContent />
    </AuthDialog>
  );
}

/* ─────────────────────────── Active Users ─────────────────────────── */

function DemoActiveUsersSection() {
  const { recentUsers } = Route.useLoaderData();

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <div className="demo-section-icon flex size-7 items-center justify-center rounded-md">
          <HugeiconsIcon
            className="size-3.5 text-primary"
            icon={UserGroupIcon}
          />
        </div>
        <h3 className="font-[Lexend] font-semibold text-sm uppercase tracking-wider">
          Usuarios Activos
        </h3>
      </div>

      {!!recentUsers.error && (
        <p className="text-red-500 text-sm">Error: {recentUsers.error.code}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {recentUsers.data?.map((user) => (
          <Link
            className="group flex items-center gap-2 rounded-xl border border-border/50 bg-card/50 px-3 py-2 transition-all duration-200 hover:border-primary/30 hover:bg-card"
            key={user.id}
            params={{ id: user.id }}
            to="/user/$id"
          >
            <ProfileAvatar
              className="size-7 transition-transform group-hover:scale-105"
              user={user}
            />
            <UserLabel user={user} />
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Tags ─────────────────────────── */

function DemoTagsSection() {
  const { data: terms } = useTerms();
  const tags = terms?.filter((term) => term.taxonomy === "tag") ?? [];

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <div className="demo-section-icon flex size-7 items-center justify-center rounded-md">
          <HugeiconsIcon className="size-3.5 text-primary" icon={TagsIcon} />
        </div>
        <h3 className="font-[Lexend] font-semibold text-sm uppercase tracking-wider">
          Tags Populares
        </h3>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Link
            className="group flex transition-transform hover:scale-[1.03]"
            key={tag.id}
            preload={false}
            search={{ tag: [tag.id] }}
            to="/search"
          >
            <TermBadge tag={tag} />
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── Footer ─────────────────────────── */

const demoFooterLinks = [
  { href: "/about", label: "Acerca" },
  { href: "/privacy", label: "Privacidad" },
  { href: "/terms", label: "Términos" },
  { href: "/legal", label: "Legal" },
] as const;

function DemoFooter() {
  return (
    <footer className="relative border-t border-border/50">
      {/* Top glow line */}
      <div className="demo-glow-divider absolute inset-x-0 top-0 h-px" />

      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-primary/20 to-accent/20">
            <span className="font-[Lexend] font-extrabold text-primary text-xs">
              N
            </span>
          </div>
          <div>
            <span className="font-[Lexend] font-bold text-foreground/80 text-sm">
              NeXusTC
              <span className="ml-1 align-super font-normal text-muted-foreground text-[10px]">
                +18
              </span>
            </span>
            <p className="text-muted-foreground text-xs">BETA &copy; 2026</p>
          </div>
        </div>

        <nav className="flex flex-wrap gap-4">
          {demoFooterLinks.map((link) => (
            <Link
              className="text-muted-foreground text-sm transition-colors hover:text-foreground"
              key={link.href}
              to={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
