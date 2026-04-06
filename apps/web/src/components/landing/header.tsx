import {
  Home01Icon,
  Clock01Icon,
  CircleLockIcon,
  News01Icon,
  Search01Icon,
  Book03Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useLocation } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage, Facehash } from "facehash";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { cn, defaultFacehashProps, getBucketUrl } from "@/lib/utils";

import {
  AuthDialog,
  AuthDialogContent,
  AuthDialogTrigger,
} from "../auth/auth-dialog";
import { Logo } from "../logo";
import { NotificationCenter } from "../notifications/notification-center";
import { Button } from "../ui/button";

const navItems = [
  { href: "/", icon: Home01Icon, label: "Inicio", search: {} },
  {
    href: "/search",
    icon: Search01Icon,
    label: "Buscar",
    search: {},
  },
  {
    href: "/tutorials",
    icon: Book03Icon,
    label: "Tutoriales",
    search: {},
  },
  { href: "/vip", icon: StarIcon, label: "VIP", search: {} },
  { href: "/news", icon: News01Icon, label: "Noticias", search: {} },
  { href: "/chronos", icon: Clock01Icon, label: "Chronos", search: {} },
] as const;

export function Header() {
  const auth = authClient.useSession();
  const user = auth.data?.user;

  return (
    <header className="relative z-50 w-full">
      <div className="grid w-full grid-cols-[1fr_auto] items-center px-4 py-3">
        <div className="flex gap-12 items-center">
          <Link to="/">
            <Logo />
          </Link>
          <div className="hidden md:block">
            <div className="flex items-center gap-4">
              {navItems.map((item) => (
                <NavItem
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {user && user.role !== "user" && (
            <Button nativeButton={false} render={<Link to="/admin" />}>
              <HugeiconsIcon icon={CircleLockIcon} />
              <span>Admin</span>
            </Button>
          )}
          <NotificationCenter />
          <ProfileNavItem />
        </div>
      </div>
    </header>
  );
}

function NavItem({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: IconSvgElement;
  active?: boolean;
}) {
  const location = useLocation();

  const isItemActive =
    active ??
    (href === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(href));

  return (
    <Link
      aria-current={isItemActive ? "page" : undefined}
      className={cn(
        "relative flex flex-row items-center justify-center gap-1 rounded-lg px-1 py-1 transition-colors duration-200",
        "text-sm font-bold uppercase tracking-[0.2em] text-white/50 hover:text-primary transition-all relative group py-2",
        isItemActive
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
      to={href}
    >
      <HugeiconsIcon className="size-4" icon={icon} />
      <span className="tracking-wider">{label}</span>
      <span
        className={cn(
          "absolute bottom-0 left-0 w-0 h-0.5 bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.8)] transition-all group-hover:w-full",
          isItemActive && "w-full"
        )}
      />
    </Link>
  );
}

function ProfileNavItem() {
  const { data: auth } = authClient.useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isAuthed = mounted && Boolean(auth?.session);
  const href = isAuthed ? "/profile" : "/auth";
  const displayName = isAuthed ? (auth?.user.name ?? "cronos") : "cronos";
  const imageSrc = isAuthed
    ? auth?.user.image
      ? getBucketUrl(auth.user.image)
      : undefined
    : undefined;

  if (!isAuthed) {
    return (
      <AuthDialog>
        <AuthDialogTrigger
          nativeButton={false}
          render={
            <Facehash
              name=""
              {...defaultFacehashProps}
              className="size-8 rounded-full"
            />
          }
        />
        <AuthDialogContent />
      </AuthDialog>
    );
  }

  return (
    <Link to={href}>
      <Avatar className="size-8 rounded-full">
        <AvatarImage src={imageSrc} />
        <AvatarFallback
          className="rounded-full"
          facehashProps={defaultFacehashProps}
          name={displayName}
        />
      </Avatar>
    </Link>
  );
}
