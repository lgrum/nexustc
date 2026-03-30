import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/demo/h")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-screen bg-halftone pb-0 overflow-x-hidden">
      <ComicStyles />
      <div className="max-w-7xl mx-auto px-4 pt-6 sm:px-6 lg:px-8">
        <Header />

        <main className="grid grid-cols-1 xl:grid-cols-4 gap-10">
          <div className="xl:col-span-3 flex flex-col gap-16">
            <FeaturedPosts />
            <WeeklyCarousel />
            <RecentGames />
          </div>

          <div className="xl:col-span-1">
            <Sidebar />
          </div>
        </main>
      </div>
      <Footer />
    </div>
  );
}

export const ComicStyles = () => (
  <style
    dangerouslySetInnerHTML={{
      __html: `
    @import url('https://fonts.googleapis.com/css2?family=Bangers&family=Space+Grotesk:wght@400;700&display=swap');
    
    .font-comic { font-family: 'Bangers', cursive; letter-spacing: 0.05em; }
    .font-body { font-family: 'Space Grotesk', sans-serif; }
    
    .brutal-border { border: 4px solid #000; }
    .brutal-border-b { border-bottom: 4px solid #000; }
    
    .brutal-shadow { box-shadow: 6px 6px 0px 0px #000; }
    .brutal-shadow-sm { box-shadow: 3px 3px 0px 0px #000; }
    
    .brutal-hover { transition: transform 0.1s ease, box-shadow 0.1s ease; }
    .brutal-hover:hover { transform: translate(-2px, -2px); box-shadow: 8px 8px 0px 0px #000; }
    .brutal-hover:active { transform: translate(2px, 2px); box-shadow: 2px 2px 0px 0px #000; }
    
    .bg-halftone {
      background-color: #f4f0ea;
      background-image: radial-gradient(#000 1px, transparent 1px);
      background-size: 16px 16px;
    }
    
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
  `,
    }}
  />
);

export const Header = () => (
  <header className="flex items-center justify-between p-4 mb-8 bg-white brutal-border brutal-shadow">
    <div className="flex items-center gap-2">
      <div className="bg-yellow-400 text-black brutal-border p-2 transform -rotate-3 hover:rotate-0 transition-transform cursor-pointer">
        <h1 className="font-comic text-4xl m-0 leading-none tracking-wider text-red-600 drop-shadow-[2px_2px_0_#000]">
          ZAP!
        </h1>
      </div>
      <span className="font-body font-bold text-xl ml-2 hidden sm:block uppercase tracking-widest">
        Games & Comics
      </span>
    </div>

    <nav className="hidden md:flex gap-8 font-body font-bold text-xl uppercase tracking-wide">
      <a
        href="#"
        className="hover:text-red-600 hover:underline decoration-4 underline-offset-4 transition-colors"
      >
        Issues
      </a>
      <a
        href="#"
        className="hover:text-blue-600 hover:underline decoration-4 underline-offset-4 transition-colors"
      >
        Arcade
      </a>
      <a
        href="#"
        className="hover:text-green-500 hover:underline decoration-4 underline-offset-4 transition-colors"
      >
        Squad
      </a>
    </nav>

    <div className="flex items-center gap-4">
      <button className="hidden sm:block bg-cyan-400 font-comic text-xl px-4 py-2 brutal-border brutal-shadow-sm brutal-hover text-black uppercase">
        Subscribe
      </button>
      <div className="w-12 h-12 rounded-full brutal-border brutal-shadow-sm bg-purple-400 overflow-hidden brutal-hover cursor-pointer">
        <img
          src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&backgroundColor=c0aede"
          alt="Profile"
          className="w-full h-full object-cover"
        />
      </div>
    </div>
  </header>
);

