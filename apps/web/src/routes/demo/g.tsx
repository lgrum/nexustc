// oxlint-disable

import { createFileRoute } from "@tanstack/react-router";
import {
  Gamepad2,
  Bell,
  ChevronDown,
  Menu,
  Search,
  X,
  ArrowRight,
  Clock,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Star,
} from "lucide-react";
import { useState, useRef } from "react";
import type { ReactNode } from "react";

import "./g.css";

export const Route = createFileRoute("/demo/g")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="arcade-theme min-h-screen">
      <ArcadeHeader />

      <main>
        {/* Hero / Featured Posts */}
        <FeaturedPosts />

        {/* Weekly Games Carousel */}
        <WeeklyCarousel />

        {/* Content + Sidebar */}
        <div className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Main content column */}
            <div className="lg:col-span-2">
              <RecentGames />
            </div>

            {/* Sidebar */}
            <aside className="flex flex-col gap-6">
              <OnlineUsers />
              <PopularTags />
            </aside>
          </div>
        </div>
      </main>

      <ArcadeFooter />
    </div>
  );
}

const FOOTER_LINKS = {
  Explore: [
    "New Releases",
    "Top Rated",
    "Indie Picks",
    "Free to Play",
    "Coming Soon",
  ],
  Community: ["Forums", "Discord", "Events", "Leaderboards", "Fan Art"],
  Company: ["About Us", "Careers", "Press Kit", "Contact", "Privacy"],
};

