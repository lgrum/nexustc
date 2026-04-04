import {
  Home01Icon,
  Clock01Icon,
  CircleLockIcon,
  Search01Icon,
  Book03Icon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useLocation } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage, Facehash } from "facehash";
import { motion } from "motion/react";
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
  { href: "/vip", icon: StarIcon, label: "VIP", search: {} },
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
  { href: "/chronos", icon: Clock01Icon, label: "Chronos", search: {} },
] as const;

export function Header() {
  const auth = authClient.useSession();
  const user = auth.data?.user;

  return (
    <header className="relative z-50 w-full">
      <div className="grid w-full grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_1fr] items-center px-4 py-3">
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
        "relative flex min-h-11 min-w-11 flex-row items-center justify-center gap-1 rounded-lg px-1 py-1 transition-colors duration-200",
        isItemActive
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
      to={href}
    >
      {isItemActive && (
        <motion.span
          layoutId="nav-highlight"
          className="absolute bottom-0 left-1/2 h-0.75 w-6 -translate-x-1/2 rounded-full bg-primary"
        />
      )}
      <HugeiconsIcon className="size-4" icon={icon} />
      <span className="tracking-wide text-base">{label}</span>
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
