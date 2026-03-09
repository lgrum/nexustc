import type { ProfileCrop } from "@repo/shared/profile";
import { Avatar, AvatarFallback, AvatarImage } from "facehash";
import {
  cn,
  getBucketUrl,
  getFacehashProps,
  getProfileImageStyles,
} from "@/lib/utils";

export function ProfileAvatar({
  user,
  className,
}: {
  user: {
    name: string;
    image?: string | null;
    avatar?: {
      objectKey: string;
      crop?: ProfileCrop | null;
    } | null;
    avatarFallbackColor?: string | null;
  };
  className?: string;
}) {
  const avatarObject = user.avatar?.objectKey ?? user.image ?? undefined;

  return (
    <Avatar className={cn("overflow-hidden rounded-full", className)}>
      <AvatarImage
        src={avatarObject ? getBucketUrl(avatarObject) : undefined}
        style={getProfileImageStyles(user.avatar?.crop)}
      />
      <AvatarFallback
        className="rounded-full"
        facehashProps={getFacehashProps(user.avatarFallbackColor)}
        name={user.name}
      />
    </Avatar>
  );
}
