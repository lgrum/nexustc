// oxlint-disable react/jsx-no-comment-textnodes
import {
  FavouriteIcon,
  Login03Icon,
  StarIcon,
  ViewIcon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Facehash } from "facehash";

import {
  AuthDialog,
  AuthDialogContent,
  AuthDialogTrigger,
} from "@/components/auth/auth-dialog";
import { useTerms } from "@/hooks/use-terms";
import { authClient } from "@/lib/auth-client";
import { orpcClient, safeOrpcClient } from "@/lib/orpc";
import { defaultFacehashProps, getBucketUrl } from "@/lib/utils";

const RECENT_POSTS_LIMIT = 12;

export const Route = createFileRoute("/demo/a")({
  component: DemoComponent,
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

function DemoComponent() {
  return (
    <div className="min-h-screen bg-[#020202] text-zinc-100 font-mono selection:bg-[#ccff00] selection:text-black overflow-x-hidden">
      {/* Brutalist Header Marquee */}
      <div className="w-full border-b-2 border-white/10 bg-[#ccff00] text-black py-2 overflow-hidden flex whitespace-nowrap">
        <div className="animate-[marquee_20s_linear_infinite] font-bold uppercase tracking-widest text-sm flex gap-8">
          <span>/// SYSTEM_ONLINE ///</span>
          <span>NEXUSTC PROTOCOL V2.0</span>
          <span>EXPLORE NEW REALITIES</span>
          <span>/// SYSTEM_ONLINE ///</span>
          <span>NEXUSTC PROTOCOL V2.0</span>
          <span>EXPLORE NEW REALITIES</span>
          <span>/// SYSTEM_ONLINE ///</span>
          <span>NEXUSTC PROTOCOL V2.0</span>
          <span>EXPLORE NEW REALITIES</span>
          <span>/// SYSTEM_ONLINE ///</span>
        </div>
      </div>

      <div className="max-w-400 mx-auto p-4 md:p-8 space-y-12">
        {/* Top Navbar Area */}
        <header className="flex justify-between items-end border-b-4 border-white/10 pb-6">
          <div className="space-y-2">
            <h1
              className="text-6xl md:text-8xl font-[Lexend] font-black tracking-tighter leading-none text-transparent bg-clip-text bg-linear-to-r from-white via-zinc-400 to-zinc-600 uppercase"
              style={{ WebkitTextStroke: "1px rgba(255,255,255,0.1)" }}
            >
              NeXus
              <span
                className="text-[#ccff00]"
                style={{ WebkitTextStroke: "0px" }}
              >
                TC
              </span>
            </h1>
            <p className="text-zinc-500 font-mono text-sm tracking-widest uppercase">
              Curated Interactive Entertainment
            </p>
          </div>
          <div className="hidden md:block">
            <AuthAction />
          </div>
        </header>

        {/* Mobile Auth */}
        <div className="block md:hidden">
          <AuthAction />
        </div>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column - Heavy Content */}
          <div className="lg:col-span-8 space-y-12">
            <FeaturedSection />
            <WeeklySection />
            <RecentPostsGrid />
          </div>

          {/* Right Column - Sidebar elements */}
          <div className="lg:col-span-4 space-y-8">
            <TagsBrutalist />
            <ActiveUsersBrutalist />
          </div>
        </div>
      </div>

      <style
        // oxlint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .brutalist-shadow {
          box-shadow: 6px 6px 0px 0px rgba(255, 255, 255, 0.1);
          transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        .brutalist-shadow:hover {
          box-shadow: 12px 12px 0px 0px #ccff00;
          transform: translate(-4px, -4px);
          border-color: #ccff00;
        }
        .brutalist-shadow-pink:hover {
          box-shadow: 12px 12px 0px 0px #ff007f;
          transform: translate(-4px, -4px);
          border-color: #ff007f;
        }
        .brutalist-shadow-cyan:hover {
          box-shadow: 12px 12px 0px 0px #00f0ff;
          transform: translate(-4px, -4px);
          border-color: #00f0ff;
        }
        .glitch-hover:hover {
          animation: glitch-skew 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94) both infinite;
        }
        @keyframes glitch-skew {
          0% { transform: skew(0deg); }
          20% { transform: skew(-10deg); }
          40% { transform: skew(10deg); }
          60% { transform: skew(-5deg); }
          80% { transform: skew(5deg); }
          100% { transform: skew(0deg); }
        }
      `,
        }}
      />
    </div>
  );
}

function FeaturedSection() {
  const { featuredPosts } = Route.useLoaderData();

  if (
    featuredPosts.error ||
    !featuredPosts.data ||
    featuredPosts.data.length === 0
  ) {
    return (
      <div className="h-96 border-4 border-dashed border-zinc-800 flex items-center justify-center text-zinc-500 font-mono">
        NO DATA_FOUND
      </div>
    );
  }

  const posts = featuredPosts.data;
  const main = posts.find((p) => p.position === "main") || posts[0];
  const secondary = posts.filter((p) => p.position === "secondary").slice(0, 2);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-2xl font-[Lexend] font-bold uppercase tracking-tight text-white">
          Featured_Protocol
        </h2>
        <div className="h-0.5 grow bg-zinc-800 relative overflow-hidden">
          <div className="absolute top-0 left-0 h-full w-1/3 bg-[#ccff00]" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {main && (
          <Link
            to="/post/$id"
            params={{ id: main.id }}
            className="md:col-span-2 brutalist-shadow border-2 border-white/20 bg-zinc-900 group relative block overflow-hidden aspect-video md:aspect-auto md:h-125"
          >
            {main.imageObjectKeys?.[0] ? (
              <img
                src={getBucketUrl(main.imageObjectKeys[0])}
                alt={main.title}
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700 grayscale group-hover:grayscale-0"
              />
            ) : (
              <div className="w-full h-full bg-zinc-800" />
            )}

            <div className="absolute inset-0 bg-linear-to-t from-[#020202] via-[#020202]/60 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 p-6 md:p-8 flex flex-col items-start gap-4">
              <span className="bg-[#ccff00] text-black px-3 py-1 text-xs font-bold uppercase tracking-widest">
                Main_Feature
              </span>
              <h3 className="text-4xl md:text-5xl font-[Lexend] font-black text-white leading-none uppercase group-hover:text-[#ccff00] transition-colors">
                {main.title}
              </h3>

              <div className="flex gap-6 text-zinc-300 font-mono text-sm border border-white/20 px-4 py-2 bg-black/50 backdrop-blur-md">
                <span className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={FavouriteIcon}
                    className="size-4 text-[#ff007f]"
                  />{" "}
                  {main.likes || 0}
                </span>
                <span className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={StarIcon}
                    className="size-4 text-[#ccff00]"
                  />{" "}
                  {main.averageRating?.toFixed(1) || "N/A"}
                </span>
                <span className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={ViewIcon}
                    className="size-4 text-[#00f0ff]"
                  />{" "}
                  {main.views || 0}
                </span>
              </div>
            </div>
          </Link>
        )}

        <div className="flex flex-col gap-6">
          {secondary.map((post, i) => (
            <Link
              key={post.id}
              to="/post/$id"
              params={{ id: post.id }}
              className={`flex-1 brutalist-shadow border-2 border-white/20 bg-zinc-900 group relative overflow-hidden flex flex-col ${i === 1 ? `brutalist-shadow-cyan` : `brutalist-shadow-pink`}`}
            >
              <div className="h-48 relative overflow-hidden">
                {post.imageObjectKeys?.[0] && (
                  <img
                    src={getBucketUrl(post.imageObjectKeys[0])}
                    alt={post.title}
                    className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-transform duration-500 mix-blend-luminosity group-hover:mix-blend-normal"
                  />
                )}
                <div className="absolute top-2 right-2 bg-black text-white border border-white/20 px-2 py-1 text-xs font-mono">
                  {post.version || "v1.0"}
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between bg-[#0a0a0a] border-t-2 border-white/20">
                <h4 className="text-xl font-[Lexend] font-bold text-white uppercase line-clamp-2">
                  {post.title}
                </h4>
                <div className="flex justify-between items-center mt-4 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <HugeiconsIcon icon={FavouriteIcon} className="size-3" />{" "}
                    {post.likes}
                  </span>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    className="size-5 text-white group-hover:translate-x-1 transition-transform"
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function WeeklySection() {
  const { weeklyGames } = Route.useLoaderData();
  const games = weeklyGames.data ?? [];

  if (games.length === 0) {
    return null;
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between border-b-2 border-white/20 pb-2">
        <h2 className="text-2xl font-[Lexend] font-bold uppercase tracking-tight text-[#00f0ff]">
          Weekly_Drops
        </h2>
        <span className="text-xs font-mono text-zinc-500">
          [{games.length} DETECTED]
        </span>
      </div>

      <div
        className="flex overflow-x-auto gap-6 pb-8 snap-x snap-mandatory hide-scrollbar"
        style={{ scrollbarWidth: "none" }}
      >
        {games.map((game) => (
          <Link
            key={game.id}
            to="/post/$id"
            params={{ id: game.id }}
            className="snap-start shrink-0 w-70 group border border-zinc-800 bg-[#050505] hover:border-[#00f0ff] transition-colors relative"
          >
            {/* Neon accent line */}
            <div className="absolute -left-px top-4 bottom-4 w-0.5 bg-transparent group-hover:bg-[#00f0ff] transition-colors" />

            <div className="aspect-4/5 overflow-hidden p-2">
              <div className="w-full h-full relative bg-zinc-900">
                {game.imageObjectKeys?.[0] && (
                  <img
                    src={getBucketUrl(game.imageObjectKeys[0])}
                    alt={game.title}
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                  />
                )}
                <div className="absolute inset-0 bg-linear-to-t from-[#050505] to-transparent" />
              </div>
            </div>

            <div className="p-4 pt-0">
              <h4 className="font-[Lexend] font-bold text-lg text-white truncate">
                {game.title}
              </h4>
              <p className="text-xs text-zinc-500 mt-1 font-mono">
                {game.type.toUpperCase()}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function RecentPostsGrid() {
  const {
    data: recentPosts,
    isLoading,
    isError,
  } = useQuery({
    queryFn: () => orpcClient.post.getRecent({ limit: RECENT_POSTS_LIMIT }),
    queryKey: ["posts", "recent", RECENT_POSTS_LIMIT],
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between border-b-2 border-zinc-800 pb-2">
        <h2 className="text-2xl font-[Lexend] font-bold uppercase tracking-tight text-white">
          Latest_Logs
        </h2>
      </div>

      {isLoading && (
        <div className="text-[#ccff00] animate-pulse font-mono">
          LOADING_DATABANKS...
        </div>
      )}
      {isError && (
        <div className="text-[#ff007f] font-mono">ERROR_FETCHING_LOGS</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-1 px-1 py-1 bg-zinc-800">
        {recentPosts?.map((post) => (
          <Link
            key={post.id}
            to="/post/$id"
            params={{ id: post.id }}
            className="group relative aspect-square bg-[#0a0a0a] overflow-hidden block"
          >
            {post.imageObjectKeys?.[0] && (
              <img
                src={getBucketUrl(post.imageObjectKeys[0])}
                alt={post.title}
                className="w-full h-full object-cover opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500"
              />
            )}

            {/* Overlay Grid lines for style */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-size-[20px_20px] pointer-events-none" />

            <div className="absolute inset-0 flex flex-col justify-end p-4 bg-linear-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <h4 className="font-bold text-white text-sm line-clamp-2 uppercase">
                {post.title}
              </h4>
              <div className="flex gap-3 text-[#ccff00] text-xs font-mono mt-2">
                <span className="flex items-center gap-1">
                  <HugeiconsIcon icon={FavouriteIcon} className="size-3" />{" "}
                  {post.likes}
                </span>
                <span className="flex items-center gap-1">
                  <HugeiconsIcon icon={ViewIcon} className="size-3" />{" "}
                  {post.views}
                </span>
              </div>
            </div>

            <div className="absolute top-2 left-2 text-[10px] font-mono text-zinc-600 group-hover:text-white transition-colors">
              ID:{post.id.slice(0, 4)}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TagsBrutalist() {
  const { data: terms } = useTerms();
  const tags = terms?.filter((term) => term.taxonomy === "tag") ?? [];

  return (
    <section className="border-2 border-white/20 p-6 bg-zinc-900 brutalist-shadow-pink">
      <h3 className="text-xl font-[Lexend] font-bold uppercase mb-6 text-[#ff007f] flex items-center gap-2">
        <span className="w-3 h-3 bg-[#ff007f] block" />
        Popular_Tags
      </h3>
      <div className="flex flex-wrap gap-2">
        {tags.slice(0, 20).map((tag) => (
          <Link
            key={tag.id}
            to="/search"
            search={{ tag: [tag.id] }}
            className="border border-white/10 px-3 py-1 text-xs font-mono text-zinc-400 hover:text-black hover:bg-[#ff007f] hover:border-[#ff007f] transition-colors uppercase"
          >
            #{tag.name}
          </Link>
        ))}
      </div>
    </section>
  );
}

function ActiveUsersBrutalist() {
  const { recentUsers } = Route.useLoaderData();
  const users = recentUsers.data ?? [];

  return (
    <section className="border-2 border-white/20 p-6 bg-zinc-900 brutalist-shadow-cyan">
      <h3 className="text-xl font-[Lexend] font-bold uppercase mb-6 text-[#00f0ff] flex items-center gap-2">
        <span className="w-3 h-3 bg-[#00f0ff] animate-pulse block" />
        Active_Agents
      </h3>
      <div className="space-y-3">
        {users.slice(0, 8).map((user, index) => (
          <Link
            key={user.id}
            to="/user/$id"
            params={{ id: user.id }}
            className="flex items-center gap-4 p-2 hover:bg-white/5 transition-colors group"
          >
            <div className="text-xs font-mono text-zinc-600 w-4 group-hover:text-[#00f0ff]">
              0{index + 1}
            </div>
            <div className="w-10 h-10 border border-white/20 relative overflow-hidden bg-black filter grayscale group-hover:grayscale-0 transition-all">
              {user.image ? (
                <img
                  src={getBucketUrl(user.image)}
                  alt={user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Facehash
                  name={user.name}
                  className="w-full h-full"
                  {...defaultFacehashProps}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white uppercase truncate group-hover:text-[#00f0ff] transition-colors">
                {user.name}
              </div>
              <div className="text-xs text-zinc-500 font-mono truncate">
                SYS_ID: {user.id.slice(0, 6)}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function AuthAction() {
  const auth = authClient.useSession();
  const user = auth.data?.user;

  if (auth.isPending) {
    return (
      <div className="w-40 h-12 bg-zinc-800 animate-pulse border-2 border-zinc-700" />
    );
  }

  if (user) {
    return (
      <Link
        to="/profile"
        className="flex items-center gap-4 border-2 border-white/20 bg-black p-2 pr-6 hover:border-[#ccff00] transition-colors group"
      >
        <div className="w-10 h-10 bg-zinc-800 border border-white/20 overflow-hidden filter grayscale group-hover:grayscale-0 transition-all">
          {user.image ? (
            <img
              src={getBucketUrl(user.image)}
              alt={user.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Facehash
              name={user.name}
              className="w-full h-full"
              {...defaultFacehashProps}
            />
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-[#ccff00] uppercase font-mono tracking-wider">
            {user.name}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono uppercase">
            Access_Granted
          </span>
        </div>
      </Link>
    );
  }

  return (
    <AuthDialog>
      <AuthDialogTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-4 border-2 border-[#ccff00] bg-[#ccff00]/10 p-2 pr-6 hover:bg-[#ccff00] hover:text-black transition-colors group cursor-pointer text-[#ccff00]"
          />
        }
      >
        <div className="w-10 h-10 border border-current flex items-center justify-center bg-black group-hover:bg-transparent">
          <HugeiconsIcon icon={Login03Icon} className="size-5" />
        </div>
        <div className="flex flex-col text-left">
          <span className="text-sm font-bold uppercase font-mono tracking-wider">
            Initialize
          </span>
          <span className="text-[10px] opacity-70 font-mono uppercase">
            Login_Protocol
          </span>
        </div>
      </AuthDialogTrigger>
      <AuthDialogContent />
    </AuthDialog>
  );
}