export const FeaturedPosts = () => (
  <section className="mb-12">
    <div className="flex items-center justify-between mb-6">
      <h2 className="font-comic text-5xl text-black uppercase tracking-wide drop-shadow-[2px_2px_0_#fff]">
        <span className="bg-red-500 text-white px-3 brutal-border inline-block transform -rotate-2">
          Hot
        </span>{" "}
        Right Now
      </h2>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Feature */}
      <div className="lg:col-span-2 bg-white brutal-border brutal-shadow brutal-hover flex flex-col group cursor-pointer overflow-hidden relative">
        <div className="absolute top-4 left-4 z-10 bg-yellow-400 font-comic text-2xl px-3 py-1 brutal-border transform -rotate-3 shadow-[4px_4px_0_#000]">
          NEW COMIC
        </div>
        <div className="h-64 sm:h-96 bg-blue-200 brutal-border-b relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-700" />
          <img
            src="https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?q=80&w=800&auto=format&fit=crop"
            className="absolute inset-0 w-full h-full object-cover mix-blend-overlay group-hover:scale-105 transition-transform duration-700"
            alt="Comic Cover"
          />
          {/* Halftone overlay */}
          <div className="absolute inset-0 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:8px_8px] opacity-20 mix-blend-overlay" />
        </div>
        <div className="p-6 bg-cyan-100 flex-grow border-t-4 border-black">
          <h3 className="font-comic text-4xl mb-3 group-hover:text-red-600 transition-colors">
            The Quantum Paradox: Issue #1
          </h3>
          <p className="font-body text-lg font-bold mb-4 text-gray-800">
            A mind-bending journey through space and time where reality itself
            is the ultimate puzzle game. Will the heroes survive?
          </p>
          <div className="flex gap-3">
            <span className="bg-white px-3 py-1 text-sm font-bold uppercase brutal-border brutal-shadow-sm">
              Sci-Fi
            </span>
            <span className="bg-white px-3 py-1 text-sm font-bold uppercase brutal-border brutal-shadow-sm">
              Action
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Features */}
      <div className="flex flex-col gap-6">
        <div className="bg-white brutal-border brutal-shadow brutal-hover flex flex-col flex-1 group cursor-pointer">
          <div className="h-40 bg-green-400 brutal-border-b relative overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=500&auto=format&fit=crop"
              className="absolute inset-0 w-full h-full object-cover mix-blend-hard-light group-hover:scale-110 transition-transform duration-500"
              alt="Game"
            />
          </div>
          <div className="p-5 bg-yellow-200 flex-grow border-t-4 border-black">
            <div className="bg-black text-white text-xs font-bold inline-block px-2 py-1 mb-2 font-body uppercase">
              Arcade
            </div>
            <h3 className="font-comic text-2xl mb-2">Retro Racers 2099</h3>
            <p className="font-body text-sm font-bold text-gray-800">
              The definitive arcade racing experience returns with neon tracks.
            </p>
          </div>
        </div>
        <div className="bg-white brutal-border brutal-shadow brutal-hover flex flex-col flex-1 group cursor-pointer">
          <div className="h-40 bg-pink-500 brutal-border-b relative overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1605806616949-1e87b487cb2a?q=80&w=500&auto=format&fit=crop"
              className="absolute inset-0 w-full h-full object-cover mix-blend-overlay group-hover:scale-110 transition-transform duration-500"
              alt="Comic"
            />
          </div>
          <div className="p-5 bg-pink-200 flex-grow border-t-4 border-black">
            <div className="bg-black text-white text-xs font-bold inline-block px-2 py-1 mb-2 font-body uppercase">
              Graphic Novel
            </div>
            <h3 className="font-comic text-2xl mb-2">Neon Knights Vol. 2</h3>
            <p className="font-body text-sm font-bold text-gray-800">
              Cyberpunk tactical espionage that redefines the genre.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export const WeeklyCarousel = () => (
  <section className="mb-12">
    <div className="flex items-center gap-4 mb-6">
      <h2 className="font-comic text-5xl text-black uppercase tracking-wide drop-shadow-[2px_2px_0_#fff]">
        <span className="bg-green-400 text-black px-3 brutal-border inline-block transform rotate-1">
          Weekly
        </span>{" "}
        Drops
      </h2>
      <div className="flex-grow h-1 bg-black" />
    </div>
    <div className="flex gap-6 overflow-x-auto pb-8 pt-2 px-2 snap-x hide-scrollbar">
      {[
        {
          title: "Starfighter X",
          color: "bg-blue-400",
          img: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=400",
        },
        {
          title: "Mecha Brawl",
          color: "bg-red-400",
          img: "https://images.unsplash.com/photo-1605901309584-818e25960b8f?q=80&w=400",
        },
        {
          title: "Pixel Quest",
          color: "bg-yellow-400",
          img: "https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=400",
        },
        {
          title: "Void Walker",
          color: "bg-purple-400",
          img: "https://images.unsplash.com/photo-1614294149010-950b698f72c0?q=80&w=400",
        },
        {
          title: "Cyber Dash",
          color: "bg-cyan-400",
          img: "https://images.unsplash.com/photo-1542751110-97427bbecf20?q=80&w=400",
        },
      ].map((item, i) => (
        <div
          key={i}
          className={`min-w-[280px] ${item.color} brutal-border brutal-shadow brutal-hover snap-center shrink-0 cursor-pointer group flex flex-col`}
        >
          <div className="h-48 border-b-4 border-black overflow-hidden relative">
            <img
              src={item.img}
              className="absolute inset-0 w-full h-full object-cover mix-blend-multiply group-hover:scale-110 transition-transform duration-500"
              alt={item.title}
            />
          </div>
          <div className="p-4 bg-white text-center flex-grow flex items-center justify-center">
            <h4 className="font-comic text-2xl uppercase tracking-wider">
              {item.title}
            </h4>
          </div>
        </div>
      ))}
    </div>
  </section>
);

