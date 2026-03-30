import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";

import "./i.css";

export const Route = createFileRoute("/demo/i")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="vault-theme relative">
      <VaultHeader />
      <main className="relative z-10">
        <VaultFeatured />
        <VaultWeeklyCarousel />
        <VaultRecentGames />
        <VaultOnlineUsers />
        <VaultPopularTags />
      </main>
      <VaultFooter />
    </div>
  );
}

/* ────────────────────────────────────────────────
   VAULT THEME — MIDNIGHT EDITORIAL
   A premium dark-mode design for games & comics
   ──────────────────────────────────────────────── */

// ═══ HEADER ═══
export function VaultHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="vault-header sticky top-0 z-50">
      <div className="vault-container flex items-center justify-between h-16 md:h-18">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[var(--v-amber)] to-[var(--v-amber-deep)] flex items-center justify-center shadow-[0_0_20px_rgba(240,160,48,0.3)] group-hover:shadow-[0_0_28px_rgba(240,160,48,0.5)] transition-shadow">
            <svg
              viewBox="0 0 20 20"
              className="w-5 h-5 text-[#08090e]"
              fill="currentColor"
            >
              <path d="M10 2L2 7v6l8 5 8-5V7l-8-5zm0 2.2L15.5 7.5 10 10.8 4.5 7.5 10 4.2z" />
            </svg>
          </div>
          <span className="font-display font-bold text-xl tracking-[0.08em] uppercase text-[var(--v-text)]">
            Vault
          </span>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {["Games", "Comics", "Community", "Rankings"].map((item, i) => (
            <a
              key={item}
              href="#"
              className={`relative px-4 py-2 text-sm font-medium tracking-wide transition-colors ${
                i === 0
                  ? "text-[var(--v-amber)] after:absolute after:bottom-0 after:left-4 after:right-4 after:h-[2px] after:bg-[var(--v-amber)] after:rounded-full"
                  : "text-[var(--v-text-secondary)] hover:text-[var(--v-text)]"
              }`}
            >
              {item}
            </a>
          ))}
        </nav>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          {/* Search */}
          <button className="hidden sm:flex w-9 h-9 items-center justify-center rounded-lg text-[var(--v-text-muted)] hover:text-[var(--v-text-secondary)] hover:bg-[var(--v-surface-2)] transition-all">
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="8" cy="8" r="6" />
              <path d="M16 16l-3.5-3.5" />
            </svg>
          </button>

          {/* Notification bell */}
          <button className="relative w-9 h-9 flex items-center justify-center rounded-lg text-[var(--v-text-muted)] hover:text-[var(--v-text-secondary)] hover:bg-[var(--v-surface-2)] transition-all">
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13.73 14a2 2 0 01-9.46 0M14 6A5 5 0 004 6c0 5-2 7-2 7h14s-2-2-2-7z" />
            </svg>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--v-amber)] ring-2 ring-[var(--v-bg)]" />
          </button>

          {/* Profile */}
          <button className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full hover:bg-[var(--v-surface-2)] transition-colors group">
            <img
              src="https://api.dicebear.com/7.x/avataaars/svg?seed=VaultUser&backgroundColor=1a1b2e"
              alt="Profile"
              className="w-8 h-8 rounded-full ring-2 ring-[var(--v-border-light)] group-hover:ring-[var(--v-amber)] transition-all"
            />
            <span className="hidden sm:block text-sm font-medium text-[var(--v-text-secondary)] group-hover:text-[var(--v-text)]">
              Player1
            </span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              className="hidden sm:block text-[var(--v-text-muted)]"
            >
              <path
                d="M3 5l3 3 3-3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {/* Mobile menu */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-[var(--v-text-secondary)] hover:bg-[var(--v-surface-2)]"
          >
            <svg
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              {mobileOpen ? (
                <>
                  <path d="M5 5l10 10M15 5L5 15" />
                </>
              ) : (
                <>
                  <path d="M3 6h14M3 10h14M3 14h14" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[var(--v-border)] bg-[var(--v-glass)] backdrop-blur-xl">
          <nav className="vault-container py-3 flex flex-col gap-1">
            {["Games", "Comics", "Community", "Rankings"].map((item, i) => (
              <a
                key={item}
                href="#"
                className={`px-4 py-2.5 rounded-lg text-sm font-medium ${
                  i === 0
                    ? "text-[var(--v-amber)] bg-[var(--v-amber-muted)]"
                    : "text-[var(--v-text-secondary)] hover:bg-[var(--v-surface-2)]"
                }`}
              >
                {item}
              </a>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

// ═══ FEATURED POSTS ═══
export function VaultFeatured() {
  return (
    <section className="vault-container pt-8 pb-6 vault-stagger">
      <div className="flex items-center gap-3 mb-6">
        <span className="vault-kicker">Featured</span>
        <div className="flex-1 h-px bg-gradient-to-r from-[var(--v-border)] to-transparent" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Main Feature */}
        <div className="lg:col-span-3 group cursor-pointer vault-card-main relative overflow-hidden rounded-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/80 via-[#151730] to-[#0a0b14]">
            <img
              src="https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?q=80&w=900&auto=format&fit=crop"
              alt="The Quantum Paradox"
              className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-luminosity group-hover:opacity-50 group-hover:scale-105 transition-all duration-700"
            />
          </div>
          {/* Grain overlay */}
          <div className="absolute inset-0 vault-noise opacity-30 pointer-events-none" />
          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#08090e] via-[#08090e]/60 to-transparent" />

          <div className="relative z-10 flex flex-col justify-end h-full min-h-[380px] md:min-h-[440px] p-6 md:p-8">
            <div className="flex items-center gap-3 mb-4">
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-[0.12em] uppercase bg-[var(--v-amber)]/90 text-[#08090e]">
                New Release
              </span>
              <span className="px-2.5 py-1 rounded-md text-[10px] font-bold tracking-[0.12em] uppercase bg-white/10 text-white/70 backdrop-blur-sm">
                Comic
              </span>
            </div>
            <h2 className="font-display font-bold text-2xl md:text-3xl lg:text-4xl text-white leading-tight mb-3 group-hover:text-[var(--v-amber)] transition-colors">
              The Quantum Paradox: Issue #1
            </h2>
            <p className="text-sm md:text-base text-white/60 max-w-lg leading-relaxed mb-4">
              A mind-bending journey through space and time where reality itself
              becomes the ultimate puzzle. Will the heroes unravel the code
              before dimensions collapse?
            </p>
            <div className="flex items-center gap-4 text-xs text-white/40">
              <span className="flex items-center gap-1.5">
                <svg
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <circle cx="7" cy="7" r="5.5" />
                  <path d="M7 4.5V7l2 1.5" />
                </svg>
                12 min read
              </span>
              <span>Mar 28, 2026</span>
              <span className="flex items-center gap-1">
                <svg
                  width="14"
                  height="14"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path d="M8 1.3l2.1 4.2 4.7.7-3.4 3.3.8 4.6L8 11.8l-4.2 2.3.8-4.6L1.2 6.2l4.7-.7L8 1.3z" />
                </svg>
                4.9
              </span>
            </div>
          </div>
        </div>

        {/* Secondary Features */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Secondary 1 */}
          <div className="group cursor-pointer vault-card relative overflow-hidden rounded-2xl flex-1">
            <div className="absolute inset-0">
              <img
                src="https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=600&auto=format&fit=crop"
                alt="Retro Racers"
                className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-40 group-hover:scale-105 transition-all duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--v-surface)] via-[var(--v-surface)]/80 to-transparent" />
            </div>
            <div className="absolute inset-0 vault-noise opacity-20 pointer-events-none" />
            <div className="relative z-10 flex flex-col justify-end h-full min-h-[200px] p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-emerald-400">
                  Trending
                </span>
              </div>
              <h3 className="font-display font-bold text-lg text-[var(--v-text)] leading-snug mb-1.5 group-hover:text-[var(--v-amber)] transition-colors">
                Retro Racers 2099
              </h3>
              <p className="text-xs text-[var(--v-text-muted)] leading-relaxed">
                The definitive arcade racing experience returns with neon-lit
                tracks and 120fps gameplay.
              </p>
            </div>
          </div>

          {/* Secondary 2 */}
          <div className="group cursor-pointer vault-card relative overflow-hidden rounded-2xl flex-1">
            <div className="absolute inset-0">
              <img
                src="https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=600&auto=format&fit=crop"
                alt="Neon Knights"
                className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-40 group-hover:scale-105 transition-all duration-700"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--v-surface)] via-[var(--v-surface)]/80 to-transparent" />
            </div>
            <div className="absolute inset-0 vault-noise opacity-20 pointer-events-none" />
            <div className="relative z-10 flex flex-col justify-end h-full min-h-[200px] p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.1em] uppercase bg-[var(--v-violet)]/20 text-[var(--v-violet)]">
                  Graphic Novel
                </span>
              </div>
              <h3 className="font-display font-bold text-lg text-[var(--v-text)] leading-snug mb-1.5 group-hover:text-[var(--v-amber)] transition-colors">
                Neon Knights Vol. 2
              </h3>
              <p className="text-xs text-[var(--v-text-muted)] leading-relaxed">
                Cyberpunk tactical espionage in a world where corporations wage
                shadow wars through augmented soldiers.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ═══ WEEKLY CAROUSEL ═══
export function VaultWeeklyCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  };

  useEffect(() => {
    checkScroll();
  }, []);

  const scroll = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({
      left: dir === "left" ? -320 : 320,
      behavior: "smooth",
    });
  };

  const weeklyGames = [
    {
      title: "Starfighter X",
      genre: "Shooter",
      rating: "4.8",
      color: "#3b5bdb",
      img: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=400",
    },
    {
      title: "Mecha Brawl",
      genre: "Fighting",
      rating: "4.6",
      color: "#e03131",
      img: "https://images.unsplash.com/photo-1605901309584-818e25960b8f?q=80&w=400",
    },
    {
      title: "Pixel Quest",
      genre: "Adventure",
      rating: "4.9",
      color: "#f59f00",
      img: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=400",
    },
    {
      title: "Void Walker",
      genre: "Horror",
      rating: "4.5",
      color: "#7950f2",
      img: "https://images.unsplash.com/photo-1614294149010-950b698f72c0?q=80&w=400",
    },
    {
      title: "Cyber Dash",
      genre: "Platformer",
      rating: "4.7",
      color: "#1098ad",
      img: "https://images.unsplash.com/photo-1542751110-97427bbecf20?q=80&w=400",
    },
    {
      title: "Neon Drift",
      genre: "Racing",
      rating: "4.4",
      color: "#e64980",
      img: "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=400",
    },
  ];

  return (
    <section className="py-8 vault-stagger">
      <div className="vault-container flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="vault-kicker">Weekly Drops</span>
          <span className="text-xs text-[var(--v-text-dim)] font-mono">
            Mar 24 — Mar 30
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className="w-8 h-8 rounded-lg border border-[var(--v-border)] flex items-center justify-center text-[var(--v-text-muted)] hover:text-[var(--v-text)] hover:border-[var(--v-border-light)] disabled:opacity-30 transition-all"
          >
            <svg
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M9 3L4 7l5 4" />
            </svg>
          </button>
          <button
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className="w-8 h-8 rounded-lg border border-[var(--v-border)] flex items-center justify-center text-[var(--v-text-muted)] hover:text-[var(--v-text)] hover:border-[var(--v-border-light)] disabled:opacity-30 transition-all"
          >
            <svg
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M5 3l5 4-5 4" />
            </svg>
          </button>
        </div>
      </div>

      <div className="vault-container-bleed">
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-4 overflow-x-auto hide-scrollbar px-[max(1rem,calc((100vw-1120px)/2))] pb-4 snap-x snap-mandatory"
        >
          {weeklyGames.map((game, i) => (
            <div
              key={i}
              className="min-w-[260px] max-w-[260px] snap-start shrink-0 group cursor-pointer"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="vault-card rounded-xl overflow-hidden">
                <div className="relative h-36 overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{ backgroundColor: game.color, opacity: 0.2 }}
                  />
                  <img
                    src={game.img}
                    alt={game.title}
                    className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-110 transition-all duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--v-surface)] to-transparent" />
                  {/* Rating badge */}
                  <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/50 backdrop-blur-sm text-[11px] font-semibold text-white/80">
                    <svg
                      width="10"
                      height="10"
                      fill="var(--v-amber)"
                      viewBox="0 0 16 16"
                    >
                      <path d="M8 1.3l2.1 4.2 4.7.7-3.4 3.3.8 4.6L8 11.8l-4.2 2.3.8-4.6L1.2 6.2l4.7-.7L8 1.3z" />
                    </svg>
                    {game.rating}
                  </div>
                </div>
                <div className="p-4">
                  <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-[var(--v-text-dim)]">
                    {game.genre}
                  </span>
                  <h4 className="font-display font-bold text-base text-[var(--v-text)] mt-1 group-hover:text-[var(--v-amber)] transition-colors">
                    {game.title}
                  </h4>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══ RECENT GAMES ═══
export function VaultRecentGames() {
  const games = [
    {
      name: "Super Bounce",
      type: "Arcade",
      players: "2.4k",
      accent: "#f59f00",
    },
    {
      name: "Galaxy Miner",
      type: "Strategy",
      players: "1.8k",
      accent: "#3b5bdb",
    },
    {
      name: "Zombie Smash",
      type: "Action",
      players: "3.1k",
      accent: "#2b8a3e",
    },
    {
      name: "Puzzle Bobble",
      type: "Puzzle",
      players: "980",
      accent: "#1098ad",
    },
    {
      name: "Shadow Ninja",
      type: "Stealth",
      players: "1.5k",
      accent: "#495057",
    },
    { name: "Card Heroes", type: "RPG", players: "2.7k", accent: "#e03131" },
    { name: "Rhythm Beat", type: "Music", players: "1.2k", accent: "#e64980" },
    { name: "Space Colony", type: "Sim", players: "890", accent: "#7950f2" },
  ];

  return (
    <section className="vault-container py-8 vault-stagger">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="vault-kicker">Recent Games</span>
        </div>
        <a
          href="#"
          className="text-xs font-medium text-[var(--v-text-muted)] hover:text-[var(--v-amber)] transition-colors"
        >
          View all &rarr;
        </a>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {games.map((game, i) => (
          <div
            key={i}
            className="vault-card rounded-xl p-4 cursor-pointer group hover:border-[color-mix(in_oklab,var(--v-border-light)_70%,transparent)] transition-all"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 text-white font-display font-bold text-lg transition-transform group-hover:-translate-y-0.5"
              style={{
                backgroundColor: `${game.accent}22`,
                color: game.accent,
              }}
            >
              {game.name.charAt(0)}
            </div>
            <h4 className="font-display font-semibold text-sm text-[var(--v-text)] mb-0.5 group-hover:text-[var(--v-amber)] transition-colors">
              {game.name}
            </h4>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold tracking-[0.08em] uppercase text-[var(--v-text-dim)]">
                {game.type}
              </span>
              <span className="text-[10px] text-[var(--v-text-dim)] flex items-center gap-1">
                <svg
                  width="10"
                  height="10"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <circle cx="8" cy="5" r="3" />
                  <path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" />
                </svg>
                {game.players}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ═══ ONLINE USERS ═══
export function VaultOnlineUsers() {
  const users = [
    {
      name: "CrashOverride",
      status: "Playing Starfighter X",
      seed: "Jack",
      online: true,
    },
    {
      name: "AcidBurn",
      status: "Reading Quantum Paradox",
      seed: "Jocelyn",
      online: true,
    },
    { name: "ZeroCool", status: "In lobby", seed: "Aidan", online: true },
    { name: "Phantom", status: "Away", seed: "Destiny", online: false },
    {
      name: "LordBritish",
      status: "Playing Mecha Brawl",
      seed: "Brian",
      online: true,
    },
    {
      name: "PixelWitch",
      status: "Browsing comics",
      seed: "Sophia",
      online: true,
    },
    { name: "NeonSamurai", status: "Idle", seed: "Marcus", online: false },
    {
      name: "GlitchQueen",
      status: "Playing Pixel Quest",
      seed: "Luna",
      online: true,
    },
  ];

  return (
    <section className="vault-container py-8 vault-stagger">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <span className="vault-kicker">Online Now</span>
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {users.filter((u) => u.online).length} online
          </span>
        </div>
      </div>

      <div className="vault-card rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {users.map((user, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--v-surface-3)] transition-colors cursor-pointer group"
            >
              <div className="relative shrink-0">
                <img
                  src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.seed}&backgroundColor=1a1b2e`}
                  alt={user.name}
                  className="w-9 h-9 rounded-full ring-1 ring-[var(--v-border)]"
                />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--v-surface)] ${
                    user.online ? "bg-emerald-400" : "bg-[var(--v-text-dim)]"
                  }`}
                />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--v-text)] truncate group-hover:text-[var(--v-amber)] transition-colors">
                  {user.name}
                </p>
                <p className="text-[11px] text-[var(--v-text-dim)] truncate">
                  {user.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ═══ POPULAR TAGS ═══
export function VaultPopularTags() {
  const tags = [
    { label: "Cyberpunk", count: "2.4k", hot: true },
    { label: "Retro", count: "1.8k", hot: false },
    { label: "Platformer", count: "1.5k", hot: false },
    { label: "Sci-Fi", count: "3.1k", hot: true },
    { label: "Marvel", count: "2.9k", hot: false },
    { label: "Indie", count: "2.2k", hot: true },
    { label: "RPG", count: "4.1k", hot: false },
    { label: "Multiplayer", count: "1.7k", hot: false },
    { label: "Pixel Art", count: "980", hot: false },
    { label: "DC", count: "2.6k", hot: false },
    { label: "Roguelike", count: "1.3k", hot: true },
    { label: "Manga", count: "3.5k", hot: false },
  ];

  return (
    <section className="vault-container py-8 vault-stagger">
      <div className="flex items-center gap-3 mb-5">
        <span className="vault-kicker">Popular Tags</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag, i) => (
          <button
            key={i}
            className="group flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[var(--v-border)] bg-[var(--v-surface)] hover:border-[var(--v-amber)]/40 hover:bg-[var(--v-amber)]/5 transition-all cursor-pointer"
          >
            <span className="text-sm font-medium text-[var(--v-text-secondary)] group-hover:text-[var(--v-amber)] transition-colors">
              #{tag.label}
            </span>
            <span className="text-[10px] text-[var(--v-text-dim)] font-mono">
              {tag.count}
            </span>
            {tag.hot && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--v-amber)]" />
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

// ═══ FOOTER ═══
export function VaultFooter() {
  return (
    <footer className="mt-12 border-t border-[var(--v-border)] bg-[var(--v-surface)]/50">
      <div className="vault-container py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          {/* Brand */}
          <div className="md:col-span-4">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--v-amber)] to-[var(--v-amber-deep)] flex items-center justify-center">
                <svg
                  viewBox="0 0 20 20"
                  className="w-4.5 h-4.5 text-[#08090e]"
                  fill="currentColor"
                >
                  <path d="M10 2L2 7v6l8 5 8-5V7l-8-5zm0 2.2L15.5 7.5 10 10.8 4.5 7.5 10 4.2z" />
                </svg>
              </div>
              <span className="font-display font-bold text-lg tracking-[0.08em] uppercase text-[var(--v-text)]">
                Vault
              </span>
            </div>
            <p className="text-sm text-[var(--v-text-muted)] leading-relaxed max-w-xs mb-6">
              The ultimate destination for digital comics, indie arcade games,
              and a community of passionate players and readers.
            </p>
            {/* Newsletter */}
            <div className="flex rounded-lg overflow-hidden border border-[var(--v-border)] focus-within:border-[var(--v-amber)]/50 transition-colors">
              <input
                type="email"
                placeholder="your@email.com"
                className="flex-1 bg-[var(--v-surface-2)] px-3.5 py-2.5 text-sm text-[var(--v-text)] placeholder:text-[var(--v-text-dim)] outline-none min-w-0"
              />
              <button className="px-4 py-2.5 bg-[var(--v-amber)] text-[#08090e] text-sm font-bold tracking-wide hover:bg-[var(--v-amber-deep)] transition-colors shrink-0">
                Subscribe
              </button>
            </div>
          </div>

          {/* Links */}
          <div className="md:col-span-2">
            <h4 className="text-xs font-bold tracking-[0.12em] uppercase text-[var(--v-text-dim)] mb-4">
              Explore
            </h4>
            <ul className="space-y-2.5">
              {["All Games", "Comics Library", "New Releases", "Top Rated"].map(
                (link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-[var(--v-text-muted)] hover:text-[var(--v-amber)] transition-colors"
                    >
                      {link}
                    </a>
                  </li>
                )
              )}
            </ul>
          </div>

          <div className="md:col-span-2">
            <h4 className="text-xs font-bold tracking-[0.12em] uppercase text-[var(--v-text-dim)] mb-4">
              Community
            </h4>
            <ul className="space-y-2.5">
              {["Leaderboards", "Forums", "Discord", "Events"].map((link) => (
                <li key={link}>
                  <a
                    href="#"
                    className="text-sm text-[var(--v-text-muted)] hover:text-[var(--v-amber)] transition-colors"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2">
            <h4 className="text-xs font-bold tracking-[0.12em] uppercase text-[var(--v-text-dim)] mb-4">
              Company
            </h4>
            <ul className="space-y-2.5">
              {["About", "Careers", "Blog", "Press Kit"].map((link) => (
                <li key={link}>
                  <a
                    href="#"
                    className="text-sm text-[var(--v-text-muted)] hover:text-[var(--v-amber)] transition-colors"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="md:col-span-2">
            <h4 className="text-xs font-bold tracking-[0.12em] uppercase text-[var(--v-text-dim)] mb-4">
              Legal
            </h4>
            <ul className="space-y-2.5">
              {["Terms", "Privacy", "Cookies", "Licenses"].map((link) => (
                <li key={link}>
                  <a
                    href="#"
                    className="text-sm text-[var(--v-text-muted)] hover:text-[var(--v-amber)] transition-colors"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-[var(--v-border)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-xs text-[var(--v-text-dim)]">
            &copy; 2026 Vault Games & Comics. All rights reserved.
          </span>
          <div className="flex items-center gap-4">
            {/* Social icons */}
            {[
              <svg
                key="tw"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>,
              <svg
                key="dc"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z" />
              </svg>,
              <svg
                key="gh"
                width="16"
                height="16"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>,
            ].map((icon, i) => (
              <a
                key={i}
                href="#"
                className="text-[var(--v-text-dim)] hover:text-[var(--v-amber)] transition-colors"
              >
                {icon}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
