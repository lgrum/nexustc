import { CircleLockIcon } from "@hugeicons/core-free-icons";
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
  { href: "/", label: "Inicio", search: {} },
  { href: "/juegos", label: "Juegos", search: {} },
  { href: "/comics", label: "Comics", search: {} },
  { href: "/tutorials", label: "Tutoriales", search: {} },
  { href: "/vip", label: "VIP", search: {} },
  { href: "/news", label: "Noticias", search: {} },
  { href: "/chronos", label: "TheChronos", search: {} },
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
                <NavItem key={item.href} href={item.href} label={item.label} />
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
  active,
}: {
  href: string;
  label: string;
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
        "relative flex flex-row items-center justify-center rounded-lg px-1 py-2 transition-colors duration-200",
        "text-base tracking-[0.2em] hover:text-primary transition-all relative group",
        isItemActive
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
      to={href}
    >
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
