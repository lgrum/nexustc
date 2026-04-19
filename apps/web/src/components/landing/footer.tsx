import { Link } from "@tanstack/react-router";

const exploreLinks = [
  { href: "/", label: "Inicio" },
  { href: "/juegos", label: "Juegos" },
  { href: "/comics", label: "Comics" },
  { href: "/tutorials", label: "Tutoriales" },
  { href: "/vip", label: "VIP" },
  { href: "/news", label: "Noticias" },
  { href: "/chronos", label: "TheChronos" },
] as const;

const legalLinks = [
  { href: "/about", label: "Acerca" },
  { href: "/privacy", label: "Política de Privacidad" },
  { href: "/terms", label: "Términos y Condiciones" },
  { href: "/legal", label: "Aviso Legal" },
] as const;

const communityLinks = [
  {
    href: "https://www.patreon.com/c/NeXusTC18",
    label: "Patreon",
  },
  {
    href: "https://ko-fi.com/nexustc2",
    label: "Kofi",
  },
  {
    href: "https://x.com/NeXusTC18",
    label: "X",
  },
  {
    href: "https://www.youtube.com/@CUBAHUB",
    label: "Youtube",
  },
  {
    href: "https://discord.nexustc18.com/",
    label: "Discord",
  },
] as const;

export function Footer() {
  return (
    <footer className="mt-16 w-full border-t border-border/60 bg-background/40 px-6 py-12 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 md:grid md:grid-cols-4">
        <div className="flex flex-col gap-3">
          <h2 className="font-bold text-2xl text-primary/80">
            NeXusTC
            <span className="align-super font-normal text-xs">+18</span>
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Explora nuevas realidades. Juegos, comics y comunidad para adultos.
          </p>
          <span className="text-muted-foreground/70 text-xs">
            BETA &copy; 2026
          </span>
        </div>

        <FooterColumn title="Explorar">
          {exploreLinks.map((link) => (
            <Link
              className="text-muted-foreground text-sm transition-colors hover:text-primary"
              key={link.href}
              to={link.href}
            >
              {link.label}
            </Link>
          ))}
        </FooterColumn>

        <FooterColumn title="Comunidad">
          {communityLinks.map((link) => (
            <a
              className="inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-primary"
              href={link.href}
              key={link.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {"icon" in link ? link.icon : null}
              {link.label}
            </a>
          ))}
        </FooterColumn>

        <FooterColumn title="Legal">
          {legalLinks.map((link) => (
            <Link
              className="text-muted-foreground text-sm transition-colors hover:text-primary"
              key={link.href}
              to={link.href}
            >
              {link.label}
            </Link>
          ))}
        </FooterColumn>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold text-foreground text-sm uppercase tracking-wider">
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
