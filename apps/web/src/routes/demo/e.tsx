import {
  FavouriteIcon,
  Login03Icon,
  Search01Icon,
  StarIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "facehash";
import { motion } from "motion/react";
import { useRef, useState } from "react";

import {
  AuthDialog,
  AuthDialogContent,
  AuthDialogTrigger,
} from "@/components/auth/auth-dialog";
import { useTerms } from "@/hooks/use-terms";
import { authClient } from "@/lib/auth-client";
import { orpcClient, safeOrpcClient } from "@/lib/orpc";
import { cn, defaultFacehashProps, getBucketUrl } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PostData = {
  id: string;
  title: string;
  version: string | null;
  type: "post" | "comic";
  imageObjectKeys: string[] | null;
  favorites: number;
  likes: number;
  views: number;
  averageRating?: number;
};

type FeaturedPostData = PostData & {
  position: "main" | "secondary";
  order: number;
};

type UserData = {
  id: string;
  name: string;
  image: string | null;
  avatarFallbackColor: string;
};

type TermData = {
  id: string;
  name: string;
  taxonomy: string;
  color: string | null;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECENT_POSTS_LIMIT = 12;

const NAV_LINKS = [
  { label: "Inicio", to: "/" },
  { label: "Buscar", to: "/search" },
  { label: "Tutoriales", to: "/tutorials" },
  { label: "Chronos", to: "/chronos" },
] as const;

const STAGGER_CHILDREN = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const FADE_UP = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, transition: { duration: 0.5 }, y: 0 },
};

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/demo/e")({
  component: ObsidianLanding,
  head: () => ({
    meta: [{ title: "NeXusTC — Obsidian" }],
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function ObsidianLanding() {
  return (
    <div className="relative min-h-screen bg-background">
      {/* Atmospheric gradient mesh */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background: [
            "radial-gradient(ellipse 60% 50% at 20% 0%, oklch(0.795 0.184 86.047 / 0.07), transparent 60%)",
            "radial-gradient(ellipse 50% 60% at 80% 100%, oklch(0.57 0.297 304.654 / 0.09), transparent 60%)",
            "radial-gradient(ellipse 40% 40% at 60% 40%, oklch(0.66 0.228 21.05 / 0.04), transparent 50%)",
          ].join(", "),
        }}
      />

      {/* Grain overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }}
      />

      <div className="relative z-10">
        <ObsidianHeader />
        <main>
          <HeroSection />
          <WeeklyGamesSection />
          <RecentPostsSection />
          <CommunityStrip />
          <TagsCloud />
        </main>
        <ObsidianFooter />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function ObsidianHeader() {
  const auth = authClient.useSession();
  const user = auth.data?.user;
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50">
      {/* Glass bar */}
      <div className="border-b border-white/[0.06] bg-background/70 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-5">
          {/* Logo */}
          <Link className="shrink-0" to="/">
            <span className="font-[Lexend] text-2xl font-extrabold tracking-tight">
              <span className="bg-linear-to-br from-primary via-accent to-secondary bg-clip-text text-transparent">
                NeXus
              </span>
              <span className="text-foreground/80">TC</span>
              <span className="ml-0.5 align-super text-[10px] font-normal text-muted-foreground">
                +18
              </span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
                key={link.to}
                to={link.to}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <Link
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
              to="/search"
            >
              <HugeiconsIcon className="size-[18px]" icon={Search01Icon} />
            </Link>

            <HeaderAuth user={user} isPending={auth.isPending} />

            {/* Mobile menu toggle */}
            <button
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              type="button"
            >
              <svg
                aria-label="Menú"
                className="size-5"
                fill="none"
                role="img"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                {mobileOpen ? (
                  <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Accent line */}
      <div
        aria-hidden
        className="h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 5%, var(--primary) 30%, var(--secondary) 70%, transparent 95%)",
          opacity: 0.25,
        }}
      />

      {/* Mobile dropdown */}
      {mobileOpen && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="absolute inset-x-0 top-full border-b border-white/[0.06] bg-background/95 backdrop-blur-xl md:hidden"
          initial={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          <nav className="flex flex-col gap-1 px-5 py-4">
            {NAV_LINKS.map((link) => (
              <Link
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                key={link.to}
                onClick={() => setMobileOpen(false)}
                to={link.to}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </motion.div>
      )}
    </header>
  );
}

function HeaderAuth({
  user,
  isPending,
}: {
  user: { id: string; name: string; image?: string | null } | undefined;
  isPending: boolean;
}) {
  if (isPending) {
    return (
      <div className="size-8 animate-pulse rounded-full bg-white/[0.08]" />
    );
  }

  if (user) {
    return (
      <Link
        className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] py-1 pl-1 pr-3 transition-colors hover:border-primary/30 hover:bg-white/[0.07]"
        to="/profile"
      >
        <Avatar className="size-7 rounded-full">
          <AvatarImage
            src={user.image ? getBucketUrl(user.image) : undefined}
          />
          <AvatarFallback
            className="rounded-full text-[10px]"
            facehashProps={defaultFacehashProps}
            name={user.name}
          />
        </Avatar>
        <span className="hidden text-sm font-medium md:inline">
          {user.name}
        </span>
      </Link>
    );
  }

  return (
    <AuthDialog>
      <AuthDialogTrigger
        render={
          <button
            className="flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 py-1.5 pl-2.5 pr-3.5 text-sm font-semibold text-primary transition-all hover:border-primary/40 hover:bg-primary/20"
            type="button"
          />
        }
      >
        <HugeiconsIcon className="size-4" icon={Login03Icon} />
        <span className="hidden md:inline">Entrar</span>
      </AuthDialogTrigger>
      <AuthDialogContent />
    </AuthDialog>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroSection() {
  const { featuredPosts } = Route.useLoaderData();
  const posts = (featuredPosts.data ?? []) as FeaturedPostData[];
  const main = posts.find((p) => p.position === "main");
  const secondary = posts
    .filter((p) => p.position === "secondary")
    .toSorted((a, b) => a.order - b.order);

  if (!main && secondary.length === 0) {
    return <PlaceholderHero />;
  }

  const mainImage = main?.imageObjectKeys?.[0];

  return (
    <section className="relative">
      {/* Full-bleed hero image */}
      <div className="relative mx-auto max-w-7xl px-5 pt-6">
        <motion.div
          animate="visible"
          className="relative grid gap-4 md:grid-cols-[1fr_340px] md:min-h-[520px]"
          initial="hidden"
          variants={STAGGER_CHILDREN}
        >
          {/* Main card */}
          {main && (
            <motion.div variants={FADE_UP}>
              <Link
                className="group relative block h-full min-h-[360px] overflow-hidden rounded-2xl border border-white/[0.06]"
                params={{ id: main.id }}
                preload={false}
                to="/post/$id"
              >
                {/* Image / fallback */}
                {mainImage ? (
                  <img
                    alt={main.title}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    src={getBucketUrl(mainImage)}
                  />
                ) : (
                  <div className="absolute inset-0 bg-linear-to-br from-[oklch(0.22_0.06_280)] via-[oklch(0.18_0.09_320)] to-[oklch(0.14_0.05_200)]" />
                )}

                {/* Cinematic gradient overlays */}
                <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/30 to-transparent" />
                <div className="absolute inset-0 bg-linear-to-r from-black/40 to-transparent" />

                {/* "Featured" label */}
                <div className="absolute left-5 top-5 flex items-center gap-2">
                  <span className="rounded-full bg-primary/90 px-3 py-1 font-[Lexend] text-[11px] font-bold uppercase tracking-wider text-primary-foreground">
                    Destacado
                  </span>
                </div>

                {/* Content overlay */}
                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6 md:p-8">
                  <h1 className="max-w-xl font-[Lexend] text-3xl font-extrabold leading-[1.1] text-white drop-shadow-lg md:text-[42px]">
                    {main.title}
                  </h1>

                  <div className="flex items-center gap-5 text-white/60">
                    <StatBadge
                      icon={FavouriteIcon}
                      iconClass="fill-red-400 text-red-400"
                      value={formatCount(main.favorites)}
                    />
                    {!!main.averageRating && (
                      <StatBadge
                        icon={StarIcon}
                        iconClass="fill-amber-400 text-amber-400"
                        value={main.averageRating.toFixed(1)}
                      />
                    )}
                    <StatBadge
                      icon={ViewIcon}
                      iconClass="text-white/50"
                      value={formatCount(main.views)}
                    />
                  </div>
                </div>
              </Link>
            </motion.div>
          )}

          {/* Secondary stack */}
          {secondary.length > 0 && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-1">
              {secondary.slice(0, 2).map((post) => (
                <motion.div key={post.id} variants={FADE_UP}>
                  <SecondaryHeroCard post={post} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </section>
  );
}

function SecondaryHeroCard({ post }: { post: PostData }) {
  const image = post.imageObjectKeys?.[0];

  return (
    <Link
      className="group relative block h-full min-h-[200px] overflow-hidden rounded-2xl border border-white/[0.06] md:min-h-0"
      params={{ id: post.id }}
      preload={false}
      to="/post/$id"
    >
      {image ? (
        <img
          alt={post.title}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          src={getBucketUrl(image)}
        />
      ) : (
        <div className="absolute inset-0 bg-linear-to-br from-[oklch(0.20_0.08_320)] to-[oklch(0.15_0.04_260)]" />
      )}
      <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3 className="line-clamp-2 font-[Lexend] text-base font-bold leading-snug text-white">
          {post.title}
        </h3>
        <div className="mt-1.5 flex items-center gap-3 text-white/50 text-xs">
          <StatBadge
            icon={FavouriteIcon}
            iconClass="fill-red-400 text-red-400"
            value={formatCount(post.favorites)}
          />
          <StatBadge
            icon={ViewIcon}
            iconClass="text-white/40"
            value={formatCount(post.views)}
          />
        </div>
      </div>
    </Link>
  );
}

function PlaceholderHero() {
  return (
    <section className="relative mx-auto max-w-7xl px-5 pt-6">
      <div className="relative flex min-h-[400px] items-end overflow-hidden rounded-2xl border border-white/[0.06]">
        <div className="absolute inset-0 bg-linear-to-br from-[oklch(0.22_0.06_280)] via-[oklch(0.18_0.09_320)] to-[oklch(0.14_0.05_200)]" />
        <div className="absolute inset-0 bg-linear-to-t from-background via-background/40 to-transparent" />
        <div className="relative p-8">
          <h1 className="font-[Lexend] text-4xl font-extrabold text-white">
            NeXusTC
          </h1>
          <p className="mt-2 text-muted-foreground">
            Descubre los mejores juegos y cómics
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Weekly Games (horizontal scroll)
// ---------------------------------------------------------------------------

function WeeklyGamesSection() {
  const { weeklyGames } = Route.useLoaderData();
  const games = (weeklyGames.data ?? []) as PostData[];
  const scrollRef = useRef<HTMLDivElement>(null);

  if (games.length === 0) {
    return null;
  }

  return (
    <section className="relative mt-14">
      {/* Section number watermark */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-6 left-5 select-none font-[Lexend] text-[120px] font-black leading-none text-white/[0.02] md:left-[calc(50%-36rem)]"
      >
        01
      </div>

      <div className="mx-auto max-w-7xl px-5">
        <SectionHeader title="Juegos de la Semana" />
      </div>

      {/* Horizontal scroll */}
      <div className="relative mt-5">
        {/* Fade edges */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-linear-to-r from-background to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-linear-to-l from-background to-transparent"
        />

        <motion.div
          animate="visible"
          className="flex gap-4 overflow-x-auto scroll-smooth px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:px-[calc(50%-33rem)]"
          initial="hidden"
          ref={scrollRef}
          style={{ scrollSnapType: "x mandatory" }}
          variants={STAGGER_CHILDREN}
        >
          {games.map((game, i) => (
            <motion.div
              className="shrink-0"
              key={game.id}
              style={{ scrollSnapAlign: "start" }}
              variants={FADE_UP}
            >
              <GameCard game={game} rank={i + 1} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function GameCard({ game, rank }: { game: PostData; rank: number }) {
  const image = game.imageObjectKeys?.[0];

  return (
    <Link
      className="group relative block w-[200px] overflow-hidden rounded-xl border border-white/[0.06] transition-all duration-300 hover:border-primary/20 hover:shadow-[0_0_30px_-10px_var(--primary)] md:w-[220px]"
      params={{ id: game.id }}
      preload={false}
      to="/post/$id"
    >
      {/* Image */}
      <div className="relative aspect-[3/4]">
        {image ? (
          <img
            alt={game.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            src={getBucketUrl(image)}
          />
        ) : (
          <div className="h-full w-full bg-linear-to-br from-card to-muted" />
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-black/10" />

        {/* Rank number */}
        <span className="absolute right-3 top-3 font-[Lexend] text-4xl font-black leading-none text-white/10">
          {String(rank).padStart(2, "0")}
        </span>

        {/* Bottom info */}
        <div className="absolute inset-x-0 bottom-0 p-3.5">
          <h3 className="line-clamp-2 font-[Lexend] text-sm font-bold leading-snug text-white">
            {game.title}
          </h3>
          {game.version && (
            <span className="mt-1 inline-block rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/60">
              {game.version}
            </span>
          )}
          <div className="mt-2 flex items-center gap-3 text-[11px] text-white/40">
            <span className="flex items-center gap-1">
              <HugeiconsIcon
                className="size-3 fill-red-400 text-red-400"
                icon={FavouriteIcon}
              />
              {formatCount(game.favorites)}
            </span>
            <span className="flex items-center gap-1">
              <HugeiconsIcon className="size-3" icon={ViewIcon} />
              {formatCount(game.views)}
            </span>
          </div>
        </div>
      </div>

      {/* Tier accent line at bottom */}
      <div
        className={cn(
          "h-0.5",
          game.favorites >= 1000
            ? "bg-linear-to-r from-amber-400 to-amber-500"
            : game.favorites >= 500
              ? "bg-linear-to-r from-purple-400 to-purple-500"
              : game.favorites >= 100
                ? "bg-linear-to-r from-blue-400 to-blue-500"
                : game.favorites >= 20
                  ? "bg-linear-to-r from-green-400 to-green-500"
                  : "bg-muted-foreground/30"
        )}
      />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Recent Posts (bento grid)
// ---------------------------------------------------------------------------

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
    <section className="relative mt-16">
      {/* Section number watermark */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-6 right-5 select-none font-[Lexend] text-[120px] font-black leading-none text-white/[0.02] md:right-[calc(50%-36rem)]"
      >
        02
      </div>

      <div className="mx-auto max-w-7xl px-5">
        <SectionHeader title="Publicaciones Recientes" />

        {isLoading && (
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                className="aspect-video animate-pulse rounded-xl bg-white/[0.04]"
                key={`skeleton-${String(i)}`}
              />
            ))}
          </div>
        )}

        {isError && (
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Error al cargar las publicaciones recientes.
          </p>
        )}

        {!(isLoading || isError) && recentPosts && (
          <motion.div
            animate="visible"
            className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4"
            initial="hidden"
            variants={STAGGER_CHILDREN}
          >
            {recentPosts.map((post, i) => (
              <motion.div
                className={cn(i < 2 && "md:col-span-2 md:row-span-2")}
                key={post.id}
                variants={FADE_UP}
              >
                <RecentPostCard large={i < 2} post={post as PostData} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </section>
  );
}

function RecentPostCard({ post, large }: { post: PostData; large: boolean }) {
  const image = post.imageObjectKeys?.[0];

  return (
    <Link
      className="group relative block h-full overflow-hidden rounded-xl border border-white/[0.06] transition-all duration-300 hover:border-white/[0.12]"
      params={{ id: post.id }}
      preload={false}
      to="/post/$id"
    >
      <div
        className={cn("relative", large ? "aspect-[16/10]" : "aspect-video")}
      >
        {image ? (
          <img
            alt={post.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            src={getBucketUrl(image)}
          />
        ) : (
          <div className="h-full w-full bg-linear-to-br from-card to-muted" />
        )}

        {/* Overlay — stronger on hover */}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent transition-opacity group-hover:from-black/90" />

        {/* Version tag */}
        {post.version && (
          <span className="absolute right-2.5 top-2.5 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white/70 backdrop-blur">
            {post.version}
          </span>
        )}

        {/* Bottom content */}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <h3
            className={cn(
              "line-clamp-2 font-[Lexend] font-bold leading-snug text-white",
              large ? "text-lg md:text-xl" : "text-xs md:text-sm"
            )}
          >
            {post.title}
          </h3>

          <div
            className={cn(
              "mt-1.5 flex items-center gap-3 text-white/40",
              large ? "text-xs" : "text-[10px]"
            )}
          >
            <StatBadge
              icon={FavouriteIcon}
              iconClass="fill-red-400 text-red-400"
              value={formatCount(post.favorites)}
            />
            {!!post.averageRating && post.averageRating > 0 && (
              <StatBadge
                icon={StarIcon}
                iconClass="fill-amber-400 text-amber-400"
                value={post.averageRating.toFixed(1)}
              />
            )}
            <StatBadge
              icon={ViewIcon}
              iconClass="text-white/40"
              value={formatCount(post.views)}
            />
          </div>
        </div>
      </div>

      {/* Tier bar */}
      <div
        className={cn(
          "h-[2px]",
          post.favorites >= 1000
            ? "bg-linear-to-r from-amber-400 to-amber-500"
            : post.favorites >= 500
              ? "bg-linear-to-r from-purple-400 to-purple-500"
              : post.favorites >= 100
                ? "bg-linear-to-r from-blue-400 to-blue-500"
                : post.favorites >= 20
                  ? "bg-linear-to-r from-green-400 to-green-500"
                  : "bg-muted-foreground/20"
        )}
      />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Community Strip (Active Users)
// ---------------------------------------------------------------------------

function CommunityStrip() {
  const { recentUsers } = Route.useLoaderData();
  const users = (recentUsers.data ?? []) as unknown as UserData[];

  return (
    <section className="relative mt-16">
      {/* Section number watermark */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-6 left-5 select-none font-[Lexend] text-[120px] font-black leading-none text-white/[0.02] md:left-[calc(50%-36rem)]"
      >
        03
      </div>

      <div className="mx-auto max-w-7xl px-5">
        <SectionHeader title="Usuarios Activos" />
      </div>

      {users.length === 0 && (
        <p className="mx-auto max-w-7xl px-5 mt-4 text-sm text-muted-foreground">
          No hay usuarios activos en este momento.
        </p>
      )}

      {users.length > 0 && (
        <div className="relative mt-5">
          {/* Fade edges */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-linear-to-r from-background to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-linear-to-l from-background to-transparent"
          />

          <motion.div
            animate="visible"
            className="flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:px-[calc(50%-33rem)]"
            initial="hidden"
            variants={STAGGER_CHILDREN}
          >
            {users.map((user) => (
              <motion.div className="shrink-0" key={user.id} variants={FADE_UP}>
                <UserChip user={user} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}
    </section>
  );
}

function UserChip({ user }: { user: UserData }) {
  const imageSrc = user.image ? getBucketUrl(user.image) : undefined;

  return (
    <Link
      className="group flex items-center gap-2.5 rounded-full border border-white/[0.06] bg-white/[0.03] py-1.5 pl-1.5 pr-4 transition-all duration-200 hover:border-primary/20 hover:bg-white/[0.06]"
      params={{ id: user.id }}
      to="/user/$id"
    >
      {/* Avatar with online pulse */}
      <span className="relative">
        <Avatar className="size-8 rounded-full">
          <AvatarImage src={imageSrc} />
          <AvatarFallback
            className="rounded-full text-[10px]"
            facehashProps={defaultFacehashProps}
            name={user.name}
          />
        </Avatar>
        <span
          aria-hidden
          className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-400"
        />
      </span>

      <span className="text-sm font-medium text-foreground/90 group-hover:text-foreground">
        {user.name}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Tags Cloud
// ---------------------------------------------------------------------------

function TagsCloud() {
  const { data: terms } = useTerms();
  const tags = (terms?.filter((t) => t.taxonomy === "tag") ?? []) as TermData[];

  if (tags.length === 0) {
    return null;
  }

  return (
    <section className="relative mt-16">
      {/* Section number watermark */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-6 right-5 select-none font-[Lexend] text-[120px] font-black leading-none text-white/[0.02] md:right-[calc(50%-36rem)]"
      >
        04
      </div>

      <div className="mx-auto max-w-7xl px-5">
        <SectionHeader title="Tags Populares" />

        <motion.div
          animate="visible"
          className="mt-5 flex flex-wrap gap-2"
          initial="hidden"
          variants={STAGGER_CHILDREN}
        >
          {tags.map((tag) => (
            <motion.div key={tag.id} variants={FADE_UP}>
              <TagPill tag={tag} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function TagPill({ tag }: { tag: TermData }) {
  const color = tag.color ?? "#888";

  return (
    <Link
      className="group relative overflow-hidden rounded-lg border border-white/[0.06] px-3.5 py-2 transition-all duration-200 hover:border-white/[0.12]"
      preload={false}
      search={{ tag: [tag.id] }}
      style={
        {
          "--tag-color": color,
        } as React.CSSProperties
      }
      to="/search"
    >
      {/* Subtle colored background */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] transition-opacity group-hover:opacity-[0.12]"
        style={{ backgroundColor: color }}
      />

      <span className="relative flex items-center gap-2">
        {/* Color dot */}
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-medium text-foreground/80 group-hover:text-foreground">
          {tag.name}
        </span>
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function ObsidianFooter() {
  return (
    <footer className="mt-20 pb-8">
      {/* Glow separator */}
      <div
        aria-hidden
        className="mx-auto h-px max-w-7xl"
        style={{
          background:
            "linear-gradient(90deg, transparent 10%, var(--primary) 35%, var(--secondary) 65%, transparent 90%)",
          opacity: 0.2,
        }}
      />

      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 pt-6">
        <span className="font-[Lexend] text-sm font-bold text-muted-foreground/50">
          NeXusTC
        </span>
        <span className="text-xs text-muted-foreground/30">Obsidian Demo</span>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-5 w-[3px] rounded-full bg-primary" />
      <h2 className="font-[Lexend] text-sm font-semibold uppercase tracking-[0.1em] text-foreground">
        {title}
      </h2>
      <span
        aria-hidden
        className="h-px flex-1"
        style={{
          background: "linear-gradient(90deg, var(--border), transparent 80%)",
        }}
      />
    </div>
  );
}

function StatBadge({
  icon,
  iconClass,
  value,
}: {
  icon: typeof FavouriteIcon;
  iconClass: string;
  value: string;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <HugeiconsIcon className={cn("size-3.5", iconClass)} icon={icon} />
      <span className="font-medium">{value}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`;
  }
  return String(n);
}
