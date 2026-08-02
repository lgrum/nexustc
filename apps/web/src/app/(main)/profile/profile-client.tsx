"use client";

import {
  Bookmark02Icon,
  Home01Icon,
  Image01Icon,
  LogoutSquare01Icon,
  Notification03Icon,
  ShieldUserIcon,
  UserIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { DEFAULT_APP_THEME_ID } from "@repo/shared/app-theme";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { AccountSection } from "@/components/profile/account-section";
import { AppearanceSection } from "@/components/profile/appearance-section";
import { FollowingSection } from "@/components/profile/following-section";
import { NotificationSettingsSection } from "@/components/profile/notification-settings-section";
import { ProfileIdentity } from "@/components/profile/profile-identity";
import { ProfileLibrarySection } from "@/components/profile/profile-library-section";
import { ProfileOverviewSection } from "@/components/profile/profile-overview-section";
import { SecuritySection } from "@/components/profile/security-section";
import { ThemeSection } from "@/components/profile/theme-section";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { getAppThemeQueryOptions } from "@/lib/app-theme-query";
import { authClient } from "@/lib/auth-client";
import { orpc, queryClient } from "@/lib/orpc";
import { cn } from "@/lib/utils";

import type { ProfileSection } from "./page";

type NavigationItem = {
  icon: IconSvgElement;
  label: string;
  value: ProfileSection;
};

const NAVIGATION: NavigationItem[] = [
  { icon: Home01Icon, label: "Resumen", value: "overview" },
  { icon: Image01Icon, label: "Apariencia", value: "appearance" },
  { icon: Image01Icon, label: "Tema", value: "theme" },
  { icon: Bookmark02Icon, label: "Biblioteca", value: "library" },
  { icon: Notification03Icon, label: "Siguiendo", value: "following" },
  {
    icon: Notification03Icon,
    label: "Notificaciones",
    value: "notifications",
  },
  { icon: UserIcon, label: "Cuenta", value: "account" },
  { icon: ShieldUserIcon, label: "Seguridad", value: "security" },
];

export function ProfileClient({
  activeSection,
  user,
}: {
  activeSection: ProfileSection;
  user: (typeof authClient.$Infer.Session)["user"];
}) {
  return <AuthenticatedProfile activeSection={activeSection} user={user} />;
}

function AuthenticatedProfile({
  activeSection,
  user,
}: {
  activeSection: ProfileSection;
  user: (typeof authClient.$Infer.Session)["user"];
}) {
  const { data } = useSuspenseQuery(orpc.profile.getMySettings.queryOptions());
  const { data: themeState } = useSuspenseQuery(
    getAppThemeQueryOptions(user.id)
  );
  const router = useRouter();
  const { setTheme } = useTheme();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const identity =
    data.summary ??
    ({
      avatar: null,
      avatarFallbackColor: user.avatarFallbackColor,
      image: user.image,
      name: user.name,
      profileEmblems: [],
      profileRoles: [],
    } as const);
  const visibleNavigation = themeState.catalogVisible
    ? NAVIGATION
    : NAVIGATION.filter(({ value }) => value !== "theme");
  const visibleSection =
    activeSection === "theme" && !themeState.catalogVisible
      ? "overview"
      : activeSection;

  const handleSignOut = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    trackEvent("logout_clicked", { source: "profile" });

    try {
      const result = await authClient.signOut();
      if (result.error) {
        toast.error(result.error.message);
        setIsSigningOut(false);
        return;
      }

      queryClient.clear();
      setTheme(DEFAULT_APP_THEME_ID);
      router.replace("/");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos cerrar la sesión."
      );
      setIsSigningOut(false);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-3 py-5 pb-12 sm:px-4 md:py-8">
      <header className="relative overflow-hidden rounded-[2rem] border border-primary/15 bg-card/80 p-5 shadow-lg shadow-black/10 sm:p-6">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,var(--primary),transparent_38%)] opacity-15"
        />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <ProfileIdentity nameAs="h1" user={identity}>
            <p className="text-sm leading-5">
              Administra tu identidad, biblioteca, conexiones y seguridad desde
              un solo lugar.
            </p>
          </ProfileIdentity>
          <div className="flex flex-wrap gap-2">
            <Button
              nativeButton={false}
              render={<Link href={`/user/${user.id}`} />}
              variant="outline"
            >
              <HugeiconsIcon aria-hidden className="size-4" icon={ViewIcon} />
              Ver perfil público
            </Button>
            <Button
              disabled={isSigningOut}
              onClick={handleSignOut}
              variant="ghost"
            >
              <HugeiconsIcon
                aria-hidden
                className="size-4"
                icon={LogoutSquare01Icon}
              />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <nav
        aria-label="Secciones del perfil"
        className="flex gap-2 overflow-x-auto rounded-[1.25rem] border border-border/70 bg-card/65 p-2 lg:hidden"
      >
        {visibleNavigation.map((item) => (
          <ProfileNavigationLink
            active={visibleSection === item.value}
            item={item}
            key={item.value}
          />
        ))}
      </nav>

      <div className="grid items-start gap-5 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
        <aside className="sticky top-4 hidden rounded-[1.5rem] border border-border/70 bg-card/65 p-2 lg:block">
          <nav
            aria-label="Secciones del perfil"
            className="flex flex-col gap-1"
          >
            {visibleNavigation.map((item) => (
              <ProfileNavigationLink
                active={visibleSection === item.value}
                item={item}
                key={item.value}
              />
            ))}
          </nav>
        </aside>

        <div className="min-w-0">
          {visibleSection === "overview" ? (
            <ProfileOverviewSection
              bookmarksPublic={data.settings.visibility.favorites}
              reviewsPublic={data.settings.visibility.reviews}
              twoFactorEnabled={Boolean(user.twoFactorEnabled)}
            />
          ) : null}
          {visibleSection === "appearance" ? <AppearanceSection /> : null}
          {visibleSection === "theme" ? (
            <ThemeSection state={themeState} userId={user.id} />
          ) : null}
          {visibleSection === "library" ? (
            <ProfileLibrarySection visibility={data.settings.visibility} />
          ) : null}
          {visibleSection === "following" ? <FollowingSection /> : null}
          {visibleSection === "notifications" ? (
            <NotificationSettingsSection
              commentReplies={data.settings.notifications.commentReplies}
            />
          ) : null}
          {visibleSection === "account" ? (
            <AccountSection userId={user.id} />
          ) : null}
          {visibleSection === "security" ? (
            <SecuritySection
              email={user.email}
              isSigningOut={isSigningOut}
              onSignOut={handleSignOut}
              twoFactorEnabled={Boolean(user.twoFactorEnabled)}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}

function ProfileNavigationLink({
  active,
  item,
}: {
  active: boolean;
  item: NavigationItem;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 py-2 font-medium text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 lg:w-full",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
      href={`/profile?section=${item.value}`}
      onClick={() =>
        trackEvent("profile_tab_changed", {
          tab: item.value,
        })
      }
    >
      <HugeiconsIcon aria-hidden className="size-4 shrink-0" icon={item.icon} />
      {item.label}
    </Link>
  );
}