export const RecentGames = () => (
  <section className="mb-12">
    <h2 className="font-comic text-4xl text-black uppercase tracking-wide mb-6 drop-shadow-[2px_2px_0_#fff]">
      <span className="bg-blue-500 text-white px-3 brutal-border inline-block transform -rotate-1">
        Fresh
      </span>{" "}
      Games
    </h2>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
      {[
        { name: "Super Bounce", type: "Arcade", bg: "bg-orange-400" },
        { name: "Neon Drift", type: "Racing", bg: "bg-pink-400" },
        { name: "Galaxy Miner", type: "Strategy", bg: "bg-indigo-400" },
        { name: "Zombie Smash", type: "Action", bg: "bg-green-400" },
        { name: "Puzzle Bobble", type: "Puzzle", bg: "bg-cyan-400" },
        { name: "Shadow Ninja", type: "Adventure", bg: "bg-slate-400" },
        { name: "Card Heroes", type: "RPG", bg: "bg-red-400" },
        { name: "Rhythm Beat", type: "Music", bg: "bg-yellow-400" },
      ].map((game, i) => (
        <div
          key={i}
          className={`${game.bg} brutal-border brutal-shadow-sm brutal-hover p-5 cursor-pointer flex flex-col items-center text-center group`}
        >
          <div className="w-16 h-16 bg-white rounded-full brutal-border shadow-[4px_4px_0_#000] flex items-center justify-center mb-4 group-hover:-translate-y-2 transition-transform duration-300">
            <span className="font-comic text-3xl">{game.name.charAt(0)}</span>
          </div>
          <h4 className="font-body font-bold text-lg leading-tight text-black">
            {game.name}
          </h4>
          <span className="text-xs font-black uppercase tracking-wider mt-2 bg-black text-white px-2 py-1">
            {game.type}
          </span>
        </div>
      ))}
    </div>
  </section>
);

