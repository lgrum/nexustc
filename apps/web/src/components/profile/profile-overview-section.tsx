import {
  ArrowRight01Icon,
  Bookmark02Icon,
  Image01Icon,
  Notification03Icon,
  ShieldUserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import Link from "next/link";

import {
  ProfilePanel,
  ProfileSectionHeader,
} from "@/components/profile/profile-section";
import { Badge } from "@/components/ui/badge";

const SHORTCUTS: {
  description: string;
  href: string;
  icon: IconSvgElement;
  title: string;
}[] = [
  {
    description: "Ajusta tu avatar, banner y colores públicos.",
    href: "/profile?section=appearance",
    icon: Image01Icon,
    title: "Personalizar perfil",
  },
  {
    description: "Consulta y gestiona favoritos, reseñas y privacidad.",
    href: "/profile?section=library",
    icon: Bookmark02Icon,
    title: "Abrir mi biblioteca",
  },
  {
    description: "Revisa los títulos que sigues y sus novedades.",
    href: "/profile?section=following",
    icon: Notification03Icon,
    title: "Ver actividad seguida",
  },
  {
    description: "Actualiza contraseña y verificación en dos pasos.",
    href: "/profile?section=security",
    icon: ShieldUserIcon,
    title: "Proteger mi cuenta",
  },
];

export function ProfileOverviewSection({
  bookmarksPublic,
  reviewsPublic,
  twoFactorEnabled,
}: {
  bookmarksPublic: boolean;
  reviewsPublic: boolean;
  twoFactorEnabled: boolean;
}) {
  return (
    <div className="space-y-5">
      <ProfilePanel className="p-5 sm:p-6">
        <ProfileSectionHeader
          description="Accede rápidamente a las tareas más habituales sin perderte entre ajustes."
          eyebrow="Resumen"
          title="Tu espacio personal"
        />
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.href}>
              <Link
                className="group flex h-full items-start gap-4 rounded-[1.25rem] border border-border/70 bg-background/45 p-4 outline-none transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-muted/25 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transform-none motion-reduce:transition-none"
                href={shortcut.href}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                  <HugeiconsIcon
                    aria-hidden
                    className="size-5"
                    icon={shortcut.icon}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 font-lexend font-semibold">
                    {shortcut.title}
                    <HugeiconsIcon
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                      icon={ArrowRight01Icon}
                    />
                  </span>
                  <span className="mt-1 block text-muted-foreground text-sm leading-5">
                    {shortcut.description}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </ProfilePanel>

      <ProfilePanel className="p-5 sm:p-6">
        <ProfileSectionHeader
          description="Un vistazo a la protección de la cuenta y a lo que otras personas pueden ver."
          eyebrow="Estado"
          title="Privacidad y seguridad"
        />
        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          <StatusItem
            active={bookmarksPublic}
            activeLabel="Públicos"
            inactiveLabel="Privados"
            label="Favoritos"
          />
          <StatusItem
            active={reviewsPublic}
            activeLabel="Públicas"
            inactiveLabel="Privadas"
            label="Reseñas"
          />
          <StatusItem
            active={twoFactorEnabled}
            activeLabel="Activada"
            inactiveLabel="Desactivada"
            label="Verificación en dos pasos"
          />
        </dl>
      </ProfilePanel>
    </div>
  );
}

function StatusItem({
  active,
  activeLabel,
  inactiveLabel,
  label,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  label: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-border/70 bg-background/45 p-4">
      <dt className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {label}
      </dt>
      <dd className="mt-3">
        <Badge
          className={
            active
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-border bg-muted/40 text-muted-foreground"
          }
          variant="outline"
        >
          {active ? activeLabel : inactiveLabel}
        </Badge>
      </dd>
    </div>
  );
}
