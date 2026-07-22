"use client";

import { ProfileAvatar } from "@/components/profile/profile-avatar";
import type { ProfileNameplateUser } from "@/components/profile/profile-nameplate";
import { ProfileNameplate } from "@/components/profile/profile-nameplate";
import { cn } from "@/lib/utils";

type ProfileIdentityUser = ProfileNameplateUser & {
  avatar?: { objectKey: string } | null;
  avatarFallbackColor?: string | null;
  image?: string | null;
};

export function ProfileIdentity({
  user,
  avatarClassName,
  children,
  className,
  density = "compact",
  nameAs = "p",
}: {
  user: ProfileIdentityUser;
  avatarClassName?: string;
  children?: React.ReactNode;
  className?: string;
  density?: "compact" | "public";
  nameAs?: "h1" | "h2" | "h3" | "p";
}) {
  const isPublic = density === "public";

  return (
    <div
      className={cn(
        "flex min-w-0",
        isPublic
          ? "flex-col items-start gap-5 sm:flex-row sm:items-end"
          : "items-center gap-3",
        className
      )}
    >
      <ProfileAvatar
        className={cn(
          "shrink-0 border-background shadow-xl",
          isPublic ? "size-28 border-4 sm:size-32" : "size-14 border-2",
          avatarClassName
        )}
        user={user}
      />
      <div className={cn("min-w-0 flex-1", isPublic && "pb-1")}>
        <ProfileNameplate
          nameAs={nameAs}
          nameClassName={cn(
            isPublic
              ? "display-heading text-4xl leading-none sm:text-5xl md:text-6xl"
              : "font-lexend text-xl font-bold"
          )}
          showEmblems
          showProfileRoles
          user={user}
        />
        {children ? (
          <div
            className={cn("text-muted-foreground", isPublic ? "mt-4" : "mt-2")}
          >
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
