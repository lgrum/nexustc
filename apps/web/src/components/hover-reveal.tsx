import type React from "react";

import { cn } from "@/lib/utils";

type HoverRevealProps = {
  /** The amount of blur to apply (e.g. "sm", "md", "lg", or custom Tailwind blur class) */
  blur?: string;
  /** Optional extra className for the wrapper */
  className?: string;
  /** The children to render (content that gets blurred) */
  children: React.ReactNode;
  /** Optional flag to disable the effect */
  disabled?: boolean;
};

/**
 * Wraps content and blurs + dims it until hovered.
 */
export function HoverReveal({
  children,
  blur = "blur-md",
  className,
  disabled = false,
}: HoverRevealProps) {
  if (disabled) {
    return children;
  }

  return (
    <div
      className={cn("group relative transition-all duration-300", className)}
    >
      <div
        className={cn(
          // ✅ this layer actually applies blur & dim
          "transition-all duration-300",
          blur,
          "opacity-60",
          // ✅ remove blur + dim on hover
          "group-hover:opacity-100 group-hover:blur-none"
        )}
      >
        {children}
      </div>

      {/* Transparent hover overlay ensures the hover works even if the blurred content has pointer-events disabled */}
      <div className="absolute inset-0 z-10" />
    </div>
  );
}
