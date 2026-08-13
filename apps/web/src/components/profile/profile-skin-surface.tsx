import type { EffectiveProfileManifest } from "@repo/shared/profile-customization";
import type { CSSProperties, ReactNode } from "react";

import { cn, getBucketUrl } from "@/lib/utils";

type Skin = EffectiveProfileManifest["skin"];
type SkinProperties = CSSProperties & Record<`--${string}`, string>;

function alphaHex(color: string, opacity: number) {
  return `${color}${Math.round(opacity * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

function backgroundImage(skin: Skin) {
  const base =
    skin.tokens.background.kind === "solid"
      ? `linear-gradient(${skin.tokens.background.color}, ${skin.tokens.background.color})`
      : `linear-gradient(${skin.tokens.background.angle}deg, ${skin.tokens.background.stops
          .map(({ color, position }) => `${color} ${position}%`)
          .join(", ")})`;
  return skin.backgroundAssetKey
    ? `url("${getBucketUrl(skin.backgroundAssetKey)}"), ${base}`
    : base;
}

export function getProfileSkinStyle(skin: Skin): SkinProperties {
  const radius = { round: "1.75rem", sharp: "0.25rem", soft: "1rem" }[
    skin.tokens.radius
  ];
  const shadow = {
    none: "none",
    soft: "0 18px 45px rgb(0 0 0 / 0.18)",
    strong: "0 24px 70px rgb(0 0 0 / 0.38)",
  }[skin.tokens.shadow];
  return {
    "--background":
      skin.tokens.background.kind === "solid"
        ? skin.tokens.background.color
        : skin.tokens.showcaseSurface,
    "--border": skin.tokens.borderColor,
    "--card": alphaHex(
      skin.tokens.showcaseSurface,
      skin.tokens.showcaseOpacity
    ),
    "--card-foreground": skin.tokens.foreground,
    "--foreground": skin.tokens.foreground,
    "--muted-foreground": skin.tokens.mutedForeground,
    "--primary": skin.tokens.accent,
    "--profile-border-width": {
      medium: "2px",
      none: "0px",
      thin: "1px",
    }[skin.tokens.borderWidth],
    "--profile-radius": radius,
    "--profile-shadow": shadow,
    "--ring": skin.tokens.focus,
    backgroundImage: backgroundImage(skin),
    backgroundPosition: "center",
    backgroundSize: "cover",
    color: skin.tokens.foreground,
  };
}

export function ProfileSkinSurface({
  as = "div",
  children,
  className,
  skin,
}: {
  as?: "div" | "main";
  children: ReactNode;
  className?: string;
  skin: Skin;
}) {
  const Component = as;
  return (
    <Component
      className={cn(
        "isolate [&_[data-profile-shell]]:rounded-[var(--profile-radius)] [&_[data-profile-shell]]:border-[length:var(--profile-border-width)] [&_[data-profile-shell]]:shadow-[var(--profile-shadow)] [&_[data-showcase-variant]]:rounded-[var(--profile-radius)] [&_[data-showcase-variant]]:border-[length:var(--profile-border-width)]",
        skin.tokens.cardAccent === "top" &&
          "[&_[data-showcase-variant]]:border-t-primary",
        skin.tokens.cardAccent === "side" &&
          "[&_[data-showcase-variant]]:border-l-primary [&_[data-showcase-variant]]:border-l-4",
        className
      )}
      data-profile-skin={skin.key}
      style={getProfileSkinStyle(skin)}
    >
      {children}
    </Component>
  );
}