export const Sidebar = () => (
  <div className="flex flex-col gap-10">
    <section>
      <h2 className="font-comic text-4xl text-black uppercase tracking-wide mb-6 transform rotate-2 drop-shadow-[2px_2px_0_#fff]">
        <span className="bg-yellow-400 text-black px-3 brutal-border">
          Leaderboard
        </span>
      </h2>
      <div className="bg-white brutal-border brutal-shadow p-5 relative">
        <div className="absolute -top-3 -right-3 bg-red-500 text-white font-comic text-xl px-2 brutal-border transform rotate-6">
          LIVE
        </div>
        <ul className="flex flex-col gap-4">
          {[
            {
              name: "CrashOverride",
              points: "9,999",
              seed: "Jack",
              color: "text-red-600",
            },
            {
              name: "AcidBurn",
              points: "8,500",
              seed: "Jocelyn",
              color: "text-orange-500",
            },
            {
              name: "ZeroCool",
              points: "7,210",
              seed: "Aidan",
              color: "text-blue-600",
            },
            {
              name: "Phantom",
              points: "5,400",
              seed: "Destiny",
              color: "text-green-600",
            },
            {
              name: "LordBritish",
              points: "4,200",
              seed: "Brian",
              color: "text-purple-600",
            },
          ].map((user, i) => (
            <li
              key={i}
              className="flex items-center justify-between p-3 hover:bg-yellow-100 brutal-border transition-colors cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <span className="font-comic text-2xl ${user.color} w-6 text-center">
                  #{i + 1}
                </span>
                <div className="w-10 h-10 rounded-full brutal-border overflow-hidden bg-gray-200 group-hover:scale-110 transition-transform">
                  <img
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffdfbf,ffd5dc`}
                    alt={user.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="font-body font-bold text-lg">{user.name}</span>
              </div>
              <span className="font-comic text-xl text-black bg-yellow-300 px-2 border-2 border-black">
                {user.points}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>

    <section>
      <h2 className="font-comic text-4xl text-black uppercase tracking-wide mb-6 transform -rotate-1 drop-shadow-[2px_2px_0_#fff]">
        <span className="bg-purple-400 text-white px-3 brutal-border">
          Trending
        </span>{" "}
        Tags
      </h2>
      <div className="flex flex-wrap gap-3">
        {[
          "#Cyberpunk",
          "#Retro",
          "#Platformer",
          "#SciFi",
          "#Marvel",
          "#Indie",
          "#RPG",
          "#Multiplayer",
          "#PixelArt",
          "#DC",
        ].map((tag, i) => (
          <span
            key={i}
            className="bg-${['white', 'yellow-300', 'green-300', 'cyan-300', 'pink-300'][i%5]} font-body font-black text-lg px-4 py-2 brutal-border brutal-shadow-sm brutal-hover cursor-pointer"
          >
            {tag}
          </span>
        ))}
      </div>
    </section>
  </div>
);

export const Footer = () => (
  <footer className="mt-16 bg-black text-white p-10 brutal-border border-8 border-yellow-400 relative overflow-hidden">
    {/* Halftone background for footer */}
    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#fff_2px,transparent_2px)] [background-size:16px_16px]" />

    <div className="absolute top-0 right-0 p-4 opacity-10 transform rotate-12 pointer-events-none">
      <h1 className="font-comic text-9xl">KAPOW!</h1>
    </div>

    <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 relative z-10">
      <div>
        <div className="bg-yellow-400 inline-block p-2 brutal-border transform -rotate-2 mb-6">
          <h2 className="font-comic text-5xl text-red-600 m-0 leading-none shadow-[2px_2px_0_#000]">
            ZAP!
          </h2>
        </div>
        <p className="font-body font-bold text-xl max-w-sm leading-relaxed">
          The ultimate destination for digital comics and indie arcade games. No
          filler, just pure action.
        </p>
      </div>

      <div>
        <h3 className="font-comic text-3xl mb-6 text-cyan-400 tracking-wider">
          Quick Links
        </h3>
        <ul className="font-body font-black space-y-4 text-xl uppercase">
          <li>
            <a
              href="#"
              className="hover:text-yellow-400 hover:pl-2 transition-all block"
            >
              Read Comics
            </a>
          </li>
          <li>
            <a
              href="#"
              className="hover:text-yellow-400 hover:pl-2 transition-all block"
            >
              Play Games
            </a>
          </li>
          <li>
            <a
              href="#"
              className="hover:text-yellow-400 hover:pl-2 transition-all block"
            >
              Leaderboards
            </a>
          </li>
          <li>
            <a
              href="#"
              className="hover:text-yellow-400 hover:pl-2 transition-all block"
            >
              Submit Art
            </a>
          </li>
        </ul>
      </div>

      <div>
        <h3 className="font-comic text-3xl mb-4 text-green-400 tracking-wider">
          Join the Resistance
        </h3>
        <p className="font-body text-lg font-bold mb-6">
          Get the weekly drop of new games and issues directly to your inbox.
        </p>
        <div className="flex shadow-[6px_6px_0_#fff]">
          <input
            type="email"
            placeholder="YOUR@EMAIL.COM"
            className="bg-white text-black p-4 font-body font-black text-lg w-full brutal-border outline-none focus:bg-yellow-200 transition-colors"
          />
          <button className="bg-red-500 text-white font-comic text-2xl px-6 brutal-border border-l-0 hover:bg-red-400 transition-colors">
            JOIN
          </button>
        </div>
      </div>
    </div>

    <div className="relative z-10 mt-12 pt-6 border-t-4 border-gray-800 text-center font-body font-bold text-gray-400 uppercase tracking-widest text-sm">
      &copy; 2026 ZAP! Games & Comics. All rights reserved.
    </div>
  </footer>
);
