// oxlint-disable

import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Clock,
  MessageSquare,
  Eye,
  Zap,
  ExternalLink,
  Terminal,
  Menu,
  X,
  ChevronDown,
  User,
  Bell,
  Radio,
  Hash,
  TrendingUp,
  Users,
  Star,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState, useRef } from "react";

import "./k.css";

export const Route = createFileRoute("/demo/k")({
  component: BrutLanding,
});

function BrutLanding() {
  return (
    <div className="brut-theme relative min-h-screen">
      <BrutHeader />
      <main>
        <BrutFeatured />
        <BrutWeeklyCarousel />
        <BrutRecentGames />
        <BrutOnlineUsers />
        <BrutPopularTags />
      </main>
      <BrutFooter />
    </div>
  );
}

const mainPost = {
  title: "PHANTOM GRID: THE NEXT EVOLUTION OF CYBERPUNK GAMING",
  excerpt:
    "A deep dive into the procedural world-building engine that generates unique dystopian cityscapes every playthrough. No two runs are ever the same.",
  category: "FEATURE",
  author: "CIRCUIT_BRK",
  date: "2026.03.28",
  readTime: "8 MIN",
  views: "14.2K",
  comments: 247,
  gradient: "from-[#0a1628] via-[#1a0a28] to-[#0a0a0a]",
  accentColor: "var(--b-neon-cyan)",
};

const secondaryPosts = [
  {
    title: "ISSUE #47: NEON SAMURAI — THE BLADE PROTOCOL",
    excerpt:
      "When the firewall falls, only the blade remains. Chapter 3 of the arc that broke the internet.",
    category: "COMIC",
    author: "DARKW1RE",
    date: "2026.03.27",
    readTime: "12 MIN",
    views: "8.7K",
    comments: 183,
    gradient: "from-[#1a0a0a] via-[#280a1a] to-[#0a0a0a]",
    accentColor: "var(--b-neon-red)",
  },
  {
    title: "MODDING GUIDE: BUILD YOUR OWN GAME ENGINE IN RUST",
    excerpt:
      "From zero to playable prototype. The community guide that turned 500 devs into game creators.",
    category: "GUIDE",
    author: "SYN_WAVE",
    date: "2026.03.26",
    readTime: "15 MIN",
    views: "6.1K",
    comments: 94,
    gradient: "from-[#0a1a0a] via-[#0a280a] to-[#0a0a0a]",
    accentColor: "var(--b-neon-green)",
  },
];

function StatBadge({
  icon: Icon,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | number;
}) {
  return (
    <span className="flex items-center gap-1 text-[0.6rem] text-[var(--b-text-muted)]">
      <Icon className="h-3 w-3" />
      {value}
    </span>
  );
}

