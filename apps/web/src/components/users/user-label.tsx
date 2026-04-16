import { ProfileNameplate } from "@/components/profile/profile-nameplate";
import type { ProfileNameplateUser } from "@/components/profile/profile-nameplate";

export function UserLabel({
  user,
  className,
}: {
  user: ProfileNameplateUser;
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
