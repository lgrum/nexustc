// oxlint-disable

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/demo/j")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-cyan-500 selection:text-black font-sans relative overflow-x-hidden">
      {/* Abstract background grid & vignette */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(0,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.1)_1px,transparent_1px)] bg-[size:40px_40px]" />
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,#050505_100%)]" />

      <div className="relative z-10">
        <CyberHeader />

        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          {/* Glitchy Welcome Text */}
          <div className="mb-12 border-l-4 border-yellow-400 pl-6 py-3 bg-gradient-to-r from-yellow-400/10 to-transparent max-w-2xl shadow-[4px_0_0_0_transparent] hover:shadow-[8px_0_0_0_rgba(255,255,0,0.5)] transition-shadow duration-300">
            <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter text-white drop-shadow-[0_2px_4px_rgba(255,255,0,0.3)]">
              Welcome to the Grid, <span className="text-yellow-400">User</span>
              .
            </h1>
            <p className="text-gray-400 font-mono text-sm mt-2 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 bg-yellow-400 inline-block animate-pulse" />
              Transmission securely established.
            </p>
          </div>

          <FeaturedPosts />

          <WeeklyCarousel />

          <div className="flex flex-col lg:flex-row gap-12 mt-20">
            <RecentGames />
            <Sidebar />
          </div>
        </main>

        <CyberFooter />
      </div>
    </div>
  );
}

// Neon Noir / Cyber-Arcade Aesthetic Components
// Heavy borders, pure black backgrounds, neon accents (cyan/magenta/yellow), monospace mixed with sans.

export const CyberHeader = () => (
  <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-4 bg-black/90 backdrop-blur-md border-b-2 border-cyan-500 text-white shadow-[0_4px_20px_rgba(0,255,255,0.15)]">
    <div className="flex items-center gap-6">
      <div className="font-black text-3xl tracking-tighter uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-500 to-magenta-500 drop-shadow-[0_0_8px_rgba(0,255,255,0.8)]">
        NEON<span className="text-white">NEXUS</span>
      </div>
      <nav className="hidden md:flex gap-8 font-mono text-sm uppercase tracking-wider">
        <a
          href="#"
          className="text-cyan-400 hover:text-magenta-400 transition-colors hover:shadow-[0_2px_0_0_currentcolor]"
        >
          Games
        </a>
        <a
          href="#"
          className="text-gray-400 hover:text-cyan-400 transition-colors"
        >
          Comics
        </a>
        <a
          href="#"
          className="text-gray-400 hover:text-cyan-400 transition-colors"
        >
          Community
        </a>
        <a
          href="#"
          className="text-gray-400 hover:text-cyan-400 transition-colors"
        >
          Store
        </a>
      </nav>
    </div>
    <div className="flex items-center gap-4">
      <button className="hidden sm:block relative px-4 py-2 font-mono text-xs font-bold uppercase text-black bg-cyan-400 border-2 border-cyan-400 hover:bg-black hover:text-cyan-400 transition-all shadow-[4px_4px_0_0_rgba(255,0,255,0.8)] hover:translate-x-1 hover:translate-y-1 hover:shadow-none">
        Login
      </button>
      <div className="w-10 h-10 border-2 border-magenta-500 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden shadow-[0_0_10px_rgba(255,0,255,0.5)] cursor-pointer hover:scale-110 transition-transform">
        <img
          src="https://api.dicebear.com/7.x/bottts/svg?seed=neon&backgroundColor=1f2937"
          alt="Profile"
        />
      </div>
    </div>
  </header>
);

