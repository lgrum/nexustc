import { CircleLockIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useLocation } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage, Facehash } from "facehash";
import {
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import { useEffect, useRef, useState } from "react";

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
          <HeaderNav />
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

const CENTER_SPRING = { damping: 52, stiffness: 600 } as const;
const WIDTH_SPRING = { damping: 46, stiffness: 440 } as const;
const FADE_OUT = { duration: 0.18, ease: "easeOut" } as const;
const FADE_IN = { duration: 0.12, ease: "easeOut" } as const;

function HeaderNav() {
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLAnchorElement>());

  const activeHref =
    navItems.find((item) =>
      item.href === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(item.href)
    )?.href ?? null;

  // Imperative motion values — written directly from mouse events, zero React
  // state in the hot path so the blob tracks the cursor at raw event rate.
  const centerTarget = useMotionValue(0);
  const widthTarget = useMotionValue(0);
  const opacity = useMotionValue(0);

  const centerSpring = useSpring(centerTarget, CENTER_SPRING);
  const widthSpring = useSpring(widthTarget, WIDTH_SPRING);

  // Velocity-driven stretch: fast movement scales the blob horizontally,
  // settled state leaves it at scaleX 1. This is the "liquid" feel, sourced
  // entirely from how fast the spring is traveling.
  const velocity = useVelocity(centerSpring);
  const scaleX = useTransform(velocity, (v) =>
    Math.min(1 + Math.abs(v) / 3000, 1.2)
  );
  // Origin hugs the trailing side so the stretch trails behind the direction
  // of motion instead of puffing outward symmetrically.
  const transformOrigin = useTransform(velocity, (v) =>
    v >= 0 ? "0% 50%" : "100% 50%"
  );

  const blobX = useTransform(() => centerSpring.get() - widthSpring.get() / 2);

  const currentHrefRef = useRef<string | null>(null);
  const isVisibleRef = useRef(false);

  const handleMouseMove = (clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    if (clientY < containerRect.top || clientY > containerRect.bottom) {
      return;
    }

    // Nearest-center hit test — the blob always targets a real item, so the
    // gap between items doesn't produce a null/blank state.
    let nearestHref: string | null = null;
    let nearestCenter = 0;
    let nearestWidth = 0;
    let nearestDist = Number.POSITIVE_INFINITY;
    for (const [href, el] of itemRefs.current) {
      const rect = el.getBoundingClientRect();
      const center = (rect.left + rect.right) / 2;
      const dist = Math.abs(clientX - center);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestHref = href;
        nearestCenter = center - containerRect.left;
        nearestWidth = rect.width;
      }
    }
    if (nearestHref === null) {
      return;
    }

    if (!isVisibleRef.current) {
      // Fresh appearance — jump past the spring so the fade-in reveals the
      // blob exactly on the target item (no flying in from elsewhere).
      centerTarget.jump(nearestCenter);
      widthTarget.jump(nearestWidth);
      centerSpring.jump(nearestCenter);
      widthSpring.jump(nearestWidth);
      isVisibleRef.current = true;
      animate(opacity, 1, FADE_IN);
    } else if (nearestHref !== currentHrefRef.current) {
      // Target changed — useSpring continuously tracks targetMV, so updating
      // them is all we need. Spring preserves velocity across updates.
      centerTarget.set(nearestCenter);
      widthTarget.set(nearestWidth);
    }
    currentHrefRef.current = nearestHref;
  };

  const handleMouseLeave = () => {
    isVisibleRef.current = false;
    currentHrefRef.current = null;
    animate(opacity, 0, FADE_OUT);
  };

  return (
    <div
      className="relative hidden md:block"
      onMouseLeave={handleMouseLeave}
      onMouseMove={(e) => handleMouseMove(e.clientX, e.clientY)}
      ref={containerRef}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-0 rounded-xl border border-primary/30 bg-primary/15 shadow-[0_0_24px_-4px] shadow-primary/40 backdrop-blur-[2px]"
        style={{
          opacity,
          scaleX,
          transformOrigin,
          width: widthSpring,
          x: blobX,
        }}
      />
      <div className="relative flex items-center gap-4">
        {navItems.map((item) => (
          <NavItem
            href={item.href}
            isActive={activeHref === item.href}
            key={item.href}
            label={item.label}
            ref={(el) => {
              if (el) {
                itemRefs.current.set(item.href, el);
              } else {
                itemRefs.current.delete(item.href);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

function NavItem({
  href,
  isActive,
  label,
  ref,
}: {
  href: string;
  isActive: boolean;
  label: string;
  ref: React.Ref<HTMLAnchorElement>;
}) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "relative z-10 rounded-lg px-3 py-2 text-base tracking-wider transition-colors duration-200",
        isActive
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
      ref={ref}
      to={href}
    >
      {label}
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
