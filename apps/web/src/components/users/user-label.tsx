import { ProfileNameplate } from "@/components/profile/profile-nameplate";

export function UserLabel({
  user,
  className,
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
  };
  className?: string;
  disableTooltip?: boolean;
}) {
  return (
    <ProfileNameplate
      className={className}
      nameClassName={className}
      user={user}
    />
  );
}
