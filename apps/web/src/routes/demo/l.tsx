// oxlint-disable

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/demo/l")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-screen bg-[#050505] text-zinc-300 selection:bg-cyan-400 selection:text-black overflow-x-hidden antialiased">
      <CyberHeader />
      <main>
        <CyberFeatured />
        <CyberWeeklyCarousel />
        <CyberRecentGames />
        <CyberRecentUsers />
        <CyberPopularTags />
      </main>
      <CyberFooter />
    </div>
  );
}
const containerClass = "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8";
const sectionClass = "py-16 border-b-4 border-zinc-900";
const headingClass =
  "text-4xl md:text-5xl font-black uppercase tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-pink-600 mb-10 font-mono";
const cardClass =
  "bg-zinc-950 border-2 border-zinc-800 p-4 hover:border-cyan-400 transition-all duration-300 relative group overflow-hidden";

export const CyberHeader = () => (
  <header className="border-b-4 border-pink-600 bg-black sticky top-0 z-50">
    <div className={`${containerClass} flex justify-between items-center py-4`}>
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-cyan-400 text-black font-black flex items-center justify-center text-2xl rotate-3 font-mono border-2 border-white group-hover:rotate-0 transition-transform">
          NX
        </div>
        <h1 className="text-3xl font-black text-white tracking-widest uppercase font-mono">
          Neo<span className="text-pink-600">Nexus</span>
        </h1>
      </div>
      <nav className="hidden lg:flex gap-10 font-mono uppercase text-sm font-bold tracking-widest">
        <a
          href="#"
          className="text-zinc-400 hover:text-cyan-400 hover:scale-110 transition-all block"
        >
          Games
        </a>
        <a
          href="#"
          className="text-zinc-400 hover:text-pink-600 hover:scale-110 transition-all block"
        >
          Comics
        </a>
        <a
          href="#"
          className="text-zinc-400 hover:text-green-400 hover:scale-110 transition-all block"
        >
          Community
        </a>
        <a
          href="#"
          className="text-zinc-400 hover:text-yellow-400 hover:scale-110 transition-all block"
        >
          Vault
        </a>
      </nav>
      <div className="flex items-center gap-4">
        <div className="hidden sm:block text-right font-mono">
          <div className="text-[10px] text-green-400 tracking-widest">
            SYS_STATUS: ONLINE
          </div>
          <div className="text-sm font-bold text-white uppercase">USR_0X8F</div>
        </div>
        <div className="w-12 h-12 border-2 border-cyan-400 bg-zinc-900 relative group overflow-hidden cursor-pointer">
          <div className="absolute inset-0 bg-cyan-400/20 group-hover:bg-transparent transition-colors z-10" />
          <img
            src="https://api.dicebear.com/7.x/bottts/svg?seed=cyber"
            alt="avatar"
            className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:scale-110 transition-all duration-500"
          />
        </div>
      </div>
    </div>
  </header>
);

