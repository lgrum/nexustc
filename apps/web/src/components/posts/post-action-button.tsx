import type { Button as ButtonPrimitive } from "@base-ui/react/button";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PostActionTone = "rose" | "blue" | "emerald" | "purple";

const TONE_CLASSES: Record<
  PostActionTone,
  { base: string; active: string; inactive: string }
> = {
  rose: {
    base: "shadow-glow-rose-600/80 hover:bg-rose-600/80 hover:shadow-glow-rose-600",
    active: "ring-rose-600 bg-rose-600/50",
    inactive: "ring-rose-800 bg-rose-600/30",
  },
  blue: {
    base: "shadow-glow-blue-600/80 hover:bg-blue-600/80 hover:shadow-glow-blue-600",
    active: "ring-blue-600 bg-blue-600/50",
    inactive: "ring-blue-800 bg-blue-600/30",
  },
  emerald: {
    base: "shadow-glow-emerald-500/80 hover:bg-emerald-500/80 hover:shadow-glow-emerald-500",
    active: "ring-emerald-500 bg-emerald-500/50",
    inactive: "ring-emerald-800 bg-emerald-500/30",
  },
  purple: {
    base: "shadow-glow-purple-500/80 hover:bg-purple-500/80 hover:shadow-glow-purple-500",
    active: "ring-purple-500 bg-purple-500/50",
    inactive: "ring-purple-800 bg-purple-500/30",
  },
};

type PostActionButtonProps = ButtonPrimitive.Props & {
  tone: PostActionTone;
  active?: boolean;
};

export function PostActionButton({
  tone,
  active = false,
  className,
  ...props
}: PostActionButtonProps) {
  const tones = TONE_CLASSES[tone];

  return (
    <Button
      className={cn(
        "text-white ring-2 transition-transform hover:scale-105",
        tones.base,
        active ? tones.active : tones.inactive,
        className
      )}
      {...props}
    />
  );
}
