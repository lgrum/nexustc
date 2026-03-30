import {
  FavouriteIcon,
  FireIcon,
  GameController03Icon,
  Home01Icon,
  Search01Icon,
  StarIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Mock Data
const MOCK_HERO_POSTS = [
  {
    id: "1",
    title: "Shadow Realm: Rebirth",
    category: "Action RPG",
    rating: 4.9,
    views: "12.5k",
    likes: 842,
    image:
      "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=2070&auto=format&fit=crop",
    description:
      "Experience the ultimate battle between light and darkness in this stunning rebirth of the classic series.",
  },
  {
    id: "2",
    title: "Neon Cyber-Punk 2088",
    category: "Adventure",
    rating: 4.7,
    views: "8.2k",
    likes: 521,
    image:
      "https://images.unsplash.com/photo-1614729939124-032f0b56c9ce?q=80&w=2000&auto=format&fit=crop",
    description:
      "Navigate the neon-lit streets of Neo-Tokyo in this immersive cyberpunk adventure.",
  },
];

const MOCK_GAMES = [
  {
    id: "g1",
    title: "Astral Ascent",
    image:
      "https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?q=80&w=2071&auto=format&fit=crop",
    rating: 4.5,
    type: "Game",
  },
  {
    id: "g2",
    title: "Midnight Protocol",
    image:
      "https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2070&auto=format&fit=crop",
    rating: 4.2,
    type: "Game",
  },
  {
    id: "g3",
    title: "Eternal Echoes",
    image:
      "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=2071&auto=format&fit=crop",
    rating: 4.8,
    type: "Comic",
  },
  {
    id: "g4",
    title: "Void Runner",
    image:
      "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=2070&auto=format&fit=crop",
    rating: 4.6,
    type: "Game",
  },
  {
    id: "g5",
    title: "Solaris Saga",
    image:
      "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=2130&auto=format&fit=crop",
    rating: 4.4,
    type: "Comic",
  },
];

const MOCK_USERS = [
  { id: "u1", name: "AlexVortex", avatar: "", color: "bg-blue-500" },
  { id: "u2", name: "CyberGamer", avatar: "", color: "bg-purple-500" },
  { id: "u3", name: "NeonNight", avatar: "", color: "bg-pink-500" },
  { id: "u4", name: "VoidWalker", avatar: "", color: "bg-emerald-500" },
  { id: "u5", name: "PixelArt", avatar: "", color: "bg-amber-500" },
];

const MOCK_TAGS = [
  "RPG",
  "Cyberpunk",
  "Action",
  "Horror",
  "Indie",
  "Retro",
  "Multiplayer",
  "Sci-Fi",
];

export const Route = createFileRoute("/demo/c")({
  component: LandingPageDemo,
});

function LandingPageDemo() {
  return (
    <div className="min-h-screen bg-background font-['Outfit',sans-serif] text-foreground selection:bg-primary/30">
      <Navbar />

      <main className="container mx-auto px-4 pt-20 pb-12">
        <HeroSection />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-16">
          <div className="lg:col-span-8 space-y-16">
            <GamesCarouselSection />
            <RecentPostsGrid />
          </div>

          <aside className="lg:col-span-4 space-y-12">
            <ActiveUsersSidebar />
            <PopularTagsSidebar />
            <NewsletterSignup />
          </aside>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 px-6 py-4",
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border py-3"
          : "bg-transparent"
      )}
    >
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2 group cursor-pointer">
          <div className="size-10 bg-primary rounded-xl flex items-center justify-center rotate-3 group-hover:rotate-0 transition-transform shadow-lg shadow-primary/20">
            <HugeiconsIcon
              icon={FireIcon}
              className="text-primary-foreground size-6"
            />
          </div>
          <span className="text-2xl font-black tracking-tighter">NEXUSTC</span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm font-bold uppercase tracking-widest">
          <NavLink href="#" icon={Home01Icon}>
            Explore
          </NavLink>
          <NavLink href="#" icon={GameController03Icon}>
            Games
          </NavLink>
          <NavLink href="#" icon={FireIcon}>
            Trending
          </NavLink>
          <NavLink href="#" icon={Search01Icon}>
            Search
          </NavLink>
        </div>

        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="rounded-full">
            <HugeiconsIcon icon={Search01Icon} className="size-5" />
          </Button>
          <Button className="rounded-full px-6 font-bold shadow-lg shadow-primary/20">
            JOIN NOW
          </Button>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: any;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="group flex items-center gap-2 hover:text-primary transition-colors relative"
    >
      <HugeiconsIcon
        icon={icon}
        className="size-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
      />
      {children}
      <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary transition-all group-hover:w-full" />
    </a>
  );
}

