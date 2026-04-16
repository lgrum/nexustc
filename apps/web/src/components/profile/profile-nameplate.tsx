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

export function ProfileNameplate({
  user,
  className,
  nameClassName,
  showEmblems = false,
}: {
  user: ProfileNameplateUser;
  className?: string;
  nameClassName?: string;
  showEmblems?: boolean;
}) {
  const profileRoles = getVisibleProfileRoles(user);

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="inline-flex min-w-0 items-center flex-row gap-2">
        <p className={cn("truncate font-semibold", nameClassName)}>
          {user.name}
        </p>
        <ProfileRoleBadges roles={profileRoles} />
      </div>
      {showEmblems ? (
        <ProfileEmblemStrip emblems={user.profileEmblems} />
      ) : null}
    </div>
  );
}
