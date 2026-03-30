import {
  FavouriteIcon,
  Home01Icon,
  Login03Icon,
  Menu01Icon,
  Notification03Icon,
  Search01Icon,
  StarIcon,
  UserCircleIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserLabel } from "@/components/users/user-label";
import { useTerms } from "@/hooks/use-terms";
import { authClient } from "@/lib/auth-client";
import { orpcClient, safeOrpcClient } from "@/lib/orpc";
import { cn, getBucketUrl, getTierColor } from "@/lib/utils";

const RECENT_POSTS_LIMIT = 12;

export const Route = createFileRoute("/demo/b")({
  component: DemoBComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Cyber Design Concept",
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

function DemoBComponent() {
  const { featuredPosts, weeklyGames, recentUsers } = Route.useLoaderData();

  return (
    <div className="relative min-h-screen bg-[#050505] font-sans text-foreground selection:bg-primary/30">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-secondary/10 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] right-[15%] w-[30%] h-[30%] bg-accent/5 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
      </div>

      <NavHeader />

      <main className="container mx-auto px-4 pt-24 pb-20 relative z-10">
        <HeroSection posts={featuredPosts.data ?? []} />

        <div className="mt-24">
          <SectionHeader
            subtitle="Los más jugados esta semana"
            title="Nexus Weekly"
          />
          <GamesCarouselSection games={weeklyGames.data ?? []} />
        </div>

        <div className="mt-24 grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Recent Posts Grid */}
          <div className="lg:col-span-8">
            <SectionHeader
              subtitle="Lo último en la plataforma"
              title="Transmisiones Recientes"
            />
            <RecentPostsGrid />
          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-4 space-y-12">
            <div>
              <SectionHeader title="Usuarios en Línea" />
              <ActiveUsersList users={recentUsers.data ?? []} />
            </div>

            <div>
              <SectionHeader title="Matriz de Tags" />
              <TagCloud />
            </div>
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function NavHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const auth = authClient.useSession();

  if (typeof window !== "undefined") {
    window.addEventListener(
      "scroll",
      () => {
        setIsScrolled(window.scrollY > 20);
      },
      { passive: true }
    );
  }

  return (
    <motion.header
      animate={{
        backgroundColor: isScrolled ? "rgba(5, 5, 5, 0.9)" : "rgba(5, 5, 5, 0)",
        backdropFilter: isScrolled ? "blur(20px)" : "blur(0px)",
        borderBottom: isScrolled
          ? "1px solid rgba(0, 255, 255, 0.1)"
          : "1px solid rgba(255, 255, 255, 0)",
      }}
      className="fixed top-0 inset-x-0 z-50 h-20 transition-all duration-500"
      initial={{ y: 0 }}
      whileInView={{ y: 0 }}
    >
      <div className="container mx-auto h-full px-4 flex items-center justify-between">
        <div className="flex items-center gap-12">
          <Link className="flex items-center gap-2 group" to="/">
            <div className="relative size-10 bg-primary rounded-lg flex items-center justify-center transform rotate-3 group-hover:rotate-12 transition-all duration-500 shadow-[0_0_20px_rgba(var(--primary-rgb),0.5)] overflow-hidden">
              <div className="absolute inset-0 bg-linear-to-tr from-white/20 to-transparent" />
              <HugeiconsIcon
                className="size-6 text-black relative z-10"
                icon={UserCircleIcon}
              />
            </div>
            <span className="font-serif font-black text-2xl tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-white via-white to-white/60">
              NEXUS<span className="text-primary">TC</span>
            </span>
          </Link>

          <nav className="hidden lg:flex items-center gap-8">
            {["Explorar", "Juegos", "Cómics", "Comunidad", "Ranking"].map(
              (item) => (
                <Link
                  className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 hover:text-primary transition-all relative group py-2"
                  key={item}
                  to="/"
                >
                  {item}
                  <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.8)] transition-all group-hover:w-full" />
                </Link>
              )
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center bg-white/5 border border-white/5 rounded-full px-4 py-1.5 focus-within:border-primary/50 transition-all">
            <HugeiconsIcon
              className="size-4 text-white/30"
              icon={Search01Icon}
            />
            <input
              className="bg-transparent border-none outline-none text-xs text-white px-3 w-32 focus:w-48 transition-all placeholder:text-white/20"
              placeholder="Buscar en el nexo..."
              type="text"
            />
          </div>

          <button className="p-2 text-white/60 hover:text-white transition-colors relative group">
            <HugeiconsIcon className="size-5" icon={Notification03Icon} />
            <span className="absolute top-2 right-2 size-1.5 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary-rgb),1)]" />
          </button>

          <div className="h-6 w-px bg-white/10 mx-2" />

          {auth.data?.user ? (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <ProfileAvatar
                className="size-10 border-2 border-primary/20 rounded-full cursor-pointer hover:border-primary/60 transition-colors"
                user={auth.data.user}
              />
            </motion.div>
          ) : (
            <Button
              className="rounded-xl bg-primary text-black font-black text-[10px] uppercase tracking-widest hover:bg-primary/90 shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)] hover:shadow-primary/50 transition-all border-none"
              size="sm"
            >
              <HugeiconsIcon className="mr-2 size-4" icon={Login03Icon} />
              Acceder
            </Button>
          )}

          <button className="lg:hidden p-2 text-white/60">
            <HugeiconsIcon className="size-6" icon={Menu01Icon} />
          </button>
        </div>
      </div>
    </motion.header>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-4 mb-2">
        <div className="h-px flex-1 bg-linear-to-r from-primary/50 to-transparent" />
        <h2 className="font-serif font-black text-xs uppercase tracking-[0.3em] text-primary">
          {title}
        </h2>
      </div>
      {subtitle && (
        <p className="text-3xl font-serif font-extrabold text-white leading-none">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function HeroSection({ posts }: { posts: any[] }) {
  const main = posts.find((p) => p.position === "main");
  const secondary = posts
    .filter((p) => p.position === "secondary")
    .toSorted((a: any, b: any) => a.order - b.order)
    .slice(0, 2);

  return (
    <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[500px]">
      {/* Main Hero Card */}
      <motion.div
        className="lg:col-span-8 group relative overflow-hidden rounded-3xl border border-white/10 bg-black/40"
        initial={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.5 }}
        whileInView={{ opacity: 1, scale: 1 }}
      >
        <Link
          className="block h-full w-full"
          params={{ id: main?.id }}
          to="/post/$id"
        >
          {main?.imageObjectKeys?.[0] ? (
            <img
              alt={main.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              src={getBucketUrl(main.imageObjectKeys[0])}
            />
          ) : (
            <div className="h-full w-full bg-linear-to-br from-primary/20 via-black to-secondary/20" />
          )}

          <div className="absolute inset-0 bg-linear-to-t from-black via-black/20 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 p-8 lg:p-12">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              transition={{ delay: 0.2 }}
              whileInView={{ y: 0, opacity: 1 }}
            >
              <div className="flex gap-2 mb-4">
                <span className="px-3 py-1 bg-primary text-black text-[10px] font-black uppercase tracking-widest rounded-full">
                  Destacado
                </span>
                <span className="px-3 py-1 bg-white/10 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-widest rounded-full border border-white/10">
                  {main?.type === "post" ? "Juego" : "Cómic"}
                </span>
              </div>
              <h1 className="text-4xl lg:text-6xl font-serif font-black text-white mb-6 leading-[0.9] tracking-tighter">
                {main?.title ?? "Explora el Nexo"}
              </h1>
              <div className="flex items-center gap-6 text-sm font-medium text-white/60">
                <span className="flex items-center gap-2">
                  <HugeiconsIcon
                    className="size-4 text-primary"
                    icon={FavouriteIcon}
                  />
                  1.2k
                </span>
                <span className="flex items-center gap-2">
                  <HugeiconsIcon
                    className="size-4 text-amber-400"
                    icon={StarIcon}
                  />
                  4.9
                </span>
                <span className="flex items-center gap-2">
                  <HugeiconsIcon
                    className="size-4 text-cyan-400"
                    icon={ViewIcon}
                  />
                  25k vistas
                </span>
              </div>
            </motion.div>
          </div>
        </Link>
      </motion.div>

      {/* Secondary Hero Cards */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        {secondary.map((post, idx) => (
          <motion.div
            className="flex-1 group relative overflow-hidden rounded-3xl border border-white/10 bg-black/40"
            initial={{ opacity: 0, x: 20 }}
            key={post.id}
            transition={{ delay: 0.1 * idx }}
            whileInView={{ opacity: 1, x: 0 }}
          >
            <Link
              className="block h-full w-full"
              params={{ id: post.id }}
              to="/post/$id"
            >
              {post.imageObjectKeys?.[0] ? (
                <img
                  alt={post.title}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                  src={getBucketUrl(post.imageObjectKeys[0])}
                />
              ) : (
                <div className="h-full w-full bg-linear-to-br from-secondary/20 via-black to-accent/20" />
              )}
              <div className="absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent" />
              <div className="absolute inset-0 p-6 flex flex-col justify-end">
                <h3 className="text-xl font-serif font-bold text-white mb-2 leading-tight">
                  {post.title}
                </h3>
                <div className="flex items-center gap-3 text-xs text-white/50">
                  <span className="flex items-center gap-1">
                    <HugeiconsIcon className="size-3" icon={StarIcon} />
                    {post.averageRating?.toFixed(1) ?? "5.0"}
                  </span>
                  <span>•</span>
                  <span>{post.type === "post" ? "Juego" : "Cómic"}</span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function GamesCarouselSection({ games }: { games: any[] }) {
  if (games.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-white/20">
        Cargando la matriz...
      </div>
    );
  }

  return (
    <div className="relative group">
      <div className="flex gap-6 overflow-x-auto pb-8 scrollbar-hide snap-x">
        {games.map((game, idx) => (
          <motion.div
            className="min-w-[280px] md:min-w-[320px] snap-start"
            initial={{ opacity: 0, y: 20 }}
            key={game.id}
            transition={{ delay: idx * 0.05 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <CyberCard post={game} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function CyberCard({ post }: { post: any }) {
  return (
    <Link
      className="group relative block aspect-video rounded-2xl overflow-hidden border border-white/5 bg-white/5"
      params={{ id: post.id }}
      to="/post/$id"
    >
      <div className="absolute inset-0 z-0">
        {post.imageObjectKeys?.[0] ? (
          <img
            alt={post.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 grayscale-[0.5] group-hover:grayscale-0"
            src={getBucketUrl(post.imageObjectKeys[0])}
          />
        ) : (
          <div className="h-full w-full bg-white/5" />
        )}
      </div>

      <div className="absolute inset-0 bg-linear-to-t from-black via-black/20 to-transparent opacity-80" />

      {/* Decorative Border */}
      <div className="absolute inset-0 border border-primary/0 group-hover:border-primary/50 transition-colors duration-300 rounded-2xl pointer-events-none" />

      <div className="absolute inset-0 p-4 flex flex-col justify-end">
        <div className="translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
          <h4 className="font-serif font-bold text-lg text-white mb-1">
            {post.title}
          </h4>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-[10px] text-white/50 uppercase tracking-widest font-black">
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-sm bg-white/10",
                  getTierColor(post.favorites)
                )}
              >
                {post.version ?? "V1.0"}
              </span>
              <span className="flex items-center gap-1">
                <HugeiconsIcon className="size-3" icon={FavouriteIcon} />
                {post.likes}
              </span>
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <HugeiconsIcon
                className="size-5 text-primary"
                icon={Home01Icon}
              />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function RecentPostsGrid() {
  const { data: recentPosts, isLoading } = useQuery({
    queryFn: () => orpcClient.post.getRecent({ limit: RECENT_POSTS_LIMIT }),
    queryKey: ["posts", "recent", RECENT_POSTS_LIMIT],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton className="aspect-video rounded-3xl" key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <AnimatePresence>
        {recentPosts?.map((post, idx) => (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            key={post.id}
            transition={{ delay: idx * 0.05 }}
            whileInView={{ opacity: 1, scale: 1 }}
          >
            <Link
              className="group flex gap-4 p-4 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all"
              params={{ id: post.id }}
              to="/post/$id"
            >
              <div className="size-24 shrink-0 rounded-2xl overflow-hidden border border-white/10">
                {post.imageObjectKeys?.[0] ? (
                  <img
                    alt={post.title}
                    className="h-full w-full object-cover group-hover:scale-110 transition-transform"
                    src={getBucketUrl(post.imageObjectKeys[0])}
                  />
                ) : (
                  <div className="h-full w-full bg-white/5" />
                )}
              </div>
              <div className="flex flex-col justify-center py-1">
                <h4 className="font-serif font-bold text-white group-hover:text-primary transition-colors line-clamp-1">
                  {post.title}
                </h4>
                <p className="text-xs text-white/40 mb-3 uppercase tracking-tighter">
                  Publicado hace 2 horas
                </p>
                <div className="flex items-center gap-4 text-xs text-white/60">
                  <span className="flex items-center gap-1">
                    <HugeiconsIcon className="size-3.5" icon={ViewIcon} />
                    {post.views}
                  </span>
                  <span className="flex items-center gap-1">
                    <HugeiconsIcon
                      className="size-3.5 text-red-500/80"
                      icon={FavouriteIcon}
                    />
                    {post.likes}
                  </span>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ActiveUsersList({ users }: { users: any[] }) {
  return (
    <div className="space-y-4">
      {users.slice(0, 8).map((user, idx) => (
        <motion.div
          className="group flex items-center gap-3 p-2 rounded-2xl hover:bg-white/5 transition-colors"
          initial={{ opacity: 0, x: 20 }}
          key={user.id}
          transition={{ delay: idx * 0.03 }}
          whileInView={{ opacity: 1, x: 0 }}
        >
          <div className="relative">
            <ProfileAvatar
              className="size-10 rounded-full border border-white/10 group-hover:border-primary/50 transition-colors"
              user={user}
            />
            <span className="absolute bottom-0 right-0 size-3 bg-green-500 border-2 border-[#050505] rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
          </div>
          <div className="flex-1 min-w-0">
            <UserLabel
              className="text-sm font-bold text-white/80 group-hover:text-white"
              user={user}
            />
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-black">
              Nivel 42 • Online
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function TagCloud() {
  const { data: terms } = useTerms();
  const tags =
    terms?.filter((term) => term.taxonomy === "tag").slice(0, 15) ?? [];

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag, idx) => (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          key={tag.id}
          transition={{ delay: idx * 0.02 }}
          whileInView={{ opacity: 1, scale: 1 }}
        >
          <Link preload={false} search={{ tag: [tag.id] }} to="/search">
            <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/5 text-xs text-white/60 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all cursor-pointer block">
              # {tag.name}
            </span>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 mt-24 bg-black/40 backdrop-blur-md">
      <div className="container mx-auto px-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="size-8 bg-white/10 rounded-lg flex items-center justify-center">
            <HugeiconsIcon
              className="size-5 text-white"
              icon={UserCircleIcon}
            />
          </div>
          <span className="font-serif font-black text-xl tracking-tighter text-white">
            NEXUS<span className="text-primary">TC</span>
          </span>
        </div>
        <p className="text-white/40 text-sm max-w-md mx-auto mb-8">
          La plataforma definitiva para el intercambio de experiencias
          digitales. Forjando el futuro del entretenimiento descentralizado.
        </p>
        <div className="flex justify-center gap-8 mb-8">
          {["Terminos", "Privacidad", "Soporte", "API"].map((item) => (
            <a
              className="text-xs uppercase tracking-widest font-black text-white/40 hover:text-primary transition-colors"
              href="#"
              key={item}
            >
              {item}
            </a>
          ))}
        </div>
        <div className="text-[10px] text-white/20 uppercase tracking-[0.4em] font-black">
          © 2026 NEXUSTC PROTOCOL • ALL RIGHTS RESERVED
        </div>
      </div>
    </footer>
  );
}