function HeroSection() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % MOCK_HERO_POSTS.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative h-[600px] rounded-[2rem] overflow-hidden group">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeIndex}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="absolute inset-0"
        >
          <img
            src={MOCK_HERO_POSTS[activeIndex].image}
            alt={MOCK_HERO_POSTS[activeIndex].title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent hidden lg:block" />
        </motion.div>
      </AnimatePresence>

      <div className="absolute inset-0 flex flex-col justify-end p-8 lg:p-16">
        <motion.div
          key={`content-${activeIndex}`}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="max-w-2xl"
        >
          <Badge className="mb-4 px-3 py-1 bg-primary/20 text-primary border-primary/30 backdrop-blur-md">
            FEATURED RELEASE
          </Badge>
          <h1 className="text-5xl lg:text-7xl font-black mb-6 leading-none tracking-tighter uppercase italic">
            {MOCK_HERO_POSTS[activeIndex].title}
          </h1>
          <p className="text-lg text-foreground/80 mb-8 max-w-lg leading-relaxed">
            {MOCK_HERO_POSTS[activeIndex].description}
          </p>

          <div className="flex flex-wrap items-center gap-6 mb-8">
            <HeroStat
              icon={StarIcon}
              label={MOCK_HERO_POSTS[activeIndex].rating.toString()}
              color="text-amber-400"
            />
            <HeroStat
              icon={ViewIcon}
              label={MOCK_HERO_POSTS[activeIndex].views}
            />
            <HeroStat
              icon={FavouriteIcon}
              label={MOCK_HERO_POSTS[activeIndex].likes.toString()}
              color="text-rose-500"
            />
          </div>

          <div className="flex gap-4">
            <Button
              size="lg"
              className="rounded-xl px-8 h-14 text-lg font-black italic shadow-xl shadow-primary/40 hover:scale-105 transition-transform"
            >
              PLAY NOW
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-xl px-8 h-14 text-lg font-black backdrop-blur-md border-white/10 hover:bg-white/5"
            >
              VIEW DETAILS
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Hero Nav Dots */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 flex flex-col gap-3">
        {MOCK_HERO_POSTS.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIndex(i)}
            className={cn(
              "w-2 transition-all duration-300 rounded-full",
              activeIndex === i
                ? "h-12 bg-primary"
                : "h-3 bg-white/30 hover:bg-white/60"
            )}
          />
        ))}
      </div>
    </section>
  );
}

function HeroStat({
  icon,
  label,
  color,
}: {
  icon: any;
  label: string;
  color?: string;
}) {
  return (
    <div className="flex items-center gap-2 font-bold text-sm bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
      <HugeiconsIcon icon={icon} className={cn("size-4", color)} />
      {label}
    </div>
  );
}

