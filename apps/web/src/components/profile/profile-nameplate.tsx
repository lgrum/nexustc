import { ProfileEmblemStrip } from "@/components/profile/profile-emblem-strip";
import { ProfileRoleBadges } from "@/components/profile/profile-role-badges";
import { cn } from "@/lib/utils";

export function ProfileNameplate({
  user,
  className,
  nameClassName,
  showEmblems = false,
}: {
  user: {
    name: string;
    profileRoles?: {
      id: string;
      slug: string;
      name: string;
      description: string;
      priority: number;
      isExclusive: boolean;
      visualConfig: {
        baseColor: string;
        accentColor: string | null;
        textColor: string;
        glowColor: string | null;
      };
      icon?: { objectKey: string; isAnimated: boolean } | null;
      overlay?: { objectKey: string; isAnimated: boolean } | null;
    }[];
    profileEmblems?: {
      id: string;
      slug: string;
      name: string;
      tooltip: string;
      visualConfig: {
        glowColor: string | null;
        backgroundColor: string | null;
      };
      icon?: { objectKey: string; isAnimated: boolean } | null;
    }[];
  };
  className?: string;
  nameClassName?: string;
  showEmblems?: boolean;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex min-w-0 flex-col gap-2">
        <p className={cn("truncate font-semibold", nameClassName)}>
          {user.name}
        </p>
        <ProfileRoleBadges roles={user.profileRoles} />
      </div>
      {showEmblems ? (
        <ProfileEmblemStrip emblems={user.profileEmblems} />
      ) : null}
    </div>
  );
}