export function BrutFeatured() {
  return (
    <section className="brut-container relative z-10 pt-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="brut-section-label">
          <span className="text-[var(--b-text-muted)] mr-1">[01]</span>{" "}
          FEATURED_POSTS
        </div>
        <span className="text-[0.55rem] tracking-[0.1em] text-[var(--b-text-muted)]">
          UPDATED_03.28.2026
        </span>
      </div>

      <div className="grid gap-[2px] lg:grid-cols-[1fr_0.5fr]">
        {/* Main featured post */}
        <a
          href="#"
          className="brut-card brut-card-neon brut-corner-marks group relative flex flex-col overflow-hidden"
        >
          {/* Image area */}
          <div
            className={`brut-scanlines relative h-64 bg-gradient-to-br ${mainPost.gradient} lg:h-80`}
          >
            <div className="brut-noise absolute inset-0 opacity-30" />
            {/* Category tag */}
            <div className="absolute left-4 top-4 z-10">
              <span
                className="brut-tag"
                style={{
                  color: mainPost.accentColor,
                  borderColor: mainPost.accentColor,
                  background: "rgba(0,0,0,0.7)",
                }}
              >
                {mainPost.category}
              </span>
            </div>
            {/* Corner coordinate */}
            <div className="absolute bottom-3 right-3 z-10 text-[0.5rem] tracking-wider text-[var(--b-text-muted)] opacity-50">
              x:1920 y:1080
            </div>
            {/* Decorative grid lines */}
            <div className="absolute inset-0 opacity-10">
              <div className="absolute left-1/3 top-0 h-full w-px bg-[var(--b-text-muted)]" />
              <div className="absolute left-2/3 top-0 h-full w-px bg-[var(--b-text-muted)]" />
              <div className="absolute left-0 top-1/3 h-px w-full bg-[var(--b-text-muted)]" />
              <div className="absolute left-0 top-2/3 h-px w-full bg-[var(--b-text-muted)]" />
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-1 flex-col justify-between p-5">
            <div>
              <h2 className="font-display mb-3 text-xl font-black leading-tight tracking-wide transition-colors group-hover:text-[var(--b-neon-cyan)] lg:text-2xl">
                {mainPost.title}
              </h2>
              <p className="text-[0.75rem] leading-relaxed text-[var(--b-text-dim)]">
                {mainPost.excerpt}
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-[var(--b-border)] pt-3">
              <div className="flex items-center gap-4">
                <span className="text-[0.6rem] font-bold tracking-wider text-[var(--b-neon-green)]">
                  @{mainPost.author}
                </span>
                <span className="text-[0.55rem] text-[var(--b-text-muted)]">
                  {mainPost.date}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <StatBadge icon={Clock} value={mainPost.readTime} />
                <StatBadge icon={Eye} value={mainPost.views} />
                <StatBadge icon={MessageSquare} value={mainPost.comments} />
              </div>
            </div>
          </div>

          {/* Hover arrow */}
          <div className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center border border-[var(--b-border)] bg-[var(--b-bg)] opacity-0 transition-all group-hover:opacity-100">
            <ArrowUpRight className="h-4 w-4 text-[var(--b-neon-green)]" />
          </div>
        </a>

        {/* Secondary posts */}
        <div className="flex flex-col gap-[2px]">
          {secondaryPosts.map((post, i) => (
            <a
              key={i}
              href="#"
              className="brut-card brut-card-neon group relative flex flex-1 flex-col overflow-hidden"
            >
              <div
                className={`brut-scanlines relative h-28 bg-gradient-to-br ${post.gradient}`}
              >
                <div className="brut-noise absolute inset-0 opacity-30" />
                <div className="absolute left-3 top-3 z-10">
                  <span
                    className="brut-tag"
                    style={{
                      color: post.accentColor,
                      borderColor: post.accentColor,
                      background: "rgba(0,0,0,0.7)",
                    }}
                  >
                    {post.category}
                  </span>
                </div>
                {/* Index number */}
                <div className="absolute bottom-2 right-3 z-10 font-display text-3xl font-black text-white opacity-[0.06]">
                  0{i + 2}
                </div>
              </div>

              <div className="flex flex-1 flex-col justify-between p-4">
                <h3 className="font-display mb-2 text-[0.8rem] font-bold leading-snug tracking-wider transition-colors group-hover:text-[var(--b-neon-green)]">
                  {post.title}
                </h3>
                <p className="mb-3 text-[0.65rem] leading-relaxed text-[var(--b-text-muted)] line-clamp-2">
                  {post.excerpt}
                </p>
                <div className="flex items-center justify-between border-t border-[var(--b-border)] pt-2">
                  <span className="text-[0.55rem] font-bold tracking-wider text-[var(--b-neon-green)]">
                    @{post.author}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatBadge icon={Eye} value={post.views} />
                    <StatBadge icon={MessageSquare} value={post.comments} />
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BrutFooter() {
  const footerLinks = [
    {
      heading: "PLATFORM",
      links: ["Games", "Comics", "Community", "Rankings", "Tournaments"],
    },
    {
      heading: "RESOURCES",
      links: [
        "Documentation",
        "API",
        "Modding SDK",
        "Developer Blog",
        "Status",
      ],
    },
    {
      heading: "COMPANY",
      links: ["About", "Careers", "Press Kit", "Contact", "Legal"],
    },
  ];

  return (
    <footer className="relative z-10 mt-14 border-t-2 border-[var(--b-border)] bg-[var(--b-surface)]">
      {/* ASCII divider */}
      <div className="overflow-hidden border-b border-[var(--b-border)] py-2 text-center text-[0.5rem] tracking-[0.5em] text-[var(--b-text-muted)] opacity-40">
        {"═".repeat(60)}
      </div>

      <div className="brut-container py-10">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          {/* Brand column */}
          <div>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center border-2 border-[var(--b-neon-green)] bg-[var(--b-bg)]">
                <Zap className="h-4 w-4 text-[var(--b-neon-green)]" />
              </div>
              <span className="font-display text-sm font-black tracking-[0.12em]">
                GRIDZONE
              </span>
            </div>
            <p className="mb-5 max-w-xs text-[0.7rem] leading-relaxed text-[var(--b-text-dim)]">
              The raw, unfiltered platform for games and comics. Built by the
              community, for the community. No algorithms. No gatekeepers. Just
              content.
            </p>

            {/* Terminal-style info */}
            <div className="mb-5 border border-[var(--b-border)] bg-[var(--b-bg)] p-3">
              <div className="mb-1 flex items-center gap-2 text-[0.55rem] text-[var(--b-text-muted)]">
                <Terminal className="h-3 w-3" />
                <span>sys.info</span>
              </div>
              <div className="space-y-0.5 text-[0.55rem]">
                <div>
                  <span className="text-[var(--b-text-muted)]">version:</span>{" "}
                  <span className="text-[var(--b-neon-green)]">3.7.2-beta</span>
                </div>
                <div>
                  <span className="text-[var(--b-text-muted)]">uptime:</span>{" "}
                  <span className="text-[var(--b-text-dim)]">99.97%</span>
                </div>
                <div>
                  <span className="text-[var(--b-text-muted)]">latency:</span>{" "}
                  <span className="text-[var(--b-neon-cyan)]">12ms</span>
                </div>
              </div>
            </div>

            {/* Social links */}
            <div className="flex gap-1">
              {[
                { icon: ExternalLink, label: "GITHUB" },
                { icon: ExternalLink, label: "TWITTER" },
                { icon: ExternalLink, label: "DISCORD" },
              ].map((social) => (
                <a
                  key={social.label}
                  href="#"
                  className="flex items-center gap-1.5 border border-[var(--b-border)] px-2.5 py-1.5 text-[0.55rem] font-bold tracking-wider text-[var(--b-text-muted)] transition-colors hover:border-[var(--b-neon-green)] hover:text-[var(--b-neon-green)]"
                >
                  <social.icon className="h-3 w-3" />
                  {social.label}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {footerLinks.map((col) => (
            <div key={col.heading}>
              <h4 className="font-display mb-4 text-[0.6rem] font-bold tracking-[0.2em] text-[var(--b-neon-green)]">
                {">"} {col.heading}
              </h4>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="group flex items-center text-[0.65rem] tracking-wider text-[var(--b-text-dim)] transition-colors hover:text-[var(--b-text)]"
                    >
                      <span className="mr-2 text-[var(--b-text-muted)] opacity-0 transition-opacity group-hover:opacity-100">
                        /
                      </span>
                      {link.toUpperCase()}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[var(--b-border)] bg-[var(--b-bg)]">
        <div className="brut-container flex flex-col items-center justify-between gap-2 py-3 sm:flex-row">
          <span className="text-[0.5rem] tracking-[0.12em] text-[var(--b-text-muted)]">
            &copy; 2026 GRIDZONE — ALL_RIGHTS_RESERVED
          </span>
          <div className="flex items-center gap-4 text-[0.5rem] tracking-[0.1em] text-[var(--b-text-muted)]">
            <a
              href="#"
              className="transition-colors hover:text-[var(--b-text-dim)]"
            >
              PRIVACY
            </a>
            <a
              href="#"
              className="transition-colors hover:text-[var(--b-text-dim)]"
            >
              TERMS
            </a>
            <a
              href="#"
              className="transition-colors hover:text-[var(--b-text-dim)]"
            >
              COOKIES
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function BrutHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { label: "GAMES", href: "#" },
    { label: "COMICS", href: "#" },
    { label: "COMMUNITY", href: "#" },
    { label: "RANKINGS", href: "#" },
    { label: "DEVLOG", href: "#" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b-2 border-[var(--b-border)] bg-[var(--b-surface)] backdrop-blur-sm">
      {/* Status ticker bar */}
      <div className="overflow-hidden border-b border-[var(--b-border)] bg-[var(--b-bg)] px-4 py-1">
        <div className="brut-marquee flex whitespace-nowrap">
          {[1, 2].map((i) => (
            <span
              key={i}
              className="inline-flex gap-8 text-[0.6rem] tracking-[0.15em] uppercase"
            >
              <span className="text-[var(--b-neon-green)]">
                <Zap className="mr-1 inline h-3 w-3" />
                SYS.ONLINE
              </span>
              <span className="text-[var(--b-text-muted)]">///</span>
              <span className="text-[var(--b-text-dim)]">
                ACTIVE_USERS: 2,847
              </span>
              <span className="text-[var(--b-text-muted)]">///</span>
              <span className="text-[var(--b-neon-cyan)]">
                NEW_RELEASE: PHANTOM_GRID_V2.1
              </span>
              <span className="text-[var(--b-text-muted)]">///</span>
              <span className="text-[var(--b-neon-yellow)]">
                TOURNAMENT: STARTS_IN_03:42:18
              </span>
              <span className="text-[var(--b-text-muted)]">///</span>
              <span className="text-[var(--b-neon-red)]">
                MAINTENANCE: NONE_SCHEDULED
              </span>
              <span className="text-[var(--b-text-muted)] mr-8">///</span>
            </span>
          ))}
        </div>
      </div>

      <div className="brut-container flex items-center justify-between py-3">
        {/* Logo */}
        <a href="#" className="group flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center border-2 border-[var(--b-neon-green)] bg-[var(--b-bg)]">
            <Zap className="h-5 w-5 text-[var(--b-neon-green)]" />
            <div className="absolute -right-[3px] -top-[3px] h-[6px] w-[6px] bg-[var(--b-neon-red)]" />
          </div>
          <div>
            <span className="font-display block text-lg font-black leading-none tracking-[0.12em] brut-glitch">
              GRIDZONE
            </span>
            <span className="text-[0.5rem] tracking-[0.3em] text-[var(--b-text-muted)]">
              GAMES+COMICS
            </span>
          </div>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="brut-glitch-hover relative px-3 py-2 text-[0.7rem] font-bold tracking-[0.14em] text-[var(--b-text-dim)] transition-colors hover:bg-[var(--b-surface-2)] hover:text-[var(--b-neon-green)]"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Right section: notifications + profile */}
        <div className="hidden items-center gap-2 md:flex">
          <button className="relative flex h-9 w-9 items-center justify-center border border-[var(--b-border)] bg-transparent text-[var(--b-text-dim)] transition-colors hover:border-[var(--b-neon-cyan)] hover:text-[var(--b-neon-cyan)]">
            <Bell className="h-4 w-4" />
            <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center bg-[var(--b-neon-red)] text-[6px] font-bold text-black">
              3
            </span>
          </button>

          <button className="group flex items-center gap-2 border border-[var(--b-border)] px-3 py-1.5 transition-colors hover:border-[var(--b-neon-green)]">
            <div className="relative flex h-6 w-6 items-center justify-center bg-[var(--b-neon-green)]">
              <User className="h-3.5 w-3.5 text-black" />
            </div>
            <span className="text-[0.65rem] font-bold tracking-wider text-[var(--b-text-dim)] group-hover:text-[var(--b-text)]">
              N3X_USR
            </span>
            <ChevronDown className="h-3 w-3 text-[var(--b-text-muted)]" />
          </button>
        </div>

        {/* Mobile menu button */}
        <button
          className="flex h-9 w-9 items-center justify-center border border-[var(--b-border)] text-[var(--b-text-dim)] md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {/* Mobile Nav */}
      {menuOpen && (
        <nav className="border-t-2 border-[var(--b-border)] bg-[var(--b-surface)] md:hidden">
          {navItems.map((item, i) => (
            <a
              key={item.label}
              href={item.href}
              className="flex items-center border-b border-[var(--b-border)] px-4 py-3 text-[0.7rem] font-bold tracking-[0.14em] text-[var(--b-text-dim)] transition-colors hover:bg-[var(--b-surface-2)] hover:text-[var(--b-neon-green)]"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <span className="mr-3 text-[0.55rem] text-[var(--b-text-muted)]">
                0{i + 1}
              </span>
              {item.label}
            </a>
          ))}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-7 w-7 items-center justify-center bg-[var(--b-neon-green)]">
              <User className="h-4 w-4 text-black" />
            </div>
            <span className="text-[0.65rem] font-bold tracking-wider text-[var(--b-text-dim)]">
              N3X_USR
            </span>
          </div>
        </nav>
      )}
    </header>
  );
}

const onlineUsers = [
  {
    name: "DARKW1RE",
    level: 42,
    status: "PLAYING",
    game: "PHANTOM GRID",
    color: "var(--b-neon-cyan)",
  },
  {
    name: "GLITCH_X",
    level: 38,
    status: "ONLINE",
    game: null,
    color: "var(--b-neon-green)",
  },
  {
    name: "N30N_FLX",
    level: 55,
    status: "PLAYING",
    game: "DATABREAK",
    color: "var(--b-neon-magenta)",
  },
  {
    name: "BYT3_RDR",
    level: 27,
    status: "AFK",
    game: null,
    color: "var(--b-neon-yellow)",
  },
  {
    name: "NULL_PTR",
    level: 61,
    status: "PLAYING",
    game: "VOID RUNNER",
    color: "var(--b-neon-red)",
  },
  {
    name: "SYN_WAVE",
    level: 49,
    status: "ONLINE",
    game: null,
    color: "var(--b-neon-cyan)",
  },
  {
    name: "CRYPTO_K",
    level: 33,
    status: "PLAYING",
    game: "CHROME WARS",
    color: "var(--b-neon-green)",
  },
  {
    name: "HEX_FLUX",
    level: 44,
    status: "ONLINE",
    game: null,
    color: "var(--b-neon-magenta)",
  },
  {
    name: "VCT0R_X",
    level: 58,
    status: "AFK",
    game: null,
    color: "var(--b-neon-yellow)",
  },
  {
    name: "PXLDR3AM",
    level: 36,
    status: "PLAYING",
    game: "NEON DRIFT",
    color: "var(--b-neon-red)",
  },
];

function statusColor(status: string) {
  switch (status) {
    case "PLAYING": {
      return "var(--b-neon-green)";
    }
    case "ONLINE": {
      return "var(--b-neon-cyan)";
    }
    case "AFK": {
      return "var(--b-neon-yellow)";
    }
    default: {
      return "var(--b-text-muted)";
    }
  }
}

export function BrutOnlineUsers() {
  return (
    <section className="brut-container relative z-10 mt-10">
      <div className="mb-4 flex items-center justify-between">
        <div className="brut-section-label">
          <span className="text-[var(--b-text-muted)] mr-1">[04]</span>{" "}
          ONLINE_USERS
        </div>
        <div className="flex items-center gap-2">
          <Radio className="h-3 w-3 text-[var(--b-neon-green)] brut-pulse" />
          <span className="text-[0.55rem] font-bold tracking-wider text-[var(--b-neon-green)]">
            2,847 CONNECTED
          </span>
        </div>
      </div>

      <div className="brut-card overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {onlineUsers.map((user, i) => (
            <a
              key={i}
              href="#"
              className="group flex items-center gap-3 border-b border-r border-[var(--b-border)] p-3 transition-colors hover:bg-[var(--b-surface-3)]"
            >
              {/* Avatar */}
              <div className="relative">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center border-2 text-[0.6rem] font-bold"
                  style={{ borderColor: user.color, color: user.color }}
                >
                  {user.name.slice(0, 2)}
                </div>
                {/* Status dot */}
                <div
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 border border-[var(--b-surface-2)]"
                  style={{ background: statusColor(user.status) }}
                />
              </div>

              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[0.65rem] font-bold tracking-wider transition-colors group-hover:text-[var(--b-neon-green)]">
                    {user.name}
                  </span>
                  <span className="text-[0.5rem] text-[var(--b-text-muted)]">
                    LV.{user.level}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className="text-[0.5rem] font-bold tracking-wider"
                    style={{ color: statusColor(user.status) }}
                  >
                    {user.status}
                  </span>
                  {user.game && (
                    <span className="truncate text-[0.5rem] text-[var(--b-text-muted)]">
                      : {user.game}
                    </span>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

const tags = [
  {
    name: "CYBERPUNK",
    count: "4.2K",
    trend: "+12%",
    accent: "var(--b-neon-cyan)",
    hot: true,
  },
  {
    name: "PIXEL_ART",
    count: "3.8K",
    trend: "+8%",
    accent: "var(--b-neon-green)",
    hot: true,
  },
  {
    name: "ROGUELIKE",
    count: "3.1K",
    trend: "+15%",
    accent: "var(--b-neon-magenta)",
    hot: true,
  },
  {
    name: "INDIE",
    count: "2.9K",
    trend: "+5%",
    accent: "var(--b-neon-yellow)",
    hot: false,
  },
  {
    name: "HORROR",
    count: "2.4K",
    trend: "+22%",
    accent: "var(--b-neon-red)",
    hot: true,
  },
  {
    name: "SCI-FI",
    count: "2.1K",
    trend: "+3%",
    accent: "var(--b-neon-cyan)",
    hot: false,
  },
  {
    name: "RETRO",
    count: "1.9K",
    trend: "+7%",
    accent: "var(--b-neon-green)",
    hot: false,
  },
  {
    name: "MULTIPLAYER",
    count: "1.8K",
    trend: "+18%",
    accent: "var(--b-neon-magenta)",
    hot: true,
  },
  {
    name: "STRATEGY",
    count: "1.6K",
    trend: "+2%",
    accent: "var(--b-neon-yellow)",
    hot: false,
  },
  {
    name: "MANGA",
    count: "1.5K",
    trend: "+11%",
    accent: "var(--b-neon-red)",
    hot: false,
  },
  {
    name: "OPEN_WORLD",
    count: "1.4K",
    trend: "+9%",
    accent: "var(--b-neon-cyan)",
    hot: false,
  },
  {
    name: "MODDING",
    count: "1.2K",
    trend: "+28%",
    accent: "var(--b-neon-green)",
    hot: true,
  },
  {
    name: "SPEEDRUN",
    count: "1.1K",
    trend: "+14%",
    accent: "var(--b-neon-magenta)",
    hot: false,
  },
  {
    name: "COOP",
    count: "980",
    trend: "+6%",
    accent: "var(--b-neon-yellow)",
    hot: false,
  },
];

export function BrutPopularTags() {
  return (
    <section className="brut-container relative z-10 mt-10">
      <div className="mb-4 flex items-center justify-between">
        <div className="brut-section-label">
          <span className="text-[var(--b-text-muted)] mr-1">[05]</span>{" "}
          POPULAR_TAGS
        </div>
        <span className="text-[0.55rem] tracking-[0.1em] text-[var(--b-text-muted)]">
          LAST_7_DAYS
        </span>
      </div>

      <div className="flex flex-wrap gap-[2px]">
        {tags.map((tag, i) => (
          <a
            key={i}
            href="#"
            className="brut-card group flex items-center gap-2 px-3 py-2.5 transition-all hover:!border-[color:var(--accent)]"
            style={{ "--accent": tag.accent } as React.CSSProperties}
          >
            <Hash
              className="h-3 w-3 text-[var(--b-text-muted)] transition-colors group-hover:text-[color:var(--accent)]"
              style={{ "--accent": tag.accent } as React.CSSProperties}
            />
            <span
              className="font-display text-[0.65rem] font-bold tracking-wider transition-colors group-hover:text-[color:var(--accent)]"
              style={{ "--accent": tag.accent } as React.CSSProperties}
            >
              {tag.name}
            </span>
            <span className="text-[0.5rem] text-[var(--b-text-muted)]">
              {tag.count}
            </span>
            <span className="flex items-center gap-0.5 text-[0.5rem] font-bold text-[var(--b-neon-green)]">
              <TrendingUp className="h-2.5 w-2.5" />
              {tag.trend}
            </span>
            {tag.hot && (
              <span className="bg-[var(--b-neon-red)] px-1 py-px text-[0.45rem] font-bold tracking-wider text-black">
                HOT
              </span>
            )}
          </a>
        ))}
      </div>
    </section>
  );
}

const recentGames = [
  {
    title: "GRIDLOCK PROTOCOL",
    genre: "TACTICAL_FPS",
    platform: "PC/CONSOLE",
    updated: "2H AGO",
    players: "3.2K",
    rating: 4.6,
    accent: "var(--b-neon-cyan)",
  },
  {
    title: "PIXEL PHANTOMS",
    genre: "ROGUELIKE",
    platform: "PC",
    updated: "4H AGO",
    players: "1.8K",
    rating: 4.4,
    accent: "var(--b-neon-green)",
  },
  {
    title: "DEADLINK ARENA",
    genre: "BATTLE_ROYALE",
    platform: "ALL",
    updated: "6H AGO",
    players: "24.1K",
    rating: 4.7,
    accent: "var(--b-neon-red)",
  },
  {
    title: "ECHO CHAMBER",
    genre: "PUZZLE_HORROR",
    platform: "PC/MOBILE",
    updated: "8H AGO",
    players: "890",
    rating: 4.9,
    accent: "var(--b-neon-magenta)",
  },
  {
    title: "TURBO SYNTAX",
    genre: "RHYTHM_ACTION",
    platform: "ALL",
    updated: "12H AGO",
    players: "5.4K",
    rating: 4.5,
    accent: "var(--b-neon-yellow)",
  },
  {
    title: "WARP FRONTIER",
    genre: "SPACE_SIM",
    platform: "PC",
    updated: "1D AGO",
    players: "2.1K",
    rating: 4.3,
    accent: "var(--b-neon-cyan)",
  },
];

export function BrutRecentGames() {
  return (
    <section className="brut-container relative z-10 mt-10">
      <div className="mb-4 flex items-center justify-between">
        <div className="brut-section-label">
          <span className="text-[var(--b-text-muted)] mr-1">[03]</span>{" "}
          RECENT_GAMES
        </div>
        <a
          href="#"
          className="flex items-center gap-1 text-[0.6rem] font-bold tracking-wider text-[var(--b-text-muted)] transition-colors hover:text-[var(--b-neon-green)]"
        >
          VIEW_ALL
          <ArrowUpRight className="h-3 w-3" />
        </a>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 border-b-2 border-[var(--b-border)] px-4 pb-2 text-[0.55rem] font-bold tracking-[0.15em] text-[var(--b-text-muted)] max-md:hidden">
        <span>TITLE / GENRE</span>
        <span className="w-20 text-center">PLATFORM</span>
        <span className="w-16 text-center">UPDATED</span>
        <span className="w-16 text-center">PLAYERS</span>
        <span className="w-12 text-center">RATING</span>
      </div>

      {/* Game rows */}
      <div className="flex flex-col">
        {recentGames.map((game, i) => (
          <a
            key={i}
            href="#"
            className="group grid grid-cols-1 items-center gap-4 border-b border-[var(--b-border)] px-4 py-3 transition-colors hover:bg-[var(--b-surface-2)] md:grid-cols-[1fr_auto_auto_auto_auto]"
          >
            {/* Title & Genre */}
            <div className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center border text-[0.65rem] font-bold"
                style={{ borderColor: game.accent, color: game.accent }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
              <div>
                <span className="font-display block text-[0.75rem] font-bold tracking-wider transition-colors group-hover:text-[var(--b-neon-green)]">
                  {game.title}
                </span>
                <span className="text-[0.55rem] tracking-[0.12em] text-[var(--b-text-muted)]">
                  {game.genre}
                </span>
              </div>
            </div>

            {/* Platform */}
            <span className="w-20 text-center text-[0.6rem] tracking-wider text-[var(--b-text-dim)] max-md:hidden">
              {game.platform}
            </span>

            {/* Updated */}
            <span className="flex w-16 items-center justify-center gap-1 text-[0.6rem] text-[var(--b-text-muted)] max-md:hidden">
              <Clock className="h-3 w-3" />
              {game.updated}
            </span>

            {/* Players */}
            <span className="flex w-16 items-center justify-center gap-1 text-[0.6rem] text-[var(--b-text-dim)] max-md:hidden">
              <Users className="h-3 w-3" />
              {game.players}
            </span>

            {/* Rating */}
            <span className="flex w-12 items-center justify-center gap-1 text-[0.6rem] font-bold text-[var(--b-text)] max-md:hidden">
              <Star
                className="h-3 w-3 text-[var(--b-neon-yellow)]"
                fill="var(--b-neon-yellow)"
              />
              {game.rating}
            </span>

            {/* Mobile info row */}
            <div className="flex items-center gap-4 text-[0.55rem] text-[var(--b-text-muted)] md:hidden">
              <span>{game.platform}</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {game.updated}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {game.players}
              </span>
              <span className="flex items-center gap-1">
                <Star
                  className="h-3 w-3 text-[var(--b-neon-yellow)]"
                  fill="var(--b-neon-yellow)"
                />
                {game.rating}
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

const weeklyGames = [
  {
    title: "DATABREAK",
    genre: "HACKING_SIM",
    rating: 4.8,
    players: "12.4K",
    gradient: "from-[#1a0028] via-[#0a0028] to-[#0a0a14]",
    accent: "var(--b-neon-magenta)",
    status: "HOT",
  },
  {
    title: "CHROME WARS",
    genre: "STRATEGY",
    rating: 4.5,
    players: "8.9K",
    gradient: "from-[#002818] via-[#001a10] to-[#0a0a0a]",
    accent: "var(--b-neon-green)",
    status: "NEW",
  },
  {
    title: "VOID RUNNER",
    genre: "PLATFORMER",
    rating: 4.9,
    players: "21.7K",
    gradient: "from-[#001828] via-[#001020] to-[#0a0a0a]",
    accent: "var(--b-neon-cyan)",
    status: "TRENDING",
  },
  {
    title: "RUST & RUIN",
    genre: "SURVIVAL",
    rating: 4.3,
    players: "5.2K",
    gradient: "from-[#281800] via-[#1a0f00] to-[#0a0a0a]",
    accent: "var(--b-neon-yellow)",
    status: null,
  },
  {
    title: "NEON DRIFT",
    genre: "RACING",
    rating: 4.7,
    players: "15.3K",
    gradient: "from-[#280028] via-[#1a001a] to-[#0a0a0a]",
    accent: "var(--b-neon-red)",
    status: "HOT",
  },
  {
    title: "SYNTH CITY",
    genre: "RPG",
    rating: 4.6,
    players: "9.8K",
    gradient: "from-[#0a0028] via-[#14001e] to-[#0a0a0a]",
    accent: "var(--b-neon-cyan)",
    status: "NEW",
  },
  {
    title: "BYTE QUEST",
    genre: "ADVENTURE",
    rating: 4.4,
    players: "7.1K",
    gradient: "from-[#001418] via-[#000a10] to-[#0a0a0a]",
    accent: "var(--b-neon-green)",
    status: null,
  },
];

export function BrutWeeklyCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) {
      return;
    }
    const amount = 280;
    scrollRef.current.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: "smooth",
    });
  };

  return (
    <section className="relative z-10 mt-10">
      <div className="brut-container mb-4 flex items-center justify-between">
        <div className="brut-section-label">
          <span className="text-[var(--b-text-muted)] mr-1">[02]</span>{" "}
          WEEKLY_PICKS
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scroll("left")}
            className="flex h-8 w-8 items-center justify-center border border-[var(--b-border)] bg-transparent text-[var(--b-text-dim)] transition-colors hover:border-[var(--b-neon-green)] hover:text-[var(--b-neon-green)]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="flex h-8 w-8 items-center justify-center border border-[var(--b-border)] bg-transparent text-[var(--b-text-dim)] transition-colors hover:border-[var(--b-neon-green)] hover:text-[var(--b-neon-green)]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="brut-scroll flex gap-[2px] overflow-x-auto pl-[max(0.75rem,calc((100%-1200px)/2))] pr-4"
      >
        {weeklyGames.map((game, i) => (
          <a
            key={i}
            href="#"
            className="brut-card group relative flex w-[240px] shrink-0 flex-col overflow-hidden"
          >
            {/* Cover art */}
            <div
              className={`brut-scanlines relative h-48 bg-gradient-to-b ${game.gradient}`}
            >
              <div className="brut-noise absolute inset-0 opacity-20" />
              {/* Index */}
              <div className="absolute left-3 top-3 z-10 font-display text-[0.6rem] font-bold tracking-wider text-[var(--b-text-muted)] opacity-60">
                #{String(i + 1).padStart(2, "0")}
              </div>
              {/* Status badge */}
              {game.status && (
                <div
                  className="absolute right-3 top-3 z-10 px-2 py-0.5 text-[0.55rem] font-bold tracking-wider text-black"
                  style={{ background: game.accent }}
                >
                  {game.status}
                </div>
              )}
              {/* Center icon placeholder */}
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div
                  className="flex h-14 w-14 items-center justify-center border-2 opacity-20 transition-opacity group-hover:opacity-50"
                  style={{ borderColor: game.accent }}
                >
                  <span
                    className="font-display text-lg font-black"
                    style={{ color: game.accent }}
                  >
                    {game.title.charAt(0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Info */}
            <div className="flex flex-1 flex-col justify-between p-3">
              <div>
                <h3 className="font-display text-[0.75rem] font-bold tracking-wider transition-colors group-hover:text-[var(--b-neon-green)]">
                  {game.title}
                </h3>
                <span className="text-[0.55rem] tracking-[0.15em] text-[var(--b-text-muted)]">
                  {game.genre}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-[var(--b-border)] pt-2">
                <div className="flex items-center gap-1">
                  <Star
                    className="h-3 w-3 text-[var(--b-neon-yellow)]"
                    fill="var(--b-neon-yellow)"
                  />
                  <span className="text-[0.6rem] font-bold text-[var(--b-text)]">
                    {game.rating}
                  </span>
                </div>
                <span className="text-[0.55rem] text-[var(--b-text-muted)]">
                  {game.players} PLAYING
                </span>
              </div>
            </div>

            {/* Bottom accent line */}
            <div
              className="h-[2px] w-full"
              style={{ background: game.accent, opacity: 0.5 }}
            />
          </a>
        ))}
      </div>
    </section>
  );
}