function ArcadeFooter() {
  return (
    <footer className="border-t border-(--a-border) bg-(--a-surface)">
      {/* Gradient accent line */}
      <div className="h-px bg-linear-to-r from-transparent via-(--a-primary)/30 to-transparent" />

      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand column */}
          <div className="lg:col-span-2">
            <a href="#" className="inline-flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--a-primary)">
                <Gamepad2 className="h-4 w-4 text-white" />
              </div>
              <span className="font-display text-lg font-extrabold tracking-tight">
                PIXEL<span className="text-(--a-primary)">ZINE</span>
              </span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-(--a-text-muted)">
              Your daily dose of games, comics, and the culture where they
              collide. Join thousands of players and creators shaping the next
              level.
            </p>

            {/* Social row */}
            <div className="mt-5 flex gap-2">
              {["X", "DC", "YT", "TW"].map((label) => (
                <a
                  key={label}
                  href="#"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-(--a-border) bg-(--a-surface-2) font-code text-[10px] font-medium text-(--a-text-muted) transition-all hover:border-(--a-primary)/40 hover:text-(--a-primary)"
                >
                  {label}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
            <div key={heading}>
              <h3 className="font-display text-xs font-bold uppercase tracking-widest text-[var(--a-text-secondary)]">
                {heading}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-[var(--a-text-muted)] transition-colors hover:text-[var(--a-text)]"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-[var(--a-border)] pt-6 sm:flex-row">
          <p className="font-code text-[11px] text-[var(--a-text-dim)]">
            &copy; {new Date().getFullYear()} PixelZine. All rights reserved.
          </p>
          <div className="flex gap-4 font-code text-[11px] text-[var(--a-text-dim)]">
            <a href="#" className="hover:text-[var(--a-text-muted)]">
              Terms
            </a>
            <a href="#" className="hover:text-[var(--a-text-muted)]">
              Privacy
            </a>
            <a href="#" className="hover:text-[var(--a-text-muted)]">
              Cookies
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

const NAV_LINKS = [
  { label: "Home", href: "#", active: true },
  { label: "Games", href: "#" },
  { label: "Comics", href: "#" },
  { label: "Community", href: "#" },
  { label: "Store", href: "#" },
];

function ArcadeHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--a-border)] bg-[var(--a-glass)] backdrop-blur-xl">
      {/* Gradient accent line */}
      <div className="h-[2px] bg-gradient-to-r from-[var(--a-primary)] via-[var(--a-secondary)] to-[var(--a-accent)]" />

      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <a href="#" className="flex items-center gap-2.5">
          <div className="glow-pink flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--a-primary)]">
            <Gamepad2 className="h-4 w-4 text-white" />
          </div>
          <span className="font-display text-lg font-extrabold tracking-tight">
            PIXEL<span className="text-[var(--a-primary)]">ZINE</span>
          </span>
        </a>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={`rounded-lg px-3.5 py-1.5 font-display text-[13px] font-semibold uppercase tracking-wide transition-all duration-200 ${
                link.active
                  ? "bg-[var(--a-primary-muted)] text-[var(--a-primary)]"
                  : "text-[var(--a-text-muted)] hover:bg-[var(--a-surface-2)] hover:text-[var(--a-text)]"
              }`}
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-1">
          <button className="rounded-lg p-2 text-[var(--a-text-muted)] transition-colors hover:bg-[var(--a-surface-2)] hover:text-[var(--a-text)]">
            <Search className="h-[18px] w-[18px]" />
          </button>
          <button className="relative rounded-lg p-2 text-[var(--a-text-muted)] transition-colors hover:bg-[var(--a-surface-2)] hover:text-[var(--a-text)]">
            <Bell className="h-[18px] w-[18px]" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--a-primary)]" />
          </button>

          {/* Profile */}
          <button className="ml-1 flex items-center gap-2 rounded-lg border border-[var(--a-border)] bg-[var(--a-surface)] px-2 py-1 transition-colors hover:border-[var(--a-border-light)]">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[var(--a-secondary)] to-[var(--a-primary)]">
              <span className="font-display text-[9px] font-bold text-white">
                JD
              </span>
            </div>
            <ChevronDown className="hidden h-3 w-3 text-[var(--a-text-muted)] sm:block" />
          </button>

          {/* Mobile toggle */}
          <button
            className="ml-1 rounded-lg p-2 text-[var(--a-text-muted)] hover:bg-[var(--a-surface-2)] md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? (
              <X className="h-[18px] w-[18px]" />
            ) : (
              <Menu className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav className="border-t border-[var(--a-border)] bg-[var(--a-surface)] px-4 py-3 md:hidden">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={`block rounded-lg px-4 py-2.5 font-display text-sm font-semibold uppercase tracking-wide ${
                link.active
                  ? "bg-[var(--a-primary-muted)] text-[var(--a-primary)]"
                  : "text-[var(--a-text-muted)]"
              }`}
            >
              {link.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}

type Post = {
  id: number;
  title: string;
  excerpt: string;
  category: string;
  categoryVariant: "primary" | "secondary" | "accent";
  author: string;
  date: string;
  readTime: string;
  comments: number;
  gradient: string;
  icon: string;
};

const POSTS: Post[] = [
  {
    id: 1,
    title: "The Rise of Indie RPGs: How Small Studios Are Rewriting the Rules",
    excerpt:
      "From Hollow Knight to Hades, indie developers are pushing the boundaries of what role-playing games can be. We go behind the scenes with the studios leading the charge and explore why the future of RPGs might be smaller than you think.",
    category: "Feature",
    categoryVariant: "primary",
    author: "Sarah Chen",
    date: "Mar 28, 2026",
    readTime: "8 min read",
    comments: 42,
    gradient: "from-violet-600 via-purple-700 to-indigo-900",
    icon: "\u{1F3AE}",
  },
  {
    id: 2,
    title: "Ink & Steel: When Comics Meet Combat",
    excerpt:
      "The new fighting game that brings hand-drawn comic panels to life in real-time combat.",
    category: "Review",
    categoryVariant: "secondary",
    author: "Marcus Webb",
    date: "Mar 27, 2026",
    readTime: "5 min",
    comments: 18,
    gradient: "from-rose-600 via-red-700 to-rose-900",
    icon: "\u{2694}\u{FE0F}",
  },
  {
    id: 3,
    title: "Top 5 Webcomics That Became Hit Games",
    excerpt:
      "From screen to screen \u2014 the webcomics that made the leap to playable experiences.",
    category: "List",
    categoryVariant: "accent",
    author: "Yuki Tanaka",
    date: "Mar 26, 2026",
    readTime: "4 min",
    comments: 31,
    gradient: "from-emerald-500 via-teal-600 to-cyan-900",
    icon: "\u{1F4DA}",
  },
];

export function FeaturedPosts() {
  const [main, ...secondary] = POSTS;

  return (
    <section className="py-6 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Label */}
        <div className="mb-5 flex items-center gap-3">
          <span className="font-code text-[11px] font-medium uppercase tracking-widest text-[var(--a-primary)]">
            Featured
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-[var(--a-primary)]/30 to-transparent" />
        </div>

        <div className="grid gap-4 lg:grid-cols-5 lg:gap-5">
          {/* Main featured post */}
          <article className="arcade-fade-up comic-panel group overflow-hidden rounded-2xl border-2 border-[var(--a-border)] bg-[var(--a-surface)] transition-all duration-300 hover:border-[var(--a-primary)]/30 lg:col-span-3">
            <div
              className={`relative flex h-52 items-center justify-center overflow-hidden bg-gradient-to-br sm:h-72 ${main.gradient}`}
            >
              <span className="text-7xl opacity-25 transition-transform duration-700 group-hover:scale-110 group-hover:rotate-3 sm:text-8xl">
                {main.icon}
              </span>
              <div className="arcade-dots pointer-events-none absolute inset-0 opacity-15" />
              <div className="arcade-scanlines pointer-events-none absolute inset-0" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[var(--a-surface)] to-transparent" />

              <div className="absolute left-4 top-4">
                <Badge variant={main.categoryVariant}>{main.category}</Badge>
              </div>
            </div>

            <div className="p-5 sm:p-7">
              <h2 className="font-display text-xl font-extrabold leading-tight sm:text-2xl lg:text-[1.7rem]">
                {main.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--a-text-secondary)] sm:text-[15px]">
                {main.excerpt}
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Avatar name={main.author} size="sm" colorIndex={0} />
                  <div>
                    <p className="text-sm font-semibold">{main.author}</p>
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--a-text-muted)]">
                      <span>{main.date}</span>
                      <span className="text-[var(--a-border-light)]">
                        &middot;
                      </span>
                      <Clock className="h-3 w-3" />
                      <span>{main.readTime}</span>
                    </div>
                  </div>
                </div>

                <button className="glow-pink group/btn flex items-center gap-2 rounded-lg bg-[var(--a-primary)] px-4 py-2 font-display text-sm font-bold text-white transition-all hover:brightness-110">
                  Read More
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover/btn:translate-x-0.5" />
                </button>
              </div>
            </div>
          </article>

          {/* Secondary posts */}
          <div className="flex flex-col gap-4 lg:col-span-2 lg:gap-5">
            {secondary.map((post, i) => (
              <article
                key={post.id}
                className="arcade-fade-up comic-panel group flex flex-1 flex-col overflow-hidden rounded-xl border-2 border-[var(--a-border)] bg-[var(--a-surface)] transition-all duration-300 hover:border-[var(--a-secondary)]/30"
                style={{ animationDelay: `${(i + 1) * 100}ms` }}
              >
                <div
                  className={`relative flex h-28 items-center justify-center overflow-hidden bg-gradient-to-br sm:h-32 ${post.gradient}`}
                >
                  <span className="text-4xl opacity-30 transition-transform duration-500 group-hover:scale-110">
                    {post.icon}
                  </span>
                  <div className="arcade-dots pointer-events-none absolute inset-0 opacity-15" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[var(--a-surface)] to-transparent" />
                  <div className="absolute left-3 top-3">
                    <Badge variant={post.categoryVariant}>
                      {post.category}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-display text-[15px] font-bold leading-snug">
                    {post.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[var(--a-text-muted)]">
                    {post.excerpt}
                  </p>

                  <div className="mt-auto flex items-center gap-2 pt-3 text-[11px] text-[var(--a-text-muted)]">
                    <Avatar name={post.author} size="sm" colorIndex={i + 1} />
                    <span className="font-medium text-[var(--a-text-secondary)]">
                      {post.author}
                    </span>
                    <span className="text-[var(--a-border-light)]">
                      &middot;
                    </span>
                    <span>{post.readTime}</span>
                    <span className="ml-auto flex items-center gap-1">
                      <MessageCircle className="h-3 w-3" />
                      {post.comments}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type User = {
  name: string;
  online: boolean;
};

const USERS: User[] = [
  { name: "Alex Rivers", online: true },
  { name: "Nina Kim", online: true },
  { name: "Marcus Webb", online: true },
  { name: "Emma Liu", online: true },
  { name: "Jake Torres", online: true },
  { name: "Priya Shah", online: false },
  { name: "Leo Messi", online: true },
  { name: "Zara Flynn", online: true },
  { name: "Ryan Cole", online: false },
  { name: "Sofia Diaz", online: true },
  { name: "Kai Nakamura", online: true },
  { name: "Luna Park", online: true },
];

export function OnlineUsers() {
  const onlineCount = USERS.filter((u) => u.online).length;

  return (
    <div className="rounded-xl border border-[var(--a-border)] bg-[var(--a-surface)] p-5">
      <SectionHeader
        title="Who's Online"
        accentColor="var(--a-accent)"
        subtitle={`${onlineCount} members active now`}
      />

      <div className="flex flex-wrap gap-3">
        {USERS.map((user, i) => (
          <div
            key={user.name}
            className="group flex flex-col items-center gap-1.5"
          >
            <Avatar
              name={user.name}
              online={user.online}
              size="md"
              colorIndex={i}
            />
            <span className="max-w-[52px] truncate text-center font-code text-[10px] text-[var(--a-text-muted)] transition-colors group-hover:text-[var(--a-text-secondary)]">
              {user.name.split(" ")[0]}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-[var(--a-border)] pt-3 text-center">
        <a
          href="#"
          className="font-code text-[11px] text-[var(--a-text-muted)] transition-colors hover:text-[var(--a-secondary)]"
        >
          +2,847 more online &rarr;
        </a>
      </div>
    </div>
  );
}

type Tag = {
  label: string;
  count: number;
  color: "primary" | "secondary" | "accent" | "neutral";
};

const TAGS: Tag[] = [
  { label: "RPG", count: 2841, color: "primary" },
  { label: "Action", count: 2203, color: "secondary" },
  { label: "Indie", count: 1876, color: "accent" },
  { label: "Manga", count: 1654, color: "primary" },
  { label: "Superhero", count: 1422, color: "secondary" },
  { label: "Pixel Art", count: 1301, color: "accent" },
  { label: "Open World", count: 1189, color: "neutral" },
  { label: "Roguelite", count: 1043, color: "primary" },
  { label: "Fighting", count: 987, color: "secondary" },
  { label: "Horror", count: 876, color: "neutral" },
  { label: "Sci-Fi", count: 812, color: "accent" },
  { label: "Fantasy", count: 798, color: "primary" },
  { label: "Co-op", count: 654, color: "secondary" },
  { label: "Retro", count: 601, color: "accent" },
  { label: "Cyberpunk", count: 543, color: "primary" },
  { label: "Metroidvania", count: 487, color: "neutral" },
  { label: "Souls-like", count: 412, color: "secondary" },
  { label: "Visual Novel", count: 389, color: "accent" },
];

const colorStyles: Record<
  Tag["color"],
  { border: string; text: string; hover: string }
> = {
  primary: {
    border: "border-[var(--a-primary)]/15",
    text: "text-[var(--a-primary)]/80",
    hover:
      "hover:border-[var(--a-primary)]/40 hover:text-[var(--a-primary)] hover:shadow-[0_0_16px_rgba(255,51,102,0.12)]",
  },
  secondary: {
    border: "border-[var(--a-secondary)]/15",
    text: "text-[var(--a-secondary)]/80",
    hover:
      "hover:border-[var(--a-secondary)]/40 hover:text-[var(--a-secondary)] hover:shadow-[0_0_16px_rgba(0,204,255,0.12)]",
  },
  accent: {
    border: "border-[var(--a-accent)]/15",
    text: "text-[var(--a-accent)]/70",
    hover:
      "hover:border-[var(--a-accent)]/40 hover:text-[var(--a-accent)] hover:shadow-[0_0_16px_rgba(200,255,0,0.10)]",
  },
  neutral: {
    border: "border-[var(--a-border)]",
    text: "text-[var(--a-text-secondary)]",
    hover: "hover:border-[var(--a-border-light)] hover:text-[var(--a-text)]",
  },
};

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function PopularTags() {
  return (
    <div className="rounded-xl border border-[var(--a-border)] bg-[var(--a-surface)] p-5">
      <SectionHeader title="Trending Tags" accentColor="var(--a-secondary)" />

      <div className="flex flex-wrap gap-2">
        {TAGS.map((tag) => {
          const style = colorStyles[tag.color];
          return (
            <a
              key={tag.label}
              href="#"
              className={`flex items-center gap-1.5 rounded-lg border bg-[var(--a-surface-2)] px-2.5 py-1.5 transition-all duration-200 ${style.border} ${style.hover}`}
            >
              <span
                className={`font-code text-[11px] font-medium ${style.text}`}
              >
                {tag.label}
              </span>
              <span className="font-code text-[9px] text-[var(--a-text-dim)]">
                {formatCount(tag.count)}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

const RECENT_GAMES: Game[] = [
  {
    id: 10,
    title: "Mecha Storm",
    genre: "Action",
    rating: 4.4,
    gradient: "from-red-600 via-rose-700 to-pink-800",
    icon: "\u{1F916}",
    platform: "PC / PS5",
  },
  {
    id: 11,
    title: "Arcane Drift",
    genre: "Racing",
    rating: 4,
    gradient: "from-sky-500 via-blue-600 to-indigo-700",
    icon: "\u{1F3CE}\u{FE0F}",
    platform: "All",
  },
  {
    id: 12,
    title: "Witchbrook Tales",
    genre: "RPG",
    rating: 4.6,
    gradient: "from-purple-500 via-violet-600 to-fuchsia-700",
    icon: "\u{1FA84}",
    platform: "PC / Switch",
  },
  {
    id: 13,
    title: "Iron Tides",
    genre: "Strategy",
    rating: 4.3,
    gradient: "from-stone-500 via-zinc-600 to-slate-700",
    icon: "\u{2693}",
    platform: "PC",
  },
  {
    id: 14,
    title: "Sable Circuit",
    genre: "Puzzle",
    rating: 4.7,
    gradient: "from-yellow-400 via-amber-500 to-orange-600",
    icon: "\u{1F9E9}",
    platform: "Mobile / PC",
  },
  {
    id: 15,
    title: "Dead Frequency",
    genre: "Horror",
    rating: 4.5,
    gradient: "from-emerald-800 via-green-900 to-black",
    icon: "\u{1F4FB}",
    platform: "PC / PS5",
  },
];

export function RecentGames() {
  return (
    <div>
      <SectionHeader
        title="Recently Added"
        subtitle="Fresh arrivals this week"
        action={{ label: "Browse All", href: "#" }}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {RECENT_GAMES.map((game, i) => (
          <GameCard
            key={game.id}
            game={game}
            size="sm"
            className="arcade-fade-up"
            style={{ animationDelay: `${i * 70}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

const WEEKLY_GAMES: Game[] = [
  {
    id: 1,
    title: "Neon Abyss: Redux",
    genre: "Roguelite",
    rating: 4.7,
    gradient: "from-fuchsia-600 via-purple-600 to-violet-800",
    icon: "\u{1F300}",
    platform: "PC / PS5",
  },
  {
    id: 2,
    title: "Celestial Forge",
    genre: "RPG",
    rating: 4.9,
    gradient: "from-amber-500 via-orange-600 to-red-700",
    icon: "\u{2692}\u{FE0F}",
    platform: "PC",
  },
  {
    id: 3,
    title: "Phantom Circuit",
    genre: "Adventure",
    rating: 4.3,
    gradient: "from-cyan-500 via-blue-600 to-indigo-800",
    icon: "\u{1F50C}",
    platform: "All",
  },
  {
    id: 4,
    title: "Ember Throne",
    genre: "ARPG",
    rating: 4.6,
    gradient: "from-red-500 via-orange-500 to-amber-600",
    icon: "\u{1F525}",
    platform: "PC / Xbox",
  },
  {
    id: 5,
    title: "Void Runners",
    genre: "Shooter",
    rating: 4.2,
    gradient: "from-slate-600 via-gray-700 to-zinc-800",
    icon: "\u{1F680}",
    platform: "PC / PS5",
  },
  {
    id: 6,
    title: "Starfall Legends",
    genre: "MMO",
    rating: 4.5,
    gradient: "from-indigo-500 via-blue-600 to-sky-700",
    icon: "\u{2B50}",
    platform: "PC",
  },
  {
    id: 7,
    title: "Crystal Kingdoms",
    genre: "Strategy",
    rating: 4.1,
    gradient: "from-teal-400 via-emerald-500 to-green-700",
    icon: "\u{1F48E}",
    platform: "Mobile",
  },
  {
    id: 8,
    title: "Shadow Pulse",
    genre: "Horror",
    rating: 4.8,
    gradient: "from-gray-700 via-slate-800 to-zinc-900",
    icon: "\u{1F441}\u{FE0F}",
    platform: "PC / PS5",
  },
];

function CarouselButton({
  direction,
  onClick,
}: {
  direction: "left" | "right";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--a-border)] bg-[var(--a-surface)] text-[var(--a-text-muted)] transition-all hover:border-[var(--a-secondary)]/40 hover:text-[var(--a-secondary)]"
    >
      {direction === "left" ? (
        <ChevronLeft className="h-4 w-4" />
      ) : (
        <ChevronRight className="h-4 w-4" />
      )}
    </button>
  );
}

export function WeeklyCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    scrollRef.current?.scrollBy({
      left: direction === "left" ? -280 : 280,
      behavior: "smooth",
    });
  };

  return (
    <Section>
      <SectionHeader
        title="This Week's Picks"
        subtitle="Curated games hand-picked by our editors"
        accentColor="var(--a-secondary)"
        action={{ label: "View All", href: "#" }}
        right={
          <div className="flex gap-1.5">
            <CarouselButton direction="left" onClick={() => scroll("left")} />
            <CarouselButton direction="right" onClick={() => scroll("right")} />
          </div>
        }
      />

      {/* Scrollable track */}
      <div className="relative">
        {/* Fade edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[var(--a-bg)] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-[var(--a-bg)] to-transparent" />

        <div
          ref={scrollRef}
          className="hide-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-2 snap-x snap-mandatory scroll-pl-1"
        >
          {WEEKLY_GAMES.map((game, i) => (
            <div
              key={game.id}
              className="w-[220px] shrink-0 snap-start sm:w-[250px]"
            >
              <GameCard
                game={game}
                className="arcade-fade-up"
                style={{ animationDelay: `${i * 60}ms` }}
              />
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
const PALETTE = [
  "from-rose-500 to-pink-600",
  "from-violet-500 to-purple-600",
  "from-cyan-400 to-blue-500",
  "from-emerald-400 to-teal-500",
  "from-amber-400 to-orange-500",
  "from-fuchsia-500 to-pink-500",
  "from-sky-400 to-indigo-500",
  "from-lime-400 to-emerald-500",
] as const;

const sizes = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-[11px]",
  lg: "h-12 w-12 text-sm",
} as const;

const dotSizes = {
  sm: "h-2 w-2 border",
  md: "h-2.5 w-2.5 border-[1.5px]",
  lg: "h-3 w-3 border-2",
} as const;

export function Avatar({
  name,
  online,
  size = "md",
  colorIndex = 0,
}: {
  name: string;
  online?: boolean;
  size?: "sm" | "md" | "lg";
  colorIndex?: number;
}) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const gradient = PALETTE[colorIndex % PALETTE.length];

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={`flex items-center justify-center rounded-full bg-gradient-to-br font-display font-bold text-white ${gradient} ${sizes[size]}`}
      >
        {initials}
      </div>
      {online && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-[var(--a-bg)] bg-emerald-400 ${dotSizes[size]}`}
          style={{ animation: "pulse-online 2s ease-in-out infinite" }}
        />
      )}
    </div>
  );
}

type BadgeVariant = "primary" | "secondary" | "accent" | "ghost";

const variants: Record<BadgeVariant, string> = {
  primary:
    "bg-[var(--a-primary-muted)] text-[var(--a-primary)] border-[var(--a-primary)]/20",
  secondary:
    "bg-[var(--a-secondary-muted)] text-[var(--a-secondary)] border-[var(--a-secondary)]/20",
  accent:
    "bg-[var(--a-accent-muted)] text-[var(--a-accent)] border-[var(--a-accent)]/20",
  ghost:
    "bg-[var(--a-surface-2)] text-[var(--a-text-secondary)] border-[var(--a-border)]",
};

export function Badge({
  children,
  variant = "ghost",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 font-code text-[11px] font-medium uppercase tracking-wider ${variants[variant]}`}
    >
      {children}
    </span>
  );
}

export function Section({
  children,
  className = "",
  noPadding = false,
}: {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}) {
  return (
    <section className={`${noPadding ? `` : `py-10 sm:py-14`} ${className}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
  accentColor = "var(--a-primary)",
  right,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; href: string };
  accentColor?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-7 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-extrabold uppercase tracking-wide sm:text-2xl">
          {title}
          <span
            className="ml-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
            style={{ backgroundColor: accentColor }}
          />
        </h2>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--a-text-muted)]">{subtitle}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {right}
        {action && (
          <a
            href={action.href}
            className="group flex items-center gap-1.5 rounded-lg border border-[var(--a-border)] bg-[var(--a-surface)] px-3 py-1.5 font-code text-[11px] font-medium uppercase tracking-wider text-[var(--a-text-secondary)] transition-all hover:border-[var(--a-primary)]/40 hover:text-[var(--a-primary)]"
          >
            {action.label}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </a>
        )}
      </div>
    </div>
  );
}

export type Game = {
  id: number;
  title: string;
  genre: string;
  rating: number;
  gradient: string;
  icon: string;
  players?: string;
  platform?: string;
};

const sizeMap = {
  sm: { cover: "h-28", pad: "p-3", title: "text-sm", icon: "text-2xl" },
  md: { cover: "h-40", pad: "p-4", title: "text-base", icon: "text-4xl" },
  lg: { cover: "h-52", pad: "p-5", title: "text-lg", icon: "text-5xl" },
} as const;

export function GameCard({
  game,
  size = "md",
  className = "",
  style,
}: {
  game: Game;
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: React.CSSProperties;
}) {
  const s = sizeMap[size];

  return (
    <article
      className={`comic-panel group relative overflow-hidden rounded-xl border-2 border-[var(--a-border)] bg-[var(--a-surface)] transition-all duration-300 hover:-translate-y-1 hover:border-[var(--a-primary)]/40 hover:shadow-[0_8px_40px_rgba(255,51,102,0.10)] ${className}`}
      style={style}
    >
      {/* Cover */}
      <div
        className={`relative ${s.cover} overflow-hidden bg-gradient-to-br ${game.gradient}`}
      >
        <span
          className={`absolute inset-0 flex items-center justify-center ${s.icon} opacity-30 transition-transform duration-500 group-hover:scale-110`}
        >
          {game.icon}
        </span>

        {/* Halftone overlay */}
        <div className="arcade-dots pointer-events-none absolute inset-0 opacity-20" />

        {/* Bottom fade */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-14 bg-gradient-to-t from-[var(--a-surface)] to-transparent" />

        {/* Rating pill */}
        <div className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
          <span className="font-code text-[11px] font-medium text-amber-300">
            {game.rating.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className={s.pad}>
        <h3 className={`font-display font-bold leading-snug ${s.title}`}>
          {game.title}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge>{game.genre}</Badge>
          {game.platform && (
            <span className="font-code text-[10px] text-[var(--a-text-muted)]">
              {game.platform}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