export const CyberFeatured = () => (
  <section className={sectionClass}>
    <div className={containerClass}>
      <h2 className={headingClass}>// Top_Directives</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Featured */}
        <div className="lg:col-span-2 relative group overflow-hidden border-4 border-cyan-400 bg-zinc-950 min-h-[500px] flex flex-col justify-end p-8 md:p-12">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-40 group-hover:opacity-70 group-hover:scale-105 transition-all duration-700" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
          <div className="relative z-10">
            <span className="inline-block px-4 py-1.5 bg-pink-600 text-black font-black uppercase text-xs mb-6 font-mono tracking-widest">
              Main Override
            </span>
            <h3 className="text-5xl md:text-6xl font-black text-white uppercase tracking-tighter mb-4 font-mono leading-none drop-shadow-[0_0_15px_rgba(0,255,255,0.5)]">
              Cyber_Syndicate:
              <br />
              The Awakening
            </h3>
            <p className="text-zinc-400 font-mono mb-8 max-w-xl text-sm md:text-base leading-relaxed">
              In a world where data is flesh, the syndicate rises. Experience
              the definitive interactive comic event of the year.
            </p>
            <button className="border-2 border-cyan-400 bg-black/50 backdrop-blur-sm text-cyan-400 px-8 py-4 font-black uppercase tracking-widest hover:bg-cyan-400 hover:text-black transition-all duration-300 font-mono text-sm shadow-[4px_4px_0px_rgba(0,255,255,1)] hover:shadow-[0px_0px_0px_rgba(0,255,255,1)] hover:translate-x-1 hover:translate-y-1">
              Execute_Run
            </button>
          </div>
          {/* Decorative Corner Elements */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white" />
        </div>

        {/* Secondary Featured */}
        <div className="flex flex-col gap-8">
          <div
            className={`${cardClass} flex-1 flex flex-col justify-end p-8 min-h-[240px]`}
          >
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center opacity-30 group-hover:opacity-60 transition-opacity duration-500" />
            <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
            <div className="relative z-10">
              <span className="inline-block px-3 py-1 bg-green-500 text-black font-black uppercase text-[10px] mb-3 font-mono tracking-wider">
                Sector_7
              </span>
              <h3 className="text-2xl font-black text-white uppercase font-mono tracking-tight leading-none">
                Neon Drift
                <br />
                Racing
              </h3>
            </div>
          </div>
          <div
            className={`${cardClass} flex-1 flex flex-col justify-end p-8 min-h-[240px]`}
          >
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1614729939124-032f0b56c9ce?q=80&w=1974&auto=format&fit=crop')] bg-cover bg-center opacity-30 group-hover:opacity-60 transition-opacity duration-500" />
            <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
            <div className="relative z-10">
              <span className="inline-block px-3 py-1 bg-yellow-400 text-black font-black uppercase text-[10px] mb-3 font-mono tracking-wider">
                Issue_42
              </span>
              <h3 className="text-2xl font-black text-white uppercase font-mono tracking-tight leading-none">
                Mecha-Soul
                <br />
                Issue #42
              </h3>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export const CyberWeeklyCarousel = () => (
  <section className={`${sectionClass} bg-zinc-950 overflow-hidden relative`}>
    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-pink-600 to-transparent" />
    <div className={containerClass}>
      <div className="flex justify-between items-end mb-10">
        <h2 className={headingClass} style={{ marginBottom: 0 }}>
          // Cycle_Rotations
        </h2>
        <div className="font-mono text-pink-600 text-sm flex gap-3">
          <button className="border-2 border-pink-600 px-4 py-2 font-black hover:bg-pink-600 hover:text-black transition-colors">
            &lt; PREV
          </button>
          <button className="border-2 border-pink-600 px-4 py-2 font-black hover:bg-pink-600 hover:text-black transition-colors">
            NEXT &gt;
          </button>
        </div>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-8 snap-x no-scrollbar">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="min-w-[300px] md:min-w-[360px] shrink-0 border-2 border-zinc-800 bg-black p-5 snap-start group hover:border-pink-600 transition-colors cursor-pointer"
          >
            <div className="h-48 bg-zinc-900 mb-5 relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700"
                style={{
                  backgroundImage: `url(https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=400&auto=format&fit=crop&sig=${i})`,
                  backgroundSize: "cover",
                }}
              />
              <div className="absolute top-3 right-3 bg-black text-pink-600 border-2 border-pink-600 text-xs px-2 py-1 font-mono font-black shadow-[2px_2px_0px_rgba(219,39,119,1)]">
                WK_{i}
              </div>
            </div>
            <h4 className="font-mono text-xl font-black text-white uppercase mb-2 truncate group-hover:text-pink-600 transition-colors">
              Protocol_Zero {i}
            </h4>
            <div className="flex justify-between items-center text-xs font-mono font-bold">
              <span className="text-zinc-500 uppercase">RPG / Action</span>
              <span className="text-cyan-400">98.4% MATCH</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export const CyberRecentGames = () => (
  <section className={sectionClass}>
    <div className={containerClass}>
      <h2 className={headingClass}>// Recent_Uploads</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            className="group border-2 border-zinc-800 bg-black hover:border-green-400 p-4 flex flex-col gap-4 transition-colors cursor-pointer relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-8 h-8 bg-zinc-900/50 flex items-center justify-center font-mono text-[10px] text-zinc-500 z-10 group-hover:text-green-400 group-hover:bg-black transition-colors">
              {i.toString().padStart(2, "0")}
            </div>
            <div className="aspect-video bg-zinc-900 relative overflow-hidden border border-zinc-800 group-hover:border-green-400/50">
              <div
                className="absolute inset-0 opacity-40 group-hover:opacity-80 group-hover:scale-105 transition-all duration-500"
                style={{
                  backgroundImage: `url(https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=300&auto=format&fit=crop&sig=${i})`,
                  backgroundSize: "cover",
                }}
              />
            </div>
            <div>
              <div className="flex justify-between items-end mb-2">
                <div className="text-[10px] text-green-400 font-mono uppercase tracking-widest font-bold">
                  v.{1 + i}.0.0
                </div>
                <div className="w-2 h-2 rounded-full bg-zinc-800 group-hover:bg-green-400 transition-colors" />
              </div>
              <h4 className="font-mono text-base font-black text-zinc-300 group-hover:text-white uppercase truncate">
                Neuromancer_{i}
              </h4>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export const CyberRecentUsers = () => (
  <section className={`${sectionClass} border-none`}>
    <div className={containerClass}>
      <div className="border-4 border-zinc-800 bg-zinc-950 p-8 relative overflow-hidden group hover:border-cyan-400 transition-colors duration-500">
        <div className="absolute top-0 left-0 w-3 h-full bg-cyan-400" />
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-cyan-400/5 rounded-full blur-3xl group-hover:bg-cyan-400/10 transition-colors" />
        <h2 className="text-3xl font-black uppercase text-white font-mono mb-8 flex items-center gap-4">
          <span className="w-4 h-4 bg-green-500 animate-pulse inline-block shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
          Live_Connections
        </h2>
        <div className="flex flex-wrap gap-4">
          {[
            "Z3R0",
            "N3ON_K1D",
            "GHOST_IN_SHELL",
            "C0D3_RUNN3R",
            "BL4D3",
            "M4TR1X",
            "V01D",
            "S1LV3R",
          ].map((user) => (
            <div
              key={user}
              className="flex items-center gap-3 bg-black border-2 border-zinc-800 px-4 py-2 hover:border-cyan-400 hover:bg-zinc-900 transition-colors cursor-pointer group/user"
            >
              <div className="w-8 h-8 bg-zinc-900 border border-zinc-700 overflow-hidden relative">
                <div className="absolute inset-0 bg-cyan-400/20 group-hover/user:bg-transparent transition-colors z-10" />
                <img
                  src={`https://api.dicebear.com/7.x/bottts/svg?seed=${user}`}
                  alt={user}
                  className="w-full h-full grayscale group-hover/user:grayscale-0 transition-all duration-300"
                />
              </div>
              <span className="font-mono text-sm font-bold text-zinc-400 group-hover/user:text-white">
                {user}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export const CyberPopularTags = () => (
  <section className={`${sectionClass} pt-0 border-none pb-20`}>
    <div className={containerClass}>
      <h2 className="text-2xl font-black uppercase text-zinc-600 font-mono mb-6 border-b-2 border-zinc-900 pb-4">
        ## Query_Parameters
      </h2>
      <div className="flex flex-wrap gap-3">
        {[
          "#CYBERPUNK",
          "#MECHA",
          "#DYSTOPIA",
          "#SYNTHWAVE",
          "#HACKER",
          "#RETRO",
          "#GLITCH",
          "#NEON",
          "#VIRTUAL_REALITY",
          "#AUGMENTED",
          "#AI",
          "#ROGUE_LIKE",
        ].map((tag) => (
          <a
            key={tag}
            href="#"
            className="font-mono text-sm font-bold px-4 py-2 bg-black border-2 border-zinc-800 text-zinc-500 hover:text-black hover:bg-pink-600 hover:border-pink-600 transition-all uppercase tracking-wider"
          >
            {tag}
          </a>
        ))}
      </div>
    </div>
  </section>
);

export const CyberFooter = () => (
  <footer className="bg-black border-t-8 border-cyan-400 pt-16 pb-8 relative overflow-hidden">
    <div className="absolute top-0 right-10 w-px h-full bg-zinc-900" />
    <div className="absolute top-0 right-20 w-px h-full bg-zinc-900" />
    <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-cyan-400/5 to-transparent" />
    <div className={`${containerClass} relative z-10`}>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-16 mb-16">
        <div className="col-span-1 md:col-span-2">
          <div className="text-5xl font-black text-white tracking-widest uppercase font-mono mb-6 flex items-center gap-4">
            <div className="w-8 h-8 bg-cyan-400 text-black flex justify-center items-center text-xl">
              N
            </div>
            Neo<span className="text-cyan-400">Nexus</span>
          </div>
          <p className="text-zinc-500 font-mono text-base max-w-md mb-8 leading-relaxed">
            The definitive grid for next-gen interactive media. Terminate all
            other connections. Establish uplink. Submit to the algorithm.
          </p>
          <div className="flex gap-4">
            <div className="w-12 h-12 bg-black border-2 border-zinc-700 flex items-center justify-center hover:bg-cyan-400 hover:border-cyan-400 hover:text-black transition-all font-mono font-black text-sm cursor-pointer shadow-[2px_2px_0px_rgba(113,113,122,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5">
              TX
            </div>
            <div className="w-12 h-12 bg-black border-2 border-zinc-700 flex items-center justify-center hover:bg-pink-600 hover:border-pink-600 hover:text-black transition-all font-mono font-black text-sm cursor-pointer shadow-[2px_2px_0px_rgba(113,113,122,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5">
              DC
            </div>
            <div className="w-12 h-12 bg-black border-2 border-zinc-700 flex items-center justify-center hover:bg-green-400 hover:border-green-400 hover:text-black transition-all font-mono font-black text-sm cursor-pointer shadow-[2px_2px_0px_rgba(113,113,122,1)] hover:shadow-none hover:translate-x-0.5 hover:translate-y-0.5">
              GH
            </div>
          </div>
        </div>
        <div>
          <h4 className="font-mono font-black text-white uppercase mb-6 border-b-2 border-zinc-800 pb-3 text-lg">
            Dir_Nodes
          </h4>
          <ul className="flex flex-col gap-3 font-mono text-sm text-zinc-500 font-bold">
            <li>
              <a
                href="#"
                className="hover:text-cyan-400 flex items-center gap-2"
              >
                <span className="text-pink-600">&gt;</span> /Root_Access
              </a>
            </li>
            <li>
              <a
                href="#"
                className="hover:text-cyan-400 flex items-center gap-2"
              >
                <span className="text-pink-600">&gt;</span> /Data_Archive
              </a>
            </li>
            <li>
              <a
                href="#"
                className="hover:text-cyan-400 flex items-center gap-2"
              >
                <span className="text-pink-600">&gt;</span> /Sys_Config
              </a>
            </li>
            <li>
              <a
                href="#"
                className="hover:text-cyan-400 flex items-center gap-2"
              >
                <span className="text-pink-600">&gt;</span> /Terminal
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="font-mono font-black text-white uppercase mb-6 border-b-2 border-zinc-800 pb-3 text-lg">
            Secure_Comm
          </h4>
          <form className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="ENTER_ID..."
              className="bg-black border-2 border-zinc-800 px-4 py-3 font-mono text-sm text-white focus:outline-none focus:border-cyan-400 font-bold placeholder:text-zinc-700"
            />
            <button className="bg-cyan-400 text-black font-black uppercase font-mono text-base py-3 hover:bg-white transition-colors border-2 border-cyan-400 shadow-[4px_4px_0px_rgba(255,255,255,0.2)]">
              Uplink
            </button>
          </form>
        </div>
      </div>
      <div className="border-t-2 border-zinc-900 pt-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="font-mono text-xs text-zinc-600 font-bold uppercase">
          © {new Date().getFullYear()} NeoNexus Corp. All rights reserved.
        </div>
        <div className="font-mono text-xs text-zinc-600 font-bold flex gap-6">
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500" /> SEC: ENCRYPTED
          </span>
          <span className="flex items-center gap-2">
            <div className="w-2 h-2 bg-cyan-400" /> NODE: 48.91.20
          </span>
        </div>
      </div>
    </div>
  </footer>
);
