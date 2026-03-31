// oxlint-disable

import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Terminal,
  Menu,
  User,
  Zap,
  Users,
  Wifi,
  Hash,
  Star,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
} from "lucide-react";

export const Route = createFileRoute("/demo/m")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-screen bg-black text-white font-mono selection:bg-lime-400 selection:text-black">
      <TechHeader />
      <main className="container mx-auto p-4 md:p-8 space-y-16 mt-8">
        <TechFeaturedPosts />
        <TechWeeklyCarousel />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 space-y-16">
            <TechRecentGames />
          </div>
          <aside className="space-y-8">
            <TechOnlineUsers />
            <TechPopularTags />
          </aside>
        </div>
      </main>
      <TechFooter />
    </div>
  );
}

export function TechFeaturedPosts() {
  return (
    <section>
      <div className="flex justify-between items-end mb-6 border-b-4 border-white pb-2">
        <h2 className="text-4xl font-black uppercase tracking-tight">
          System.Featured_
        </h2>
        <span className="text-lime-400 animate-pulse font-bold">[LIVE]</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Post */}
        <div className="lg:col-span-8 border-4 border-white p-1 relative group cursor-pointer">
          <div className="absolute top-4 right-4 bg-fuchsia-500 text-black font-black px-3 py-1 border-2 border-black z-10 uppercase transform rotate-3 shadow-[4px_4px_0_black]">
            Must Read
          </div>
          <div className="bg-zinc-900 aspect-video relative overflow-hidden border-2 border-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-size-[20px_20px]" />
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-linear-to-t from-black via-black/80 to-transparent">
              <span className="bg-lime-400 text-black px-2 py-1 font-bold text-sm mb-3 inline-block uppercase">
                Comic Review
              </span>
              <h3 className="text-4xl md:text-5xl font-black uppercase leading-none mb-4 group-hover:text-lime-400 transition-colors">
                Cyberpunk: Edge of the Grid
              </h3>
              <p className="text-zinc-400 font-medium max-w-2xl text-lg">
                A deep dive into the latest issue of the dystopian masterpiece
                that's taking the dark net by storm.
              </p>
            </div>
          </div>
        </div>

        {/* Secondary Posts */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {[
            {
              tag: "Game Update",
              title: "Neon Drift v2.0 Patch Notes",
              color: "bg-cyan-400",
            },
            {
              tag: "Interview",
              title: "Dev Talk: Building the Metaverse",
              color: "bg-white",
            },
          ].map((post, i) => (
            <div
              key={i}
              className="border-4 border-white p-1 flex-1 flex flex-col group cursor-pointer shadow-[8px_8px_0_rgba(255,255,255,0.2)] hover:shadow-[8px_8px_0_rgba(163,230,53,1)] transition-shadow"
            >
              <div className="bg-zinc-900 flex-1 relative border-2 border-transparent group-hover:border-lime-400 transition-colors p-6 flex flex-col justify-end">
                <div className="absolute inset-0 opacity-20 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,#fff_10px,#fff_20px)]" />
                <div className="relative z-10">
                  <span
                    className={`${post.color} text-black px-2 py-1 font-bold text-xs mb-2 inline-block uppercase`}
                  >
                    {post.tag}
                  </span>
                  <h3 className="text-2xl font-black uppercase leading-tight mb-2">
                    {post.title}
                  </h3>
                  <div className="flex items-center gap-2 text-lime-400 font-bold uppercase text-sm group-hover:translate-x-2 transition-transform">
                    <span>Read Data</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function TechFooter() {
  return (
    <footer className="border-t-4 border-white mt-16 bg-black">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="bg-lime-400 p-1 border-2 border-transparent">
                <Terminal className="w-6 h-6 text-black" strokeWidth={3} />
              </div>
              <span className="text-2xl font-black tracking-tighter uppercase">
                Grid.Core
              </span>
            </div>
            <p className="text-zinc-400 font-mono font-bold max-w-sm">
              YOUR TERMINAL FOR UNDERGROUND GAMING AND DIGITAL COMICS.
              MAINTAINING THE SIGNAL SINCE 20XX.
            </p>
          </div>

          <div>
            <h4 className="text-lime-400 font-black uppercase mb-4 border-b-2 border-dashed border-zinc-600 pb-2">
              Index
            </h4>
            <ul className="space-y-2 font-bold uppercase">
              {["Games", "Comics", "Hardware", "Forums"].map((item) => (
                <li key={item}>
                  <a
                    href="#"
                    className='hover:text-lime-400 hover:underline decoration-2 underline-offset-4 flex items-center gap-2 before:content-[">"] before:text-zinc-600 hover:before:text-lime-400'
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-fuchsia-500 font-black uppercase mb-4 border-b-2 border-dashed border-zinc-600 pb-2">
              Network
            </h4>
            <ul className="space-y-2 font-bold uppercase">
              {["Discord", "Twitter", "Github", "Status"].map((item) => (
                <li key={item}>
                  <a
                    href="#"
                    className='hover:text-fuchsia-500 hover:underline decoration-2 underline-offset-4 flex items-center gap-2 before:content-[">"] before:text-zinc-600 hover:before:text-fuchsia-500'
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t-2 border-dashed border-zinc-800 text-center flex flex-col items-center gap-4">
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-4 h-4 border-2 border-zinc-800 bg-zinc-900"
              />
            ))}
          </div>
          <p className="text-zinc-600 font-mono font-bold text-sm">
            © {new Date().getFullYear()} GRID.CORE. ALL RIGHTS RESERVED. //
            SYSTEM V1.0.4
          </p>
        </div>
      </div>
    </footer>
  );
}

export function TechHeader() {
  return (
    <header className="border-b-4 border-white bg-black sticky top-0 z-50">
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="bg-lime-400 p-2 border-2 border-transparent group-hover:border-white transition-colors">
            <Zap className="w-8 h-8 text-black" strokeWidth={3} />
          </div>
          <span className="text-3xl font-black tracking-tighter uppercase">
            Grid.Core
          </span>
        </div>

        <nav className="hidden md:flex gap-8 border-x-4 border-white px-8 h-full items-center">
          {["Games", "Comics", "Community", "Store"].map((item) => (
            <a
              key={item}
              href="#"
              className="text-lg font-bold uppercase hover:text-lime-400 hover:underline decoration-4 underline-offset-4"
            >
              {item}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <button className="border-2 border-white p-2 hover:bg-white hover:text-black transition-colors">
            <Menu className="w-6 h-6" />
          </button>
          <button className="bg-lime-400 text-black px-4 py-2 font-bold uppercase border-2 border-lime-400 hover:bg-black hover:text-lime-400 transition-colors shadow-[4px_4px_0_white] active:shadow-none active:translate-x-1 active:translate-y-1">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5" />
              <span>Login</span>
            </div>
          </button>
        </div>
      </div>
    </header>
  );
}

export function TechOnlineUsers() {
  const users = [
    { name: "CyberNinja", level: 99, status: "playing" },
    { name: "NeonSamurai", level: 42, status: "idle" },
    { name: "GridHacker", level: 12, status: "playing" },
    { name: "VoidWalker", level: 87, status: "offline" },
    { name: "BitRunner", level: 56, status: "playing" },
  ];

  return (
    <div className="border-4 border-white p-6 relative">
      <div className="absolute -top-4 -right-4 bg-fuchsia-500 text-black border-2 border-white px-2 py-1 font-black text-sm flex items-center gap-2 shadow-[4px_4px_0_white]">
        <Wifi className="w-4 h-4 animate-pulse" />
        <span>1,337 ONLINE</span>
      </div>

      <div className="flex items-center gap-3 mb-6 border-b-2 border-dashed border-zinc-600 pb-4">
        <Users className="w-6 h-6 text-lime-400" />
        <h2 className="text-xl font-black uppercase">Active.Nodes</h2>
      </div>

      <div className="space-y-4">
        {users.map((user, i) => (
          <div
            key={i}
            className="flex items-center justify-between group cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 border-2 border-white bg-zinc-900 group-hover:bg-lime-400 transition-colors" />
                {user.status !== "offline" && (
                  <div
                    className={`absolute -bottom-1 -right-1 w-3 h-3 border-2 border-black ${user.status === `playing` ? `bg-lime-400` : `bg-yellow-400`}`}
                  />
                )}
              </div>
              <div>
                <div className="font-bold uppercase group-hover:text-lime-400 transition-colors">
                  {user.name}
                </div>
                <div className="text-xs text-zinc-500 font-mono">
                  LVL {user.level}
                </div>
              </div>
            </div>
            <div className="text-zinc-600 font-mono text-xs">
              [{user.status.toUpperCase()}]
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TechPopularTags() {
  const tags = [
    "CYBERPUNK",
    "RPG",
    "DARK_FANTASY",
    "MECHA",
    "RETRO",
    "GLITCH",
    "SYNTHWAVE",
    "HARDCORE",
  ];

  return (
    <div className="border-4 border-white p-6 bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.05)_10px,rgba(255,255,255,0.05)_20px)]">
      <div className="flex items-center gap-3 mb-6">
        <Hash className="w-6 h-6 text-fuchsia-500" />
        <h2 className="text-xl font-black uppercase">Trending_Hashes</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag, i) => (
          <a
            key={i}
            href="#"
            className="border-2 border-white px-2 py-1 text-sm font-bold hover:bg-white hover:text-black transition-colors shadow-[2px_2px_0_rgba(255,255,255,0.5)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5"
          >
            #{tag}
          </a>
        ))}
      </div>
    </div>
  );
}

export function TechRecentGames() {
  const games = Array.from({ length: 5 }).map((_, i) => ({
    id: `REQ-${1042 + i}`,
    title: `Project: Override ${i + 1}`,
    developer: `Studio ${String.fromCodePoint(65 + i)}`,
    status: i % 2 === 0 ? "VERIFIED" : "BETA",
    rating: (Math.random() * 2 + 3).toFixed(1),
  }));

  return (
    <section>
      <div className="flex items-center gap-3 mb-6 bg-lime-400 text-black p-2 border-2 border-white w-fit shadow-[4px_4px_0_white]">
        <Terminal className="w-6 h-6" />
        <h2 className="text-2xl font-black uppercase">Recent_Executables</h2>
      </div>

      <div className="flex flex-col gap-4">
        {games.map((game, i) => (
          <div
            key={i}
            className="border-2 border-white p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-white hover:text-black group transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-zinc-900 border-2 border-white group-hover:border-black group-hover:bg-zinc-200 transition-colors flex items-center justify-center font-bold text-xs">
                {game.id}
              </div>
              <div>
                <h3 className="text-2xl font-black uppercase">{game.title}</h3>
                <p className="font-mono text-zinc-400 group-hover:text-zinc-600 font-bold uppercase text-sm">
                  DEV: {game.developer}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6 w-full md:w-auto justify-between md:justify-end">
              <span
                className={`px-2 py-1 text-xs font-black uppercase border-2 ${game.status === `VERIFIED` ? `border-lime-400 text-lime-400 group-hover:border-black group-hover:text-black` : `border-fuchsia-500 text-fuchsia-500 group-hover:border-black group-hover:text-black`}`}
              >
                {game.status}
              </span>
              <div className="flex items-center gap-1 font-black text-xl">
                <span>{game.rating}</span>
                <Star className="w-5 h-5 fill-current" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button className="w-full mt-6 border-2 border-dashed border-zinc-600 p-4 font-bold uppercase text-zinc-400 hover:border-lime-400 hover:text-lime-400 transition-colors flex items-center justify-center gap-2">
        <span>Load More Data</span>
        <Terminal className="w-4 h-4" />
      </button>
    </section>
  );
}

export function TechWeeklyCarousel() {
  const games = [
    { name: "Void Runner", score: "9.5", genre: "Action" },
    { name: "Syntax Error", score: "8.8", genre: "Puzzle" },
    { name: "Null Pointer", score: "9.1", genre: "RPG" },
    { name: "Kernel Panic", score: "7.9", genre: "Strategy" },
  ];

  return (
    <section className="bg-white text-black p-8 border-4 border-black shadow-[8px_8px_0_#a3e635]">
      <div className="flex justify-between items-center mb-8 border-b-4 border-black pb-4">
        <div className="flex items-center gap-4">
          <Gamepad2 className="w-10 h-10" />
          <h2 className="text-4xl font-black uppercase">Weekly.Drops_</h2>
        </div>
        <div className="flex gap-2">
          <button className="border-4 border-black p-2 hover:bg-black hover:text-white transition-colors">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button className="border-4 border-black p-2 hover:bg-black hover:text-white transition-colors">
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {games.map((game, i) => (
          <div
            key={i}
            className="border-4 border-black bg-zinc-100 p-4 relative group cursor-pointer hover:-translate-y-2 hover:shadow-[4px_4px_0_black] transition-all"
          >
            <div className="absolute top-0 right-0 bg-black text-white px-2 py-1 font-black border-b-4 border-l-4 border-black">
              {game.score}
            </div>
            <div className="aspect-square bg-zinc-300 border-2 border-black mb-4 flex items-center justify-center">
              <span className="text-zinc-500 font-bold uppercase tracking-widest text-sm">
                [IMG_MISSING]
              </span>
            </div>
            <h3 className="font-black text-xl uppercase mb-1 truncate">
              {game.name}
            </h3>
            <p className="text-sm font-bold text-zinc-600 uppercase border-t-2 border-dashed border-zinc-400 pt-2">
              {game.genre}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
