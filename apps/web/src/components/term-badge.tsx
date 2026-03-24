import type React from "react";

import { cn, pickTextColorFromHex } from "@/lib/utils";

export function TermBadge({
  tag,
  className,
  ...props
}: React.ComponentPropsWithRef<"span"> & {
  tag: { name: string; color: string | null | undefined };
  className?: string;
}) {
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
          "inline-flex grow items-center justify-center rounded-4xl border border-border bg-muted px-2.5 py-1 text-center font-medium text-muted-foreground text-xs transition-colors",
          className
        )}
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
        "inline-flex grow items-center justify-center rounded-4xl border px-2.5 py-1 text-center font-medium text-xs transition-colors",
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