function GamesCarouselSection() {
  return (
    <section>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black italic tracking-tighter uppercase">
            Weekly Picks
          </h2>
          <div className="h-1 w-20 bg-primary mt-1" />
        </div>
        <Button variant="link" className="text-primary font-bold">
          VIEW ALL
        </Button>
      </div>

      <div className="flex gap-6 overflow-x-auto pb-6 no-scrollbar">
        {MOCK_GAMES.map((game, i) => (
          <motion.div
            key={game.id}
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className="min-w-[280px] group"
          >
            <div className="relative aspect-[4/5] rounded-3xl overflow-hidden mb-4">
              <img
                src={game.image}
                alt={game.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                <Button className="w-full rounded-xl font-bold">
                  QUICK VIEW
                </Button>
              </div>
              <Badge className="absolute top-4 left-4 bg-black/60 backdrop-blur-md border-white/10">
                {game.type}
              </Badge>
            </div>
            <h3 className="text-xl font-bold group-hover:text-primary transition-colors">
              {game.title}
            </h3>
            <div className="flex items-center gap-2 text-sm text-foreground/60 mt-1">
              <HugeiconsIcon
                icon={StarIcon}
                className="size-3 text-amber-400 fill-amber-400"
              />
              <span className="font-bold">{game.rating}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function RecentPostsGrid() {
  return (
    <section>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-black italic tracking-tighter uppercase">
            Fresh Arrivals
          </h2>
          <div className="h-1 w-20 bg-primary mt-1" />
        </div>
        <div className="flex gap-2">
          <Badge
            variant="outline"
            className="cursor-pointer hover:bg-primary/10"
          >
            Games
          </Badge>
          <Badge
            variant="outline"
            className="cursor-pointer hover:bg-primary/10"
          >
            Comics
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            whileHover={{ y: -5 }}
            className="bg-card/30 border border-border rounded-[2rem] overflow-hidden group hover:border-primary/50 transition-colors"
          >
            <div className="aspect-video relative overflow-hidden">
              <img
                src={`https://picsum.photos/seed/${i + 10}/800/450`}
                alt="Post"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="size-6">
                  <AvatarFallback className="bg-primary/20 text-[10px] font-bold">
                    AV
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs font-bold text-foreground/60 uppercase tracking-widest">
                  By NexusCore
                </span>
                <span className="text-[10px] text-foreground/40 font-bold ml-auto">
                  2 HOURS AGO
                </span>
              </div>
              <h3 className="text-2xl font-black mb-3 group-hover:text-primary transition-colors leading-tight">
                THE FUTURE OF INDIE GAMING IN 2026
              </h3>
              <p className="text-sm text-foreground/70 line-clamp-2 mb-4">
                Exploring how small studios are redefining visual standards with
                minimalist yet striking art styles...
              </p>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-xs font-bold">
                  <HugeiconsIcon
                    icon={FavouriteIcon}
                    className="size-3.5 text-rose-500"
                  />{" "}
                  124
                </span>
                <span className="flex items-center gap-1.5 text-xs font-bold">
                  <HugeiconsIcon
                    icon={ViewIcon}
                    className="size-3.5 text-primary"
                  />{" "}
                  1.2K
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <Button className="w-full mt-8 h-14 rounded-2xl variant-outline font-black italic tracking-widest hover:bg-primary hover:text-primary-foreground transition-all">
        LOAD MORE CONTENT
      </Button>
    </section>
  );
}

function ActiveUsersSidebar() {
  return (
    <div className="bg-card/20 border border-border rounded-[2rem] p-8">
      <h3 className="text-xl font-black italic uppercase mb-6 tracking-tighter">
        Top Creators
      </h3>
      <div className="space-y-6">
        {MOCK_USERS.map((user, i) => (
          <div
            key={user.id}
            className="flex items-center gap-4 group cursor-pointer"
          >
            <div className="relative">
              <div
                className={cn(
                  "size-12 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg",
                  user.color
                )}
              >
                {user.name[0]}
              </div>
              <div className="absolute -bottom-1 -right-1 size-4 bg-emerald-500 border-2 border-background rounded-full" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate group-hover:text-primary transition-colors">
                {user.name}
              </p>
              <p className="text-xs text-foreground/50 font-bold">
                Level 42 • Super Legend
              </p>
            </div>
            <Badge variant="secondary" className="font-black italic">
              #{i + 1}
            </Badge>
          </div>
        ))}
      </div>
      <Button variant="outline" className="w-full mt-8 rounded-xl font-bold">
        VIEW ALL LEADERS
      </Button>
    </div>
  );
}

function PopularTagsSidebar() {
  return (
    <div className="space-y-6">
      <h3 className="text-xl font-black italic uppercase tracking-tighter">
        Trending Topics
      </h3>
      <div className="flex flex-wrap gap-2">
        {MOCK_TAGS.map((tag) => (
          <button
            key={tag}
            className="px-4 py-2 bg-card/40 border border-border rounded-xl text-sm font-bold hover:bg-primary hover:border-primary hover:text-primary-foreground transition-all hover:scale-105"
          >
            #{tag}
          </button>
        ))}
      </div>
    </div>
  );
}

function NewsletterSignup() {
  return (
    <div className="bg-primary rounded-[2rem] p-8 text-primary-foreground relative overflow-hidden group">
      <div className="absolute -right-8 -top-8 size-32 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
      <h3 className="text-2xl font-black italic uppercase mb-2 tracking-tighter">
        Stay Updated
      </h3>
      <p className="text-primary-foreground/80 text-sm font-medium mb-6">
        Get the latest games and comics delivered to your inbox.
      </p>
      <div className="relative">
        <input
          type="email"
          placeholder="your@email.com"
          className="w-full h-12 rounded-xl bg-white/10 border border-white/20 px-4 text-sm font-bold placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
        />
        <Button
          size="sm"
          className="absolute right-1 top-1 bottom-1 bg-white text-primary hover:bg-white/90 rounded-lg px-4 font-black italic"
        >
          GO
        </Button>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border mt-20 py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="size-8 bg-foreground rounded-lg flex items-center justify-center">
              <HugeiconsIcon
                icon={FireIcon}
                className="text-background size-5"
              />
            </div>
            <span className="text-xl font-black tracking-tighter">NEXUSTC</span>
          </div>

          <div className="flex gap-8 text-xs font-bold uppercase tracking-widest text-foreground/60">
            <a href="#" className="hover:text-primary transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Terms
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Support
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Contact
            </a>
          </div>

          <p className="text-xs text-foreground/40 font-bold">
            © 2026 NEXUSTC. ALL RIGHTS RESERVED.
          </p>
        </div>
      </div>
    </footer>
  );
}
