import { Avatar, AvatarFallback, AvatarImage } from "facehash";

import { cn, getBucketUrl, getFacehashProps } from "@/lib/utils";

export function ProfileAvatar({
  user,
  className,
  decorative = false,
}: {
  user: {
    name: string;
    image?: string | null;
    avatar?: {
      objectKey: string;
    } | null;
    avatarFallbackColor?: string | null;
  };
  className?: string;
  decorative?: boolean;
}) {
  const avatarObject = user.avatar?.objectKey ?? user.image ?? undefined;

  return (
    <Avatar
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Avatar de ${user.name}`}
      className={cn("overflow-hidden rounded-full", className)}
      role={decorative ? undefined : "img"}
    >
      <AvatarImage
        alt=""
        src={avatarObject ? getBucketUrl(avatarObject) : undefined}
      />
      <AvatarFallback
        className="rounded-full"
        facehashProps={getFacehashProps(user.avatarFallbackColor)}
        name={user.name}
      />
    </Avatar>
  );
}
