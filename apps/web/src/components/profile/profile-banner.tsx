import type { ProfileCrop } from "@repo/shared/profile";
import { cn, getBucketUrl, getProfileImageStyles } from "@/lib/utils";

export function ProfileBanner({
  banner,
  className,
}: {
  banner: {
    mode: "color" | "image";
    color: string;
    asset: {
      objectKey: string;
      crop?: ProfileCrop | null;
    } | null;
  };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative h-36 w-full overflow-hidden rounded-[2rem] border border-border bg-card sm:h-44",
        className
      )}
      style={{ backgroundColor: banner.color }}
    >
      {banner.mode === "image" && banner.asset ? (
        <img
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover opacity-90"
          src={getBucketUrl(banner.asset.objectKey)}
          style={getProfileImageStyles(banner.asset.crop)}
        />
      ) : null}
      <div className="absolute inset-0 bg-linear-to-t from-background/85 via-background/30 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.28),transparent_30%)]" />
    </div>
  );
}
