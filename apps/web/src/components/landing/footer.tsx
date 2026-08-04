import {
  Book03Icon,
  BookOpenTextIcon,
  Clock01Icon,
  GameController03Icon,
  Home07Icon,
  InformationCircleIcon,
  LegalDocument01Icon,
  LegalHammerIcon,
  Mortarboard02Icon,
  News01Icon,
  ShieldKeyIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DiscordLogo } from "../icons/discord";
import { PatreonLogo } from "../icons/patreon";
import { XLogo } from "../icons/x";
import { YoutubeLogo } from "../icons/youtube";
import { Logo } from "../logo";

const exploreLinks = [
  { href: "/", icon: Home07Icon, label: "Inicio" },
  { href: "/juegos", icon: GameController03Icon, label: "Juegos" },
  { href: "/comics", icon: Book03Icon, label: "Comics" },
  { href: "/tutorials", icon: Mortarboard02Icon, label: "Tutoriales" },
  { href: "/vip", icon: StarIcon, label: "VIP" },
  { href: "/news", icon: News01Icon, label: "Noticias" },
  { href: "/chronos", icon: Clock01Icon, label: "TheChronos" },
] as const;

const legalLinks = [
  { href: "/about", icon: InformationCircleIcon, label: "Acerca" },
  {
    href: "/review-guidelines",
    icon: BookOpenTextIcon,
    label: "Guía de reseñas",
  },
  { href: "/privacy", icon: ShieldKeyIcon, label: "Política de Privacidad" },
  {
    href: "/terms",
    icon: LegalDocument01Icon,
    label: "Términos y Condiciones",
  },
  { href: "/legal", icon: LegalHammerIcon, label: "Aviso Legal" },
] as const;

const communityLinks: readonly {
  href: string;
  icon: ReactNode;
  label: string;
}[] = [
  {
    href: "https://www.patreon.com/c/NeXusTC18",
    icon: <PatreonLogo aria-hidden="true" className="size-4 shrink-0" />,
    label: "Patreon",
  },
  {
    href: "https://x.com/NeXusTC18",
    icon: <XLogo aria-hidden="true" className="size-4 shrink-0" />,
    label: "X",
  },
  {
    href: "https://www.youtube.com/@CUBAHUB",
    icon: <YoutubeLogo aria-hidden="true" className="size-4 shrink-0" />,
    label: "YouTube",
  },
  {
    href: "https://discord.nexustc18.com/",
    icon: <DiscordLogo aria-hidden="true" className="size-4 shrink-0" />,
    label: "Discord",
  },
] as const;

export function Footer() {
  return (
    <footer className="mt-16 w-full border-t border-border/60 bg-background/40 px-6 py-12 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 md:grid md:grid-cols-4">
        <div className="flex flex-col gap-3">
          <Logo />
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
              className="inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-primary"
              key={link.href}
              href={link.href}
            >
              <HugeiconsIcon
                aria-hidden="true"
                className="size-4 shrink-0"
                icon={link.icon}
              />
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
              {link.icon}
              {link.label}
            </a>
          ))}
        </FooterColumn>

        <FooterColumn title="Legal">
          {legalLinks.map((link) => (
            <Link
              className="inline-flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-primary"
              key={link.href}
              href={link.href}
            >
              <HugeiconsIcon
                aria-hidden="true"
                className="size-4 shrink-0"
                icon={link.icon}
              />
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
  children: ReactNode;
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
