// oxlint-disable

import {
  FavouriteIcon,
  Home01Icon,
  Search01Icon,
  StarIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute } from "@tanstack/react-router";
import { Facehash } from "facehash";
import { motion } from "motion/react";

import { cn, defaultFacehashProps } from "@/lib/utils";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Animation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const fadeUpItem = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE },
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type MockPost = {
  id: string;
  title: string;
  gradient: string;
  likes: number;
  rating: number;
  views: number;
  version?: string;
};

type MockTag = {
  id: string;
  name: string;
  hue: number;
};

type MockUser = {
  id: string;
  name: string;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Mock Data
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const FEATURED_MAIN: MockPost = {
  id: "f1",
  title: "Stellar Odyssey: Crónicas Renacidas",
  gradient:
    "linear-gradient(135deg, oklch(0.18 0.09 280), oklch(0.13 0.16 320), oklch(0.09 0.07 200))",
  likes: 342,
  rating: 4.9,
  views: 8200,
};

const FEATURED_SECONDARY: MockPost[] = [
  {
    id: "f2",
    title: "Velo Carmesí: Despertar",
    gradient:
      "linear-gradient(135deg, oklch(0.22 0.12 350), oklch(0.12 0.1 15))",
    likes: 187,
    rating: 4.6,
    views: 3400,
  },
  {
    id: "f3",
    title: "Profundidades Neón",
    gradient:
      "linear-gradient(135deg, oklch(0.2 0.1 185), oklch(0.1 0.12 155))",
    likes: 95,
    rating: 4.3,
    views: 1800,
  },
];

const WEEKLY_GAMES: MockPost[] = [
  {
    id: "g1",
    title: "Fantasía Estelar",
    gradient:
      "linear-gradient(135deg, oklch(0.28 0.1 260), oklch(0.14 0.14 290))",
    likes: 256,
    rating: 4.7,
    views: 5100,
  },
  {
    id: "g2",
    title: "Sombras del Abismo",
    gradient:
      "linear-gradient(135deg, oklch(0.25 0.12 340), oklch(0.12 0.08 10))",
    likes: 189,
    rating: 4.4,
    views: 3800,
  },
  {
    id: "g3",
    title: "Crónicas Lunares",
    gradient:
      "linear-gradient(135deg, oklch(0.22 0.08 55), oklch(0.12 0.1 85))",
    likes: 145,
    rating: 4.5,
    views: 2900,
  },
  {
    id: "g4",
    title: "Código Eléctrico",
    gradient:
      "linear-gradient(135deg, oklch(0.2 0.1 200), oklch(0.1 0.08 230))",
    likes: 312,
    rating: 4.8,
    views: 6300,
  },
  {
    id: "g5",
    title: "Leyendas Etéreas",
    gradient:
      "linear-gradient(135deg, oklch(0.26 0.14 310), oklch(0.14 0.1 340))",
    likes: 98,
    rating: 4.1,
    views: 1700,
  },
  {
    id: "g6",
    title: "Nexo Prohibido",
    gradient:
      "linear-gradient(135deg, oklch(0.24 0.06 120), oklch(0.12 0.1 150))",
    likes: 167,
    rating: 4.3,
    views: 3100,
  },
  {
    id: "g7",
    title: "Ruta Oscura",
    gradient: "linear-gradient(135deg, oklch(0.2 0.08 40), oklch(0.1 0.12 20))",
    likes: 234,
    rating: 4.6,
    views: 4600,
  },
  {
    id: "g8",
    title: "Aurora Digital",
    gradient:
      "linear-gradient(135deg, oklch(0.22 0.12 180), oklch(0.1 0.06 210))",
    likes: 78,
    rating: 3.9,
    views: 1200,
  },
];

const RECENT_POSTS: MockPost[] = [
  {
    id: "p1",
    title: "Luna de Obsidiana",
    gradient:
      "linear-gradient(135deg, oklch(0.2 0.06 240), oklch(0.1 0.1 270))",
    likes: 45,
    rating: 4.2,
    views: 890,
    version: "0.9.3",
  },
  {
    id: "p2",
    title: "Señales del Vacío",
    gradient:
      "linear-gradient(135deg, oklch(0.22 0.1 20), oklch(0.1 0.08 350))",
    likes: 112,
    rating: 4.5,
    views: 2200,
  },
  {
    id: "p3",
    title: "Jardín de Espinas",
    gradient:
      "linear-gradient(135deg, oklch(0.18 0.12 130), oklch(0.1 0.06 160))",
    likes: 67,
    rating: 4,
    views: 1300,
  },
  {
    id: "p4",
    title: "Pulso Cuántico",
    gradient:
      "linear-gradient(135deg, oklch(0.24 0.08 200), oklch(0.12 0.12 230))",
    likes: 89,
    rating: 4.3,
    views: 1700,
    version: "1.2.0",
  },
  {
    id: "p5",
    title: "Destino Efímero",
    gradient:
      "linear-gradient(135deg, oklch(0.2 0.14 300), oklch(0.12 0.08 330))",
    likes: 34,
    rating: 3.8,
    views: 650,
  },
  {
    id: "p6",
    title: "Cenizas del Norte",
    gradient:
      "linear-gradient(135deg, oklch(0.26 0.06 80), oklch(0.14 0.1 110))",
    likes: 201,
    rating: 4.7,
    views: 4100,
    version: "2.1.0",
  },
  {
    id: "p7",
    title: "Fragmentos Rotos",
    gradient:
      "linear-gradient(135deg, oklch(0.22 0.1 360), oklch(0.1 0.12 30))",
    likes: 56,
    rating: 4.1,
    views: 980,
  },
  {
    id: "p8",
    title: "Horizonte Perdido",
    gradient:
      "linear-gradient(135deg, oklch(0.18 0.08 160), oklch(0.08 0.06 190))",
    likes: 78,
    rating: 4.4,
    views: 1500,
    version: "0.4.1",
  },
  {
    id: "p9",
    title: "Eco Silencioso",
    gradient:
      "linear-gradient(135deg, oklch(0.2 0.12 250), oklch(0.12 0.08 280))",
    likes: 23,
    rating: 3.6,
    views: 420,
  },
  {
    id: "p10",
    title: "Vórtice Interior",
    gradient:
      "linear-gradient(135deg, oklch(0.24 0.1 50), oklch(0.12 0.14 80))",
    likes: 145,
    rating: 4.6,
    views: 2800,
  },
  {
    id: "p11",
    title: "Estación Terminal",
    gradient:
      "linear-gradient(135deg, oklch(0.2 0.06 320), oklch(0.1 0.1 350))",
    likes: 92,
    rating: 4.2,
    views: 1800,
    version: "1.0.0",
  },
  {
    id: "p12",
    title: "Sueño Binario",
    gradient:
      "linear-gradient(135deg, oklch(0.22 0.08 100), oklch(0.12 0.06 130))",
    likes: 38,
    rating: 3.9,
    views: 720,
  },
];

const ACTIVE_USERS: MockUser[] = [
  { id: "u1", name: "NexusPlayer" },
  { id: "u2", name: "CrónicaOscura" },
  { id: "u3", name: "Stardust_42" },
  { id: "u4", name: "PixelWitch" },
  { id: "u5", name: "Kairos_Dev" },
  { id: "u6", name: "LunaMística" },
  { id: "u7", name: "ByteRunner" },
  { id: "u8", name: "NovaSombra" },
];

const POPULAR_TAGS: MockTag[] = [
  { id: "t1", name: "RPG", hue: 280 },
  { id: "t2", name: "Visual Novel", hue: 340 },
  { id: "t3", name: "Sandbox", hue: 140 },
  { id: "t4", name: "Acción", hue: 30 },
  { id: "t5", name: "Aventura", hue: 210 },
  { id: "t6", name: "Simulación", hue: 80 },
  { id: "t7", name: "3D", hue: 310 },
  { id: "t8", name: "2D", hue: 180 },
  { id: "t9", name: "Anime", hue: 350 },
  { id: "t10", name: "Horror", hue: 0 },
  { id: "t11", name: "Romance", hue: 330 },
  { id: "t12", name: "Estrategia", hue: 250 },
];

const NAV_ITEMS: { label: string; icon: IconSvgElement; active: boolean }[] = [
  { label: "Inicio", icon: Home01Icon, active: true },
  { label: "Buscar", icon: Search01Icon, active: false },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Utility
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatCount(n: number): string {
  if (n >= 10_000) {
    return `${(n / 1000).toFixed(0)}K`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1)}K`;
  }
  return n.toString();
}

const PAGE_BG = "oklch(0.085 0.012 280)";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Route
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const Route = createFileRoute("/demo/f")({
  component: DemoLanding,
  head: () => ({
    meta: [{ title: "NeXusTC — Prismatic Noir" }],
  }),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Page
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DemoLanding() {
  return (
    <div className="dark">
      <div
        className="relative min-h-screen overflow-x-clip text-foreground"
        style={{ backgroundColor: PAGE_BG }}
      >
        {/* Ambient glow orbs */}
        <div className="pointer-events-none fixed inset-0">
          <div
            className="absolute -top-24 -right-24 h-[520px] w-[620px] rounded-full blur-[120px]"
            style={{ background: "oklch(0.795 0.184 86.047 / 0.06)" }}
          />
          <div
            className="absolute -bottom-24 -left-24 h-[420px] w-[520px] rounded-full blur-[120px]"
            style={{ background: "oklch(0.57 0.297 304.654 / 0.08)" }}
          />
        </div>

        <div className="relative z-10">
          <DemoNavbar />
          <main>
            <DemoHero />
            <GlowDivider />
            <DemoGames />
            <GlowDivider />
            <DemoRecent />
            <GlowDivider />
            <DemoCommunity />
          </main>
          <DemoFooter />
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Navbar
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DemoNavbar() {
  return (
    <header
      className="sticky top-0 z-50 border-b border-white/[0.06] backdrop-blur-xl"
      style={{
        backgroundColor: `color-mix(in oklch, ${PAGE_BG} 80%, transparent)`,
      }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-6">
        {/* Logo */}
        <div className="font-[Lexend] text-[22px] font-extrabold tracking-tight">
          <span className="bg-linear-to-r from-primary to-accent bg-clip-text text-transparent">
            NeXusTC
          </span>
          <span className="ml-0.5 align-super text-[11px] font-normal text-muted-foreground">
            +18
          </span>
        </div>

        {/* Center nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.label} {...item} />
          ))}
        </nav>

        {/* Profile */}
        <Facehash
          className="size-8 rounded-full ring-2 ring-white/10"
          name="demo-user"
          {...defaultFacehashProps}
        />
      </div>
    </header>
  );
}

function NavLink({
  label,
  icon,
  active,
}: {
  label: string;
  icon: IconSvgElement;
  active: boolean;
}) {
  return (
    <button
      className={cn(
        "relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
      type="button"
    >
      <HugeiconsIcon className="size-4" icon={icon} />
      <span className="tracking-wide">{label}</span>
      {active && (
        <motion.span
          className="absolute bottom-0 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-primary"
          layoutId="demo-nav-active"
        />
      )}
    </button>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Hero
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DemoHero() {
  return (
    <section className="relative min-h-[70vh] overflow-hidden md:min-h-[80vh]">
      {/* Background gradient (simulates featured image) */}
      <div
        className="absolute inset-x-0 -top-14 bottom-0"
        style={{ background: FEATURED_MAIN.gradient }}
      />

      {/* Scan-line texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0px, transparent 1px, rgba(255,255,255,0.4) 1px, rgba(255,255,255,0.4) 2px)",
        }}
      />

      {/* Bottom fade into page bg */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to top, ${PAGE_BG} 0%, ${PAGE_BG} / 0.6 30%, transparent 70%)`,
        }}
      />

      {/* Content */}
      <div className="relative mx-auto flex min-h-[70vh] max-w-6xl items-end px-4 pb-10 md:min-h-[80vh] md:px-6 md:pb-14">
        <div className="flex w-full flex-col gap-6 md:flex-row md:items-end md:justify-between">
          {/* Title & stats */}
          <motion.div
            className="max-w-2xl flex-1"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-[Lexend] text-[11px] font-semibold uppercase tracking-[0.2em] text-primary backdrop-blur-sm">
              Destacado
            </span>

            <h1 className="mt-5 font-[Lexend] text-4xl font-black leading-[0.95] tracking-tight text-white md:text-6xl lg:text-7xl">
              {FEATURED_MAIN.title}
            </h1>

            <div className="mt-6 flex items-center gap-5">
              <StatBadge
                icon={FavouriteIcon}
                iconClass="fill-red-400 text-red-400"
                value={FEATURED_MAIN.likes}
              />
              <StatBadge
                icon={StarIcon}
                iconClass="fill-amber-400 text-amber-400"
                value={FEATURED_MAIN.rating.toFixed(1)}
              />
              <StatBadge
                icon={ViewIcon}
                value={formatCount(FEATURED_MAIN.views)}
              />
            </div>
          </motion.div>

          {/* Secondary featured cards */}
          <motion.div
            className="flex gap-3 md:flex-col md:pb-2"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
          >
            {FEATURED_SECONDARY.map((post) => (
              <HeroSecondaryCard key={post.id} post={post} />
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function HeroSecondaryCard({ post }: { post: MockPost }) {
  return (
    <motion.div
      className="w-40 overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md sm:w-48 md:w-52"
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      whileHover={{ scale: 1.04, y: -4 }}
    >
      <div className="aspect-video" style={{ background: post.gradient }} />
      <div className="p-3">
        <h3 className="font-[Lexend] text-sm font-bold leading-tight text-white">
          {post.title}
        </h3>
        <div className="mt-1.5 flex gap-3 text-[11px] text-white/40">
          <span className="flex items-center gap-1">
            <HugeiconsIcon
              className="size-3 fill-red-400/60 text-red-400/60"
              icon={FavouriteIcon}
            />
            {post.likes}
          </span>
          <span className="flex items-center gap-1">
            <HugeiconsIcon
              className="size-3 fill-amber-400/60 text-amber-400/60"
              icon={StarIcon}
            />
            {post.rating.toFixed(1)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Games Carousel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DemoGames() {
  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionTitle>Juegos de la Semana</SectionTitle>
      </div>

      {/* Horizontal scroll — extends to viewport edges */}
      <div className="mt-6 -mx-0 overflow-x-auto px-4 pb-3 [scrollbar-width:none] md:px-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))]">
        <div className="flex gap-3">
          {WEEKLY_GAMES.map((game, i) => (
            <motion.div
              key={game.id}
              className="w-56 shrink-0 md:w-64"
              initial={{ opacity: 0, y: 20 }}
              transition={{ delay: i * 0.06, duration: 0.5, ease: EASE }}
              viewport={{ once: true }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <GameCard game={game} />
            </motion.div>
          ))}
          {/* End spacer */}
          <div className="w-1 shrink-0" />
        </div>
      </div>
    </section>
  );
}

function GameCard({ game }: { game: MockPost }) {
  return (
    <motion.div
      className="group relative aspect-[4/3] cursor-pointer overflow-hidden rounded-xl border border-white/[0.08]"
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      whileHover={{ scale: 1.03 }}
    >
      {/* Gradient bg */}
      <div
        className="absolute inset-0 transition-transform duration-500 group-hover:scale-110"
        style={{ background: game.gradient }}
      />

      {/* Bottom vignette */}
      <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />

      {/* Content */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <h3 className="font-[Lexend] text-sm font-bold leading-tight text-white">
          {game.title}
        </h3>
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-white/50">
          <span className="flex items-center gap-1">
            <HugeiconsIcon
              className="size-3 fill-red-400 text-red-400"
              icon={FavouriteIcon}
            />
            {game.likes}
          </span>
          <span className="flex items-center gap-1">
            <HugeiconsIcon className="size-3" icon={ViewIcon} />
            {formatCount(game.views)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Recent Posts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DemoRecent() {
  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <SectionTitle>Publicaciones Recientes</SectionTitle>

        <motion.div
          className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3"
          initial="hidden"
          variants={staggerContainer}
          viewport={{ once: true, margin: "-60px" }}
          whileInView="visible"
        >
          {RECENT_POSTS.map((post) => (
            <motion.div key={post.id} variants={fadeUpItem}>
              <RecentCard post={post} />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function RecentCard({ post }: { post: MockPost }) {
  return (
    <motion.div
      className="group cursor-pointer overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] transition-colors duration-300 hover:border-white/[0.15] hover:bg-white/[0.06]"
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      whileHover={{ y: -4 }}
    >
      {/* Image area */}
      <div className="relative aspect-video overflow-hidden">
        <div
          className="absolute inset-0 transition-transform duration-500 group-hover:scale-105"
          style={{ background: post.gradient }}
        />
        {post.version && (
          <span className="absolute top-2 right-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
            {post.version}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        <h3 className="font-[Lexend] text-sm font-bold leading-tight text-white/90">
          {post.title}
        </h3>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-white/40">
          <span className="flex items-center gap-1">
            <HugeiconsIcon
              className="size-3 fill-red-400/70 text-red-400/70"
              icon={FavouriteIcon}
            />
            {post.likes}
          </span>
          {post.rating > 0 && (
            <span className="flex items-center gap-1">
              <HugeiconsIcon
                className="size-3 fill-amber-400/70 text-amber-400/70"
                icon={StarIcon}
              />
              {post.rating.toFixed(1)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <HugeiconsIcon className="size-3 text-white/40" icon={ViewIcon} />
            {formatCount(post.views)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Community (Users + Tags)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DemoCommunity() {
  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="grid gap-10 md:grid-cols-2 md:gap-14">
          {/* Active users */}
          <div>
            <SectionTitle>Usuarios Activos</SectionTitle>
            <motion.div
              className="mt-6 flex flex-wrap gap-2"
              initial="hidden"
              variants={staggerContainer}
              viewport={{ once: true }}
              whileInView="visible"
            >
              {ACTIVE_USERS.map((user) => (
                <motion.div
                  key={user.id}
                  className="flex cursor-pointer items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 backdrop-blur-sm transition-colors hover:border-white/[0.15] hover:bg-white/[0.08]"
                  variants={fadeUpItem}
                >
                  <Facehash
                    className="size-6 rounded-full"
                    name={user.name}
                    {...defaultFacehashProps}
                  />
                  <span className="text-sm font-medium text-white/80">
                    {user.name}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Popular tags */}
          <div>
            <SectionTitle>Tags Populares</SectionTitle>
            <motion.div
              className="mt-6 flex flex-wrap gap-2"
              initial="hidden"
              variants={staggerContainer}
              viewport={{ once: true }}
              whileInView="visible"
            >
              {POPULAR_TAGS.map((tag) => (
                <motion.span
                  key={tag.id}
                  className="cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all hover:scale-105"
                  style={{
                    background: `oklch(0.25 0.12 ${tag.hue} / 0.5)`,
                    border: `1px solid oklch(0.45 0.12 ${tag.hue} / 0.3)`,
                    color: `oklch(0.82 0.12 ${tag.hue})`,
                  }}
                  variants={fadeUpItem}
                >
                  {tag.name}
                </motion.span>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Footer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DemoFooter() {
  return (
    <footer className="border-t border-white/[0.06] py-10">
      <div className="mx-auto max-w-6xl px-4 text-center md:px-6">
        <div className="font-[Lexend] text-lg font-bold">
          <span className="bg-linear-to-r from-primary to-accent bg-clip-text text-transparent">
            NeXusTC
          </span>
        </div>
        <p className="mt-2 text-xs text-white/30">
          Concepto de diseño — Prismatic Noir
        </p>
      </div>
    </footer>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Shared Primitives
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function GlowDivider() {
  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6">
      <div
        className="h-px opacity-30"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(0.795 0.184 86.047), oklch(0.57 0.297 304.654), oklch(0.66 0.228 21.05), transparent)",
        }}
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 font-[Lexend] text-xs font-semibold uppercase tracking-[0.2em] text-white/90">
      <span className="inline-block h-4 w-[3px] rounded-full bg-primary" />
      {children}
    </h2>
  );
}

function StatBadge({
  icon,
  value,
  iconClass,
}: {
  icon: IconSvgElement;
  value: string | number;
  iconClass?: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-sm text-white/50">
      <HugeiconsIcon className={cn("size-4", iconClass)} icon={icon} />
      <span className="font-semibold text-white/80">{value}</span>
    </span>
  );
}
