import type { Button as ButtonPrimitive } from "@base-ui/react/button";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PostActionTone = "rose" | "blue" | "emerald" | "purple" | "amber";

const TONE_CLASSES: Record<
  PostActionTone,
  { inactive: string; active: string }
> = {
  rose: {
    inactive:
      "border-rose-500/25 bg-rose-500/[0.04] text-rose-100/90 hover:border-rose-500/55 hover:bg-rose-500/[0.1] hover:shadow-glow-rose-500/25",
    active:
      "border-rose-500/70 bg-rose-500/15 text-rose-50 shadow-glow-rose-500/45",
  },
  blue: {
    inactive:
      "border-blue-500/25 bg-blue-500/[0.04] text-blue-100/90 hover:border-blue-500/55 hover:bg-blue-500/[0.1] hover:shadow-glow-blue-500/25",
    active:
      "border-blue-500/70 bg-blue-500/15 text-blue-50 shadow-glow-blue-500/45",
  },
  emerald: {
    inactive:
      "border-emerald-500/25 bg-emerald-500/[0.04] text-emerald-100/90 hover:border-emerald-500/55 hover:bg-emerald-500/[0.1] hover:shadow-glow-emerald-500/25",
    active:
      "border-emerald-500/70 bg-emerald-500/15 text-emerald-50 shadow-glow-emerald-500/45",
  },
  purple: {
    inactive:
      "border-purple-500/25 bg-purple-500/[0.04] text-purple-100/90 hover:border-purple-500/55 hover:bg-purple-500/[0.1] hover:shadow-glow-purple-500/25",
    active:
      "border-purple-500/70 bg-purple-500/15 text-purple-50 shadow-glow-purple-500/45",
  },
  amber: {
    inactive:
      "border-amber-500/25 bg-amber-500/[0.04] text-amber-100/90 hover:border-amber-500/55 hover:bg-amber-500/[0.1] hover:shadow-glow-amber-500/25",
    active:
      "border-amber-500/70 bg-amber-500/15 text-amber-50 shadow-glow-amber-500/45",
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
        "h-10 w-full justify-center gap-2 rounded-lg border px-3 font-medium text-[13px] transition-[color,background-color,border-color,box-shadow] duration-200",
        active ? tones.active : tones.inactive,
        className
      )}
      {...props}
    />
  );
}
