import type {
  EffectiveProfileManifest,
  ProfileDecorationSlot,
  ProfileDecorationVisual,
} from "@repo/shared/profile-customization";
import type { CSSProperties, ReactNode } from "react";

import { cn, getBucketUrl } from "@/lib/utils";

type DecorationStyle = CSSProperties & Record<`--${string}`, string>;

const slotLabels: Record<ProfileDecorationSlot, string> = {
  "ambient-effect": "Efecto ambiental",
  "avatar-frame": "Marco de avatar",
  "nameplate-effect": "Efecto de nombre",
  "profile-frame": "Marco de perfil",
};

function effectClass(decoration: ProfileDecorationVisual) {
  if (decoration.effectKey === "orbit-sparkles") {
    return "animate-spin [animation-duration:14s]";
  }
  if (decoration.effectKey === "soft-pulse") {
    return "animate-pulse [animation-duration:3.5s]";
  }
  return decoration.effectKey === "shimmer" ? "opacity-70" : undefined;
}

function DecorationLayer({
  decoration,
  forceReducedMotion,
}: {
  decoration: ProfileDecorationVisual;
  forceReducedMotion: boolean;
}) {
  if (
    decoration.slot === "avatar-frame" ||
    decoration.slot === "nameplate-effect"
  ) {
    return null;
  }
  const omitForReducedMotion = decoration.reducedMotion?.behavior === "omit";
  if (forceReducedMotion && omitForReducedMotion) {
    return null;
  }
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-0",
        decoration.slot === "profile-frame"
          ? "inset-1 rounded-[2rem] border-2 border-primary/65 shadow-[inset_0_0_2rem_color-mix(in_oklab,var(--primary)_30%,transparent)]"
          : "inset-0 overflow-hidden opacity-35",
        forceReducedMotion && decoration.reducedMotion?.behavior === "static"
          ? undefined
          : effectClass(decoration),
        omitForReducedMotion && "motion-reduce:hidden",
        decoration.reducedMotion?.behavior === "static" &&
          "motion-reduce:animate-none"
      )}
      data-decoration-slot={decoration.slot}
      title={slotLabels[decoration.slot]}
      style={
        decoration.mediaAssetKey
          ? {
              backgroundImage: `url("${getBucketUrl(decoration.mediaAssetKey)}")`,
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              backgroundSize: "cover",
            }
          : undefined
      }
    />
  );
}

export function ProfileDecorationSurface({
  children,
  className,
  decorations,
  forceReducedMotion = false,
}: {
  children: ReactNode;
  className?: string;
  decorations: EffectiveProfileManifest["decorations"];
  forceReducedMotion?: boolean;
}) {
  const avatar = decorations.find(
    ({ slot, reducedMotion }) =>
      slot === "avatar-frame" &&
      !(forceReducedMotion && reducedMotion?.behavior === "omit")
  );
  const nameplate = decorations.find(
    ({ slot, reducedMotion }) =>
      slot === "nameplate-effect" &&
      !(forceReducedMotion && reducedMotion?.behavior === "omit")
  );
  const style: DecorationStyle = {};
  if (avatar?.mediaAssetKey) {
    style["--profile-avatar-frame"] =
      `url("${getBucketUrl(avatar.mediaAssetKey)}")`;
  }
  if (nameplate?.mediaAssetKey) {
    style["--profile-nameplate-effect"] =
      `url("${getBucketUrl(nameplate.mediaAssetKey)}")`;
  }

  return (
    <div
      className={cn(
        "relative isolate [&>*:not([data-decoration-slot])]:relative [&>*:not([data-decoration-slot])]:z-10",
        avatar &&
          "[&_[data-profile-avatar]]:ring-4 [&_[data-profile-avatar]]:ring-primary/60 [&_[data-profile-avatar-decoration]]:after:pointer-events-none [&_[data-profile-avatar-decoration]]:after:absolute [&_[data-profile-avatar-decoration]]:after:-inset-3 [&_[data-profile-avatar-decoration]]:after:bg-[image:var(--profile-avatar-frame)] [&_[data-profile-avatar-decoration]]:after:bg-contain [&_[data-profile-avatar-decoration]]:after:bg-center [&_[data-profile-avatar-decoration]]:after:bg-no-repeat",
        !forceReducedMotion &&
          avatar?.effectKey === "orbit-sparkles" &&
          "[&_[data-profile-avatar-decoration]]:after:animate-spin [&_[data-profile-avatar-decoration]]:after:[animation-duration:14s]",
        !forceReducedMotion &&
          avatar?.effectKey === "soft-pulse" &&
          "[&_[data-profile-avatar-decoration]]:after:animate-pulse [&_[data-profile-avatar-decoration]]:after:[animation-duration:3.5s]",
        avatar?.reducedMotion?.behavior === "omit" &&
          "motion-reduce:[&_[data-profile-avatar]]:ring-0 motion-reduce:[&_[data-profile-avatar-decoration]]:after:hidden",
        avatar?.reducedMotion?.behavior === "static" &&
          "motion-reduce:[&_[data-profile-avatar-decoration]]:after:animate-none",
        nameplate?.mediaAssetKey &&
          "[&_[data-profile-name]]:relative [&_[data-profile-name]]:isolate [&_[data-profile-name]]:after:pointer-events-none [&_[data-profile-name]]:after:absolute [&_[data-profile-name]]:after:-inset-2 [&_[data-profile-name]]:after:-z-10 [&_[data-profile-name]]:after:bg-[image:var(--profile-nameplate-effect)] [&_[data-profile-name]]:after:bg-cover [&_[data-profile-name]]:after:bg-center",
        nameplate?.effectKey === "shimmer" &&
          "[&_[data-profile-name]]:drop-shadow-[0_0_0.65rem_color-mix(in_oklab,var(--primary)_55%,transparent)]",
        !forceReducedMotion &&
          nameplate?.effectKey === "soft-pulse" &&
          "[&_[data-profile-name]]:animate-pulse motion-reduce:[&_[data-profile-name]]:animate-none",
        nameplate?.fontKey === "lexend" &&
          "[&_[data-profile-name]]:font-lexend",
        nameplate?.fontKey === "system" && "[&_[data-profile-name]]:font-sans",
        nameplate?.reducedMotion?.behavior === "omit" &&
          "motion-reduce:[&_[data-profile-name]]:animate-none motion-reduce:[&_[data-profile-name]]:font-sans motion-reduce:[&_[data-profile-name]]:drop-shadow-none motion-reduce:[&_[data-profile-name]]:after:hidden",
        className
      )}
      data-profile-decorations
      style={style}
    >
      {decorations.map((decoration) => (
        <DecorationLayer
          decoration={decoration}
          forceReducedMotion={forceReducedMotion}
          key={decoration.slot}
        />
      ))}
      {children}
    </div>
  );
}