export const FeaturedPosts = () => (
  <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-16">
    {/* Main Post */}
    <div className="lg:col-span-2 group relative border-2 border-gray-800 hover:border-cyan-400 transition-colors overflow-hidden bg-black flex flex-col justify-end min-h-[450px] cursor-pointer">
      <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=1200&auto=format&fit=crop')] bg-cover bg-center opacity-40 group-hover:opacity-70 transition-opacity mix-blend-luminosity group-hover:mix-blend-normal duration-700 scale-100 group-hover:scale-105" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
      <div className="relative z-10 p-8 transform group-hover:-translate-y-2 transition-transform duration-500">
        <div className="flex gap-2 mb-4">
          <span className="px-2 py-1 bg-magenta-600 text-white font-mono text-xs uppercase font-bold tracking-widest shadow-[2px_2px_0_0_rgba(0,0,0,1)] border border-magenta-400">
            Review
          </span>
          <span className="px-2 py-1 border border-cyan-500 text-cyan-400 font-mono text-xs uppercase font-bold tracking-widest bg-black/50 shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
            Cyberpunk
          </span>
        </div>
        <h2 className="text-4xl md:text-5xl font-black text-white uppercase leading-none mb-4 group-hover:text-cyan-300 transition-colors drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          Night City Blues: The Definitive Cut
        </h2>
        <p className="text-gray-300 font-sans max-w-2xl text-lg border-l-2 border-magenta-500 pl-4 bg-black/40 backdrop-blur-sm py-1">
          A deep dive into the neon-soaked alleys of the year's most anticipated
          expansion. Does it live up to the hype, or is it just another glitch
          in the matrix?
        </p>
      </div>
    </div>

    {/* Secondary Posts */}
    <div className="flex flex-col gap-6">
      <div className="flex-1 group relative border-2 border-gray-800 hover:border-magenta-500 transition-colors overflow-hidden bg-black p-6 flex flex-col justify-end min-h-[200px] cursor-pointer">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?q=80&w=800&auto=format&fit=crop')] bg-cover bg-center opacity-30 group-hover:opacity-60 transition-opacity grayscale group-hover:grayscale-0 duration-500 scale-100 group-hover:scale-110" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        <div className="relative z-10 transform group-hover:-translate-y-1 transition-transform">
          <span className="px-2 py-1 bg-cyan-500 text-black font-mono text-xs uppercase font-bold tracking-widest mb-3 inline-block shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
            Comics
          </span>
          <h3 className="text-2xl font-black text-white uppercase leading-tight group-hover:text-magenta-400 transition-colors drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            Multiverse Collapses in Issue #42
          </h3>
        </div>
      </div>

      <div className="flex-1 group relative border-2 border-gray-800 hover:border-yellow-400 transition-colors overflow-hidden bg-black p-6 flex flex-col justify-end min-h-[200px] cursor-pointer">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=800&auto=format&fit=crop')] bg-cover bg-center opacity-30 group-hover:opacity-60 transition-opacity blur-[1px] group-hover:blur-none duration-500 scale-100 group-hover:scale-110" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        <div className="relative z-10 transform group-hover:-translate-y-1 transition-transform">
          <span className="px-2 py-1 bg-yellow-400 text-black font-mono text-xs uppercase font-bold tracking-widest mb-3 inline-block shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
            Esports
          </span>
          <h3 className="text-2xl font-black text-white uppercase leading-tight group-hover:text-yellow-400 transition-colors drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
            Neon Knights Secure Championship
          </h3>
        </div>
      </div>
    </div>
  </section>
);

export const SectionTitle = ({
  title,
  color = "cyan",
}: {
  title: string;
  color?: "cyan" | "magenta" | "yellow";
}) => {
  const colors = {
    cyan: "text-cyan-400 border-cyan-400 shadow-[4px_4px_0_0_rgba(0,255,255,0.4)]",
    magenta:
      "text-magenta-400 border-magenta-500 shadow-[4px_4px_0_0_rgba(255,0,255,0.4)]",
    yellow:
      "text-yellow-400 border-yellow-400 shadow-[4px_4px_0_0_rgba(255,255,0,0.4)]",
  };

  const bgColors = {
    cyan: "from-cyan-500/50",
    magenta: "from-magenta-500/50",
    yellow: "from-yellow-500/50",
  };

  return (
    <div className="flex items-center gap-4 mb-8">
      <h2
        className={`text-2xl font-black uppercase tracking-widest border-2 px-4 py-1 bg-black ${colors[color]}`}
      >
        {title}
      </h2>
      <div
        className={`h-0.5 flex-1 bg-gradient-to-r ${bgColors[color]} to-transparent`}
      />
    </div>
  );
};

