import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const sw = Number(props.strokeWidth);
  const safeStrokeWidth = Number.isFinite(sw) ? sw : 1;

  return (
    <HugeiconsIcon
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      icon={Loading03Icon}
      role="status"
      {...props}
      strokeWidth={safeStrokeWidth}
    />
  );
}

export { Spinner };
