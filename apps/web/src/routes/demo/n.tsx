// oxlint-disable

import { createFileRoute } from "@tanstack/react-router";
import {
  Search,
  User,
  Bell,
  ChevronRight,
  TrendingUp,
  Clock,
  Zap,
  Star,
  Terminal,
  Cpu,
  Share2,
} from "lucide-react";

export const Route = createFileRoute("/demo/n")({
  component: RouteComponent,
});

function RouteComponent() {
  const gridBg =
    'bg-[url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAyKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+")]';

  return (
    <div
      className={`min-h-screen bg-zinc-950 text-zinc-300 font-sans selection:bg-cyan-500/30 selection:text-cyan-100 ${gridBg}`}
    >
      <DarkTechHeader />

      <main className="max-w-7xl mx-auto px-6 py-8">
        <FeaturedPosts />

        <WeeklyCarousel />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 py-12">
          <div className="lg:col-span-2 space-y-8">
            <RecentGames />
          </div>
          <div className="space-y-8">
            <OnlineUsers />
            <PopularTags />
          </div>
        </div>
      </main>

      <DarkTechFooter />
    </div>
  );
}

// Common classes for the tech aesthetic
const glassPanel =
  "bg-zinc-900/60 backdrop-blur-md border border-zinc-800/80 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.5)] relative overflow-hidden";
const neonText =
  "text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500";
const neonBorder =
  "border border-cyan-500/30 hover:border-cyan-400/80 transition-colors duration-300";
const techFont = 'font-["Oxanium",system-ui,sans-serif]';
const gridBg =
  'bg-[url("data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSA0MCAwIEwgMCAwIDAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAyKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+")]';

