import {
  PATRON_TIER_GRADIENTS,
  PATRON_TIER_PROFILE_BADGES,
} from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";

import { ProfileEmblemStrip } from "@/components/profile/profile-emblem-strip";
import { ProfileRoleBadges } from "@/components/profile/profile-role-badges";
import { cn } from "@/lib/utils";

type ProfileRole = {
  id: string;
  slug: string;
  name: string;
  description: string;
  priority: number;
  isExclusive: boolean;
  isActive?: boolean;
  isVisible?: boolean;
  visualConfig: {
    baseColor: string;
    accentColor: string | null;
    gradient?: string | null;
    textColor: string;
    glowColor: string | null;
  };
  icon?: { objectKey: string; isAnimated: boolean } | null;
  iconAsset?: { objectKey: string; isAnimated: boolean } | null;
  overlay?: { objectKey: string; isAnimated: boolean } | null;
  overlayAsset?: { objectKey: string; isAnimated: boolean } | null;
};

type ProfileRoleAssignment = {
  roleDefinition: ProfileRole | null;
};

type ProfileEmblem = {
  id: string;
  slug: string;
  name: string;
  tooltip: string;
  icon?: { objectKey: string; isAnimated: boolean } | null;
};

export type ProfileNameplateUser = {
  name: string;
  patronBadge?: string | null;
  patronTier?: PatronTier | null;
  profileRoles?: ProfileRole[];
  profileRoleAssignments?: ProfileRoleAssignment[];
  profileEmblems?: ProfileEmblem[];
};

function clampVisibleRoles(roles: ProfileRole[]) {
  const sorted = roles.toSorted(
    (first, second) => second.priority - first.priority
  );
  const topExclusive = sorted.find((role) => role.isExclusive);

  return topExclusive ? [topExclusive] : sorted;
}

function getVisibleProfileRoles(user: ProfileNameplateUser) {
  if (user.profileRoles) {
    return user.profileRoles;
  }

  return clampVisibleRoles(
    user.profileRoleAssignments?.flatMap((assignment) => {
      const role = assignment.roleDefinition;

      if (!(role && role.isActive !== false && role.isVisible !== false)) {
        return [];
      }

      return [role];
    }) ?? []
  );
}

function getPatronTierRole(
  tier: PatronTier,
  badgeName: string | null | undefined,
  gradient: string | null
) {
  if (tier === "none") {
    return null;
  }

  const name = badgeName ?? PATRON_TIER_PROFILE_BADGES[tier];

  if (!name) {
    return null;
  }

  return {
    description: "Badge de perfil de Patreon.",
    id: `patreon-${tier}`,
    isExclusive: false,
    name,
    priority: Number.MAX_SAFE_INTEGER,
    slug: `patreon-${tier}`,
    visualConfig: {
      accentColor: null,
      baseColor: "transparent",
      glowColor: null,
      gradient,
      textColor: "#ffffff",
    },
  } satisfies ProfileRole;
}

export function ProfileNameplate({
  user,
  className,
  nameClassName,
  showEmblems = false,
  showProfileRoles = false,
}: {
  user: ProfileNameplateUser;
  className?: string;
  nameClassName?: string;
  showEmblems?: boolean;
  showProfileRoles?: boolean;
}) {
  const profileRoles = getVisibleProfileRoles(user);
  const patronTier = user.patronTier ?? "none";
  const nameGradient =
    patronTier === "none" ? null : PATRON_TIER_GRADIENTS[patronTier];
  const patronTierRole = getPatronTierRole(
    patronTier,
    user.patronBadge,
    nameGradient
  );
  const badges = [
    ...(patronTierRole ? [patronTierRole] : []),
    ...(showProfileRoles ? profileRoles : []),
  ];

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="inline-flex min-w-0 items-center flex-row gap-2">
        <p
          className={cn(
            "truncate font-semibold text-lg",
            nameClassName,
            nameGradient && "bg-clip-text text-transparent"
          )}
          style={nameGradient ? { backgroundImage: nameGradient } : undefined}
        >
          {user.name}
        </p>
        <ProfileRoleBadges roles={badges} />
      </div>
      {showEmblems ? (
        <ProfileEmblemStrip emblems={user.profileEmblems} />
      ) : null}
    </div>
  );
}