export const WeeklyCarousel = () => {
  const games = [
    {
      title: "Neon Drifter",
      genre: "Racing",
      img: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=500&q=80",
    },
    {
      title: "Void Protocol",
      genre: "FPS",
      img: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=500&q=80",
    },
    {
      title: "Chrono Blade",
      genre: "Action RPG",
      img: "https://images.unsplash.com/photo-1605901309584-818e25960b8f?w=500&q=80",
    },
    {
      title: "Mecha Assault",
      genre: "Strategy",
      img: "https://images.unsplash.com/photo-1580234797602-22c37b4a6217?w=500&q=80",
    },
  ];

  return (
    <section className="mb-16">
      <SectionTitle title="Weekly Drops" color="magenta" />
      <div className="flex overflow-x-auto gap-6 pb-6 pt-2 snap-x hide-scrollbar scroll-smooth">
        {games.map((game, i) => (
          <div
            key={i}
            className="min-w-[280px] md:min-w-[320px] snap-center group cursor-pointer border-2 border-gray-800 hover:border-magenta-500 transition-all bg-black shrink-0 relative hover:-translate-y-2 hover:shadow-[8px_8px_0_0_rgba(255,0,255,0.4)] duration-300"
          >
            <div className="h-48 overflow-hidden relative border-b-2 border-transparent group-hover:border-magenta-500 transition-colors">
              <img
                src={game.img}
                alt={game.title}
                className="w-full h-full object-cover grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500 group-hover:scale-110"
              />
              <div className="absolute top-2 right-2 px-2 py-1 bg-black/80 border border-magenta-500 text-magenta-400 font-mono text-xs backdrop-blur-sm">
                NEW
              </div>
              <div className="absolute inset-0 bg-magenta-500/20 opacity-0 group-hover:opacity-100 mix-blend-overlay transition-opacity duration-300" />
            </div>
            <div className="p-4 bg-gray-950 group-hover:bg-black transition-colors">
              <h3 className="font-black text-xl text-white uppercase group-hover:text-magenta-400 tracking-tight">
                {game.title}
              </h3>
              <p className="text-gray-500 font-mono text-sm uppercase mt-1">
                {game.genre}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export const RecentGames = () => {
  const games = [
    { title: "Starfighter X", score: "9.5", type: "Review", date: "2H AGO" },
    { title: "Pixel Quest II", score: "8.0", type: "Review", date: "5H AGO" },
    {
      title: "Rogue AI: Awakening",
      score: "7.2",
      type: "Review",
      date: "8H AGO",
    },
    { title: "Shadow Ninja", score: "8.8", type: "Review", date: "1D AGO" },
    { title: "Cybernetic Drift", score: "9.1", type: "Review", date: "2D AGO" },
  ];

  return (
    <div className="flex-1">
      <SectionTitle title="Latest Intel" color="cyan" />
      <div className="flex flex-col gap-4">
        {games.map((game, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 border border-gray-800 hover:border-cyan-400 bg-gray-950 hover:bg-[#0a0a0a] transition-all group cursor-pointer shadow-sm hover:shadow-[4px_4px_0_0_rgba(0,255,255,0.3)] hover:-translate-y-1 duration-200"
          >
            <div className="w-14 h-14 flex flex-col items-center justify-center bg-black border-2 border-cyan-500 text-cyan-400 group-hover:bg-cyan-500 group-hover:text-black transition-colors shadow-[0_0_10px_rgba(0,255,255,0.2)] shrink-0">
              <span className="font-black text-xl leading-none">
                {game.score}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-white font-black text-lg uppercase group-hover:text-cyan-300 truncate">
                {game.title}
              </h4>
              <div className="flex gap-3 text-xs font-mono text-gray-500 mt-1">
                <span className="text-cyan-600 uppercase font-bold">
                  {game.type}
                </span>
                <span className="opacity-50">//</span>
                <span>{game.date}</span>
              </div>
            </div>
            <div className="text-gray-600 group-hover:text-cyan-400 transition-colors hidden sm:block">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="square"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Sidebar = () => {
  const users = [
    { name: "ZeroCool", status: "In Game", avatar: "1" },
    { name: "AcidBurn", status: "Online", avatar: "2" },
    { name: "CrashOverride", status: "Idle", avatar: "3" },
    { name: "LordNikon", status: "Reading", avatar: "4" },
    { name: "PhantomPhreak", status: "In Game", avatar: "5" },
  ];

  const tags = [
    "CYBERPUNK",
    "RPG",
    "INDIE",
    "MARVEL",
    "DC",
    "FPS",
    "RETRO",
    "VR",
    "MANGA",
    "ANIME",
  ];

  return (
    <aside className="w-full lg:w-80 flex flex-col gap-10 shrink-0">
      {/* Active Users */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
          </div>
          <h3 className="font-mono text-sm uppercase text-white font-bold tracking-widest">
            Network Status: <span className="text-green-400">Online</span>
          </h3>
        </div>

        <div className="bg-[#0a0a0a] border-2 border-gray-800 p-5 relative overflow-hidden group hover:border-green-500/50 transition-colors">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-green-500/10 to-transparent" />
          {/* Grid background for sidebar block */}
          <div className="absolute inset-0 z-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:10px_10px] pointer-events-none" />

          <div className="flex flex-col gap-4 relative z-10">
            {users.map((user, i) => (
              <div
                key={i}
                className="flex items-center gap-3 group/user cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-gray-700 group-hover/user:border-green-400 transition-colors bg-gray-900 shadow-inner">
                  <img
                    src={`https://api.dicebear.com/7.x/bottts/svg?seed=${user.avatar}&backgroundColor=000`}
                    alt={user.name}
                  />
                </div>
                <div className="flex-1 flex flex-col border-b border-gray-800 border-dashed pb-2 group-hover/user:border-green-500/50 transition-colors">
                  <span className="text-sm font-black text-gray-300 group-hover/user:text-white transition-colors tracking-wide">
                    {user.name}
                  </span>
                  <span
                    className={`text-xs font-mono font-bold mt-0.5 ${user.status === "In Game" ? "text-yellow-400" : user.status === "Online" ? "text-green-400" : "text-gray-500"}`}
                  >
                    {user.status === "In Game"
                      ? "▶ IN GAME"
                      : user.status === "Online"
                        ? "● ONLINE"
                        : "○ IDLE"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Popular Tags */}
      <div>
        <h3 className="font-mono text-sm uppercase text-gray-400 font-bold tracking-widest mb-4 flex items-center gap-2">
          <svg
            className="w-5 h-5 text-magenta-500 drop-shadow-[0_0_5px_rgba(255,0,255,0.5)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="square"
              strokeLinejoin="miter"
              strokeWidth="2"
              d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
            />
          </svg>
          Trending Nodes
        </h3>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, i) => (
            <span
              key={i}
              className="px-3 py-1.5 bg-[#0a0a0a] border-2 border-gray-800 text-gray-400 text-xs font-mono font-bold hover:text-magenta-400 hover:border-magenta-500 hover:bg-black transition-all cursor-pointer shadow-sm hover:shadow-[4px_4px_0_0_rgba(255,0,255,0.4)] hover:-translate-y-1 duration-200"
            >
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
};

export const CyberFooter = () => (
  <footer className="mt-24 border-t-4 border-cyan-500 bg-black pt-16 pb-8 relative overflow-hidden">
    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L3N2Zz4=')] [mask-image:linear-gradient(to_bottom,white,transparent)]" />
    {/* Scanline effect */}
    <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[size:100%_4px] pointer-events-none opacity-20 z-0" />

    <div className="max-w-7xl mx-auto px-6 relative z-10">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
        <div className="col-span-1 md:col-span-2">
          <div className="font-black text-4xl tracking-tighter uppercase text-white mb-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-cyan-400 inline-block shadow-[0_0_15px_rgba(0,255,255,0.6)] animate-pulse" />
            NEON<span className="text-cyan-400">NEXUS</span>
          </div>
          <p className="text-gray-400 font-sans max-w-sm mb-8 leading-relaxed">
            The ultimate terminal for high-voltage gaming news, cyberpunk
            culture, and digital comic releases. Jack in, connect, and survive.
          </p>
          <div className="flex gap-4">
            {["TW", "DS", "GH", "YT"].map((social, i) => (
              <a
                key={i}
                href="#"
                className="w-12 h-12 flex items-center justify-center border-2 border-gray-800 text-gray-400 hover:border-cyan-400 hover:text-cyan-400 font-mono text-sm font-bold bg-gray-900 hover:bg-black transition-all shadow-[2px_2px_0_0_transparent] hover:shadow-[4px_4px_0_0_rgba(0,255,255,0.4)] hover:-translate-y-1 duration-200"
              >
                {social}
              </a>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-white font-mono uppercase tracking-widest mb-6 border-l-4 border-magenta-500 pl-3 font-bold">
            Directory
          </h4>
          <ul className="flex flex-col gap-4 font-sans text-gray-400 font-bold">
            {["Reviews", "Previews", "Esports", "Hardware", "Comics"].map(
              (link, i) => (
                <li key={i}>
                  <a
                    href="#"
                    className="hover:text-magenta-400 hover:pl-2 transition-all before:content-['>'] before:mr-2 before:text-magenta-500 opacity-80 hover:opacity-100"
                  >
                    {link}
                  </a>
                </li>
              )
            )}
          </ul>
        </div>

        <div>
          <h4 className="text-white font-mono uppercase tracking-widest mb-6 border-l-4 border-yellow-400 pl-3 font-bold">
            System
          </h4>
          <ul className="flex flex-col gap-4 font-sans text-gray-400 font-bold">
            {["About Us", "Staff", "Advertise", "Privacy", "Terms"].map(
              (link, i) => (
                <li key={i}>
                  <a
                    href="#"
                    className="hover:text-yellow-400 hover:pl-2 transition-all before:content-['>'] before:mr-2 before:text-yellow-400 opacity-80 hover:opacity-100"
                  >
                    {link}
                  </a>
                </li>
              )
            )}
          </ul>
        </div>
      </div>

      <div className="border-t-2 border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-gray-500 font-mono text-xs font-bold tracking-widest">
          © 2026 NEONNEXUS CORP. // ALL RIGHTS RESERVED.
        </p>
        <div className="flex items-center gap-3 bg-gray-900 px-4 py-2 border border-gray-800">
          <div className="w-2 h-2 bg-red-500 animate-ping rounded-full" />
          <span className="text-red-500 font-mono text-xs uppercase tracking-widest font-bold">
            System Recalibrating...
          </span>
        </div>
      </div>
    </div>
  </footer>
);
