import type React from "react";

import { cn, getDeterministicHue, pickTextColorFromHex } from "@/lib/utils";

export function TermBadge({
  tag,
  className,
  ...props
}: React.ComponentPropsWithRef<"span"> & {
  tag: { name: string; color: string | null | undefined };
  className?: string;
}) {
  const hue = getDeterministicHue(tag.name);
  const colors = tag.color ? tag.color.split(",") : [];

  let color1 = "";
  let color2 = "";
  let textColor: string | undefined = "";

  if (colors.length === 1) {
    if (colors[0].startsWith("@")) {
      textColor = colors[0].slice(1);
    } else {
      [color1] = colors;
    }
  }

  if (colors.length === 2) {
    [color1, color2] = colors;
  }

  if (colors.length === 3) {
    [color1, color2] = colors;
    textColor = colors[2].slice(1);
  }

  const hasColor = color1 || textColor;

  if (!hasColor) {
    return (
      <span
        className={cn(
          "inline-flex grow items-center justify-center rounded-full border px-3.5 py-1 text-center font-semibold text-[13px] leading-5 transition-colors duration-200 hover:[background:oklch(0.3_0.1_var(--tb-hue)/0.55)]",
          className
        )}
        style={
          {
            "--tb-hue": hue,
            background: `oklch(0.24 0.06 ${hue} / 0.45)`,
            borderColor: `oklch(0.55 0.08 ${hue} / 0.35)`,
            color: `oklch(0.86 0.16 ${hue})`,
          } as React.CSSProperties
        }
        {...props}
      >
        {tag.name}
      </span>
    );
  }

  textColor = textColor || pickTextColorFromHex(color1 || "#000000");

  return (
    <span
      className={cn(
        "inline-flex grow items-center justify-center rounded-full border px-3.5 py-1 text-center font-semibold text-[13px] leading-5 transition-colors duration-200",
        className
      )}
      key={tag.name}
      style={{
        background: color1
          ? `linear-gradient(to right, ${color1}, ${color2 || color1})`
          : undefined,
        borderColor: textColor || undefined,
        color: textColor,
      }}
      {...props}
    >
      {tag.name}
    </span>
  );
}