export const DarkTechHeader = () => (
  <header
    className={`sticky top-0 z-50 ${glassPanel} border-b border-zinc-800/80 px-6 py-4`}
  >
    <div className="max-w-7xl mx-auto flex items-center justify-between">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2 group cursor-pointer">
          <div className="relative">
            <Cpu className="w-8 h-8 text-cyan-400" />
            <div className="absolute inset-0 bg-cyan-400 blur-md opacity-40 group-hover:opacity-80 transition-opacity" />
          </div>
          <span
            className={`${techFont} text-2xl font-bold tracking-wider text-white`}
          >
            NEXUS<span className="text-cyan-400">.</span>
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {["Games", "Comics", "News", "Community"].map((item) => (
            <a
              key={item}
              href="#"
              className={`px-4 py-2 rounded-md text-sm font-medium text-zinc-400 hover:text-cyan-300 hover:bg-zinc-800/50 transition-all ${techFont} uppercase tracking-wide`}
            >
              {item}
            </a>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden lg:flex items-center relative group">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 group-focus-within:text-cyan-400 transition-colors" />
          <input
            type="text"
            placeholder="Search database..."
            className={`bg-zinc-950 border border-zinc-800 rounded-sm py-1.5 pl-10 pr-4 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all w-64 ${techFont}`}
          />
        </div>

        <button className="p-2 text-zinc-400 hover:text-white relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
        </button>

        <div className="flex items-center gap-3 pl-4 border-l border-zinc-800">
          <div className="text-right hidden sm:block">
            <div className={`text-sm font-bold text-white ${techFont}`}>
              Player_One
            </div>
            <div className="text-xs text-cyan-500 font-mono">Lvl 42</div>
          </div>
          <div
            className={`w-10 h-10 rounded-sm bg-zinc-800 ${neonBorder} p-0.5 relative cursor-pointer group`}
          >
            <div className="absolute inset-0 bg-cyan-500/20 blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />
            <img
              src="https://api.dicebear.com/7.x/bottts/svg?seed=Player_One&backgroundColor=18181b"
              alt="Profile"
              className="w-full h-full object-cover rounded-sm relative z-10"
            />
          </div>
        </div>
      </div>
    </div>
  </header>
);

export const FeaturedPosts = () => (
  <section className="py-12 relative">
    <div className="flex items-center gap-3 mb-8">
      <Terminal className="w-5 h-5 text-cyan-400" />
      <h2
        className={`${techFont} text-2xl font-bold text-white uppercase tracking-wider`}
      >
        System_Highlights
      </h2>
      <div className="h-px bg-gradient-to-r from-zinc-800 to-transparent flex-1 ml-4" />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Main Feature */}
      <div
        className={`lg:col-span-8 group relative ${glassPanel} rounded-lg overflow-hidden cursor-pointer`}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 z-20" />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-900/60 to-transparent z-10" />

        <img
          src="https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop"
          alt="Cyberpunk Game"
          className="w-full h-[500px] object-cover group-hover:scale-105 transition-transform duration-700"
        />

        <div className="absolute bottom-0 left-0 p-8 z-20 w-full">
          <div className="flex items-center gap-3 mb-4">
            <span
              className={`px-2.5 py-1 bg-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-wider border border-cyan-500/30 rounded-sm ${techFont}`}
            >
              Review
            </span>
            <span className="text-zinc-400 text-sm flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5" /> 2h ago
            </span>
          </div>
          <h3
            className={`${techFont} text-4xl font-bold text-white mb-3 group-hover:text-cyan-300 transition-colors`}
          >
            NEON SYNDICATE: The Definitive Review
          </h3>
          <p className="text-zinc-300 line-clamp-2 max-w-2xl text-lg">
            Exploring the depths of the neon-soaked underworld in this year's
            most anticipated cyberpunk RPG. Is the hype justified?
          </p>
        </div>
      </div>

      {/* Secondary Features */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        <div
          className={`flex-1 group relative ${glassPanel} rounded-lg overflow-hidden cursor-pointer`}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent z-10" />
          <img
            src="https://images.unsplash.com/photo-1612036782180-6f0b6ce846ce?q=80&w=2070&auto=format&fit=crop"
            alt="Comic art"
            className="w-full h-full object-cover absolute inset-0 group-hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute bottom-0 left-0 p-6 z-20">
            <span
              className={`px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] font-bold uppercase tracking-wider border border-purple-500/30 rounded-sm mb-3 inline-block ${techFont}`}
            >
              Comic Release
            </span>
            <h3
              className={`${techFont} text-xl font-bold text-white group-hover:text-purple-300 transition-colors`}
            >
              Void Walkers Issue #42: Endgame
            </h3>
          </div>
        </div>

        <div
          className={`flex-1 group relative ${glassPanel} rounded-lg overflow-hidden cursor-pointer`}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent z-10" />
          <img
            src="https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=2070&auto=format&fit=crop"
            alt="Esports"
            className="w-full h-full object-cover absolute inset-0 group-hover:scale-105 transition-transform duration-700"
          />
          <div className="absolute bottom-0 left-0 p-6 z-20">
            <span
              className={`px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-wider border border-blue-500/30 rounded-sm mb-3 inline-block ${techFont}`}
            >
              Esports
            </span>
            <h3
              className={`${techFont} text-xl font-bold text-white group-hover:text-blue-300 transition-colors`}
            >
              Global Championship Finals: Tactics Breakdown
            </h3>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export const WeeklyCarousel = () => {
  const games = [
    {
      id: 1,
      title: "Quantum Protocol",
      genre: "Strategy",
      score: 9.2,
      image:
        "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800&auto=format&fit=crop",
    },
    {
      id: 2,
      title: "Stellar Drift",
      genre: "Racing",
      score: 8.8,
      image:
        "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop",
    },
    {
      id: 3,
      title: "Void Engine",
      genre: "RPG",
      score: 9.5,
      image:
        "https://images.unsplash.com/photo-1534423861386-85a16f5d13fd?q=80&w=800&auto=format&fit=crop",
    },
    {
      id: 4,
      title: "Neon Blade",
      genre: "Action",
      score: 8.4,
      image:
        "https://images.unsplash.com/photo-1605901309584-818e25960b8f?q=80&w=800&auto=format&fit=crop",
    },
  ];

  return (
    <section className="py-12">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-yellow-400" />
          <h2
            className={`${techFont} text-2xl font-bold text-white uppercase tracking-wider`}
          >
            Trending_Now
          </h2>
        </div>
        <div className="flex gap-2">
          <button className="w-8 h-8 flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-cyan-500 text-zinc-400 hover:text-cyan-400 transition-all rounded-sm rotate-180">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button className="w-8 h-8 flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-cyan-500 text-zinc-400 hover:text-cyan-400 transition-all rounded-sm">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {games.map((game) => (
          <div
            key={game.id}
            className={`group ${glassPanel} rounded-lg overflow-hidden border border-zinc-800 hover:border-cyan-500/50 transition-all duration-300`}
          >
            <div className="h-48 relative overflow-hidden">
              <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity z-10" />
              <img
                src={game.image}
                alt={game.title}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
              <div className="absolute top-2 right-2 bg-zinc-950/80 backdrop-blur border border-zinc-800 px-2 py-1 rounded-sm z-20 flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                <span className={`text-xs text-white font-bold ${techFont}`}>
                  {game.score}
                </span>
              </div>
            </div>
            <div className="p-4">
              <span className="text-[10px] text-cyan-500 uppercase font-mono tracking-wider">
                {game.genre}
              </span>
              <h3
                className={`${techFont} text-lg font-bold text-white mt-1 group-hover:text-cyan-400 transition-colors truncate`}
              >
                {game.title}
              </h3>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export const RecentGames = () => {
  const games = [
    { id: 1, title: "Cyber ProtocolX", platform: "PC, PS5", date: "Today" },
    {
      id: 2,
      title: "Mech Warrior: Uprising",
      platform: "Xbox, PC",
      date: "Yesterday",
    },
    { id: 3, title: "Data Runners", platform: "Switch, PC", date: "Mar 28" },
    {
      id: 4,
      title: "Neon Pulse: The Comic",
      platform: "Digital",
      date: "Mar 27",
    },
    { id: 5, title: "Synthetica", platform: "PS5, Xbox", date: "Mar 25" },
  ];

  return (
    <div className={`${glassPanel} rounded-lg p-6`}>
      <div className="flex items-center gap-3 mb-6">
        <Clock className="w-5 h-5 text-purple-400" />
        <h2
          className={`${techFont} text-xl font-bold text-white uppercase tracking-wider`}
        >
          Latest_Drops
        </h2>
      </div>

      <div className="flex flex-col gap-3">
        {games.map((game, i) => (
          <div
            key={game.id}
            className="flex items-center justify-between p-3 rounded-md bg-zinc-900/50 border border-zinc-800/50 hover:border-purple-500/30 hover:bg-zinc-800/50 transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-sm bg-zinc-950 flex items-center justify-center border border-zinc-800 font-mono text-xs text-zinc-500 group-hover:text-purple-400 group-hover:border-purple-500/50">
                0{i + 1}
              </div>
              <div>
                <h4
                  className={`${techFont} text-sm font-bold text-zinc-200 group-hover:text-white`}
                >
                  {game.title}
                </h4>
                <span className="text-xs text-zinc-500 font-mono">
                  {game.platform}
                </span>
              </div>
            </div>
            <span className="text-xs text-zinc-500 font-mono">{game.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const OnlineUsers = () => (
  <div className={`${glassPanel} rounded-lg p-6`}>
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <User className="w-5 h-5 text-green-400" />
        <h2
          className={`${techFont} text-xl font-bold text-white uppercase tracking-wider`}
        >
          Network_Status
        </h2>
      </div>
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <span className="text-xs text-green-400 font-mono">1,024 Online</span>
      </div>
    </div>

    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-4 gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="relative group cursor-pointer">
          <div
            className={`aspect-square rounded-sm bg-zinc-800 border border-zinc-700 overflow-hidden ${i % 3 === 0 ? `border-cyan-500/50` : ``}`}
          >
            <img
              src={`https://api.dicebear.com/7.x/bottts/svg?seed=user${i}&backgroundColor=18181b`}
              alt="User"
              className="w-full h-full object-cover group-hover:scale-110 transition-transform"
            />
          </div>
          <div className="absolute inset-0 bg-cyan-500/20 opacity-0 group-hover:opacity-100 transition-opacity rounded-sm pointer-events-none" />
        </div>
      ))}
    </div>
    <button className="w-full mt-4 py-2 bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 hover:text-white hover:border-zinc-600 font-mono uppercase tracking-wider transition-colors rounded-sm">
      View All Operatives
    </button>
  </div>
);

export const PopularTags = () => {
  const tags = [
    "Cyberpunk",
    "RPG",
    "Mecha",
    "Space Opera",
    "Indie",
    "Esports",
    "Visual Novel",
    "Retro",
    "Sci-Fi",
    "Dark Fantasy",
  ];

  return (
    <div className={`${glassPanel} rounded-lg p-6`}>
      <div className="flex items-center gap-3 mb-6">
        <TrendingUp className="w-5 h-5 text-blue-400" />
        <h2
          className={`${techFont} text-xl font-bold text-white uppercase tracking-wider`}
        >
          Data_Nodes
        </h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="px-3 py-1 bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs font-mono hover:text-cyan-400 hover:border-cyan-500/50 cursor-pointer transition-all rounded-sm"
          >
            #{tag}
          </span>
        ))}
      </div>
    </div>
  );
};

export const DarkTechFooter = () => (
  <footer className="mt-20 border-t border-zinc-800/80 bg-zinc-950 relative overflow-hidden">
    <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />

    <div className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-12 lg:gap-8">
        <div className="col-span-1 md:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-6">
            <Cpu className="w-6 h-6 text-cyan-400" />
            <span
              className={`${techFont} text-xl font-bold tracking-wider text-white`}
            >
              NEXUS<span className="text-cyan-400">.</span>
            </span>
          </div>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            The premier data hub for next-generation gaming, interactive comics,
            and digital culture. Uplink established 2026.
          </p>
          <div className="flex gap-4">
            {/* Social icons placeholders */}
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-sm bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-cyan-400 hover:border-cyan-500/50 cursor-pointer transition-colors"
              >
                <Share2 className="w-4 h-4" />
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4
            className={`${techFont} text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2`}
          >
            <span className="w-2 h-2 bg-cyan-500 rounded-sm" /> Directories
          </h4>
          <ul className="flex flex-col gap-3 text-sm text-zinc-400">
            {[
              "Games Database",
              "Comic Archives",
              "Review Databanks",
              "Hardware Specs",
            ].map((item) => (
              <li key={item}>
                <a
                  href="#"
                  className="hover:text-cyan-400 transition-colors font-mono"
                >
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4
            className={`${techFont} text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2`}
          >
            <span className="w-2 h-2 bg-purple-500 rounded-sm" /> Network
          </h4>
          <ul className="flex flex-col gap-3 text-sm text-zinc-400">
            {[
              "Operative Forums",
              "Leaderboards",
              "Tournaments",
              "Marketplace",
            ].map((item) => (
              <li key={item}>
                <a
                  href="#"
                  className="hover:text-purple-400 transition-colors font-mono"
                >
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4
            className={`${techFont} text-sm font-bold text-white uppercase tracking-wider mb-6 flex items-center gap-2`}
          >
            <span className="w-2 h-2 bg-blue-500 rounded-sm" /> Comms
          </h4>
          <p className="text-zinc-400 text-sm mb-4">
            Subscribe to the mainframe broadcast for critical updates.
          </p>
          <div className="flex">
            <input
              type="email"
              placeholder="Transmission ID..."
              className="bg-zinc-900 border border-zinc-800 rounded-l-sm py-2 px-3 text-sm text-zinc-200 focus:outline-none focus:border-cyan-500/50 w-full font-mono placeholder:text-zinc-600"
            />
            <button className="bg-cyan-500/10 border border-cyan-500/30 border-l-0 text-cyan-400 px-3 rounded-r-sm hover:bg-cyan-500/20 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-12 pt-8 border-t border-zinc-800/80 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-zinc-500 text-xs font-mono">
          © 2026 NEXUS PROTOCOL. ALL SYSTEMS NOMINAL.
        </p>
        <div className="flex gap-6 text-xs text-zinc-500 font-mono">
          <a href="#" className="hover:text-cyan-400 transition-colors">
            PRIVACY_POLICY
          </a>
          <a href="#" className="hover:text-cyan-400 transition-colors">
            TERMS_OF_SERVICE
          </a>
        </div>
      </div>
    </div>
  </footer>
);
