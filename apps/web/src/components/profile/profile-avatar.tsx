import { Avatar, AvatarFallback, AvatarImage } from "facehash";
import { cn, getBucketUrl, getFacehashProps } from "@/lib/utils";

export function ProfileAvatar({
  user,
  className,
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
}) {
  const avatarObject = user.avatar?.objectKey ?? user.image ?? undefined;

  return (
    <Avatar className={cn("overflow-hidden rounded-full", className)}>
      <AvatarImage
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
