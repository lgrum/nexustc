import {
  Book03Icon,
  GameController03Icon,
  Home07Icon,
  MoreHorizontalCircle01Icon,
  News01Icon,
  StarIcon,
  UserIcon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AuthDialog, AuthDialogContent } from "@/components/auth/auth-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const location = useLocation();

  const isActive = (href: string) => {
    if (href === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(href);
  };

  const isExtrasActive =
    isActive("/chronos") ||
    isActive("/news") ||
    isActive("/profile") ||
    isActive("/auth");

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        "fixed inset-x-0 bottom-0 z-50",
        "bg-background/80 backdrop-blur-md",
        "border-border border-t",
        "pb-[env(safe-area-inset-bottom)]",
        "md:hidden",
        "flex items-center justify-around",
        "h-16 px-2"
      )}
    >
      <NavItem href="/" icon={Home07Icon} label="Inicio" />
      <NavItem href="/juegos" icon={GameController03Icon} label="Juegos" />
      <NavItem href="/comics" icon={Book03Icon} label="Comics" />
      <NavItem href="/vip" icon={StarIcon} label="VIP" />
      <ExtrasNavMenu isActive={isExtrasActive} />
    </nav>
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
        "relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors duration-200",
        isItemActive
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
      to={href}
    >
      {isItemActive && (
        <span className="absolute top-0 left-1/2 h-0.75 w-6 -translate-x-1/2 rounded-full bg-primary" />
      )}
      <HugeiconsIcon className="size-5.5" icon={icon} />
      <span className="font-medium text-[10px]">{label}</span>
    </Link>
  );
}

// oxlint-disable-next-line no-unused-vars
function NavButtonItem({
  href,
  icon,
  label,
}: {
  href: string;
  icon: IconSvgElement;
  label: string;
}) {
  const location = useLocation();

  const isActive =
    href === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(href);

  return (
    <Button
      className={cn(
        "size-14 -translate-y-4 rounded-full border border-primary/35 bg-linear-to-br from-20% from-primary to-80% to-accent text-primary-foreground shadow-[0_14px_34px_-18px_hsl(var(--primary))] transition-all duration-300 hover:scale-[1.03] hover:border-primary/55 hover:shadow-[0_18px_42px_-16px_hsl(var(--primary))] active:scale-[0.98]",
        isActive &&
          "border-white bg-linear-to-br from-primary to-secondary text-white shadow-[0_0_0_1px_hsl(var(--primary)/0.55),0_0_28px_hsl(var(--primary)/0.55),0_20px_48px_-14px_hsl(var(--primary))]"
      )}
      nativeButton={false}
      render={
        <Link
          aria-current={isActive ? "page" : undefined}
          aria-label={label}
          to={href}
        />
      }
      size="icon"
    >
      <HugeiconsIcon
        className={cn(
          "size-6 transition-transform duration-300",
          isActive && "scale-110 text-white"
        )}
        icon={icon}
      />
    </Button>
  );
}

function ExtrasNavMenu({ isActive }: { isActive: boolean }) {
  const { data: auth } = authClient.useSession();
  const navigate = useNavigate();
  const [openAuth, setOpenAuth] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 transition-colors duration-200",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              type="button"
            />
          }
        >
          {isActive && (
            <span className="absolute top-0 left-1/2 h-0.75 w-6 -translate-x-1/2 rounded-full bg-primary" />
          )}
          <HugeiconsIcon
            className="size-5.5"
            icon={MoreHorizontalCircle01Icon}
          />
          <span className="font-medium text-[10px]">Extras</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" sideOffset={8}>
          <DropdownMenuItem onClick={() => navigate({ to: "/chronos" })}>
            <HugeiconsIcon icon={Clock01Icon} />
            TheChronos
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate({ to: "/news" })}>
            <HugeiconsIcon icon={News01Icon} />
            Noticias
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate({ to: "/tutorials" })}>
            <HugeiconsIcon icon={Book03Icon} />
            Tutoriales
          </DropdownMenuItem>
          {auth?.session ? (
            <DropdownMenuItem onClick={() => navigate({ to: "/profile" })}>
              <HugeiconsIcon icon={UserIcon} />
              Perfil
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setOpenAuth(true)}>
              <HugeiconsIcon icon={UserIcon} />
              Login
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AuthDialog onOpenChange={setOpenAuth} open={openAuth}>
        <AuthDialogContent />
      </AuthDialog>
    </>
  );
}
