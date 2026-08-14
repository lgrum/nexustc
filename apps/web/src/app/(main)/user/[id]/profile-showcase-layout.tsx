import type { ProfileLayoutKey } from "@repo/shared/profile-customization";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ProfileShowcaseLayout({
  children,
  rendererKey,
}: {
  children: ReactNode;
  rendererKey: ProfileLayoutKey;
}) {
  return (
    <div
      className="@container/profile w-full"
      data-profile-layout={rendererKey}
    >
      <div
        className={cn(
          "w-full [&>div]:contents [&>div>section]:min-w-0 [&>div>section]:rounded-[var(--profile-radius,1.5rem)] [&>div>section]:border [&>div>section]:border-border/70 [&>div>section]:bg-card/55 [&>div>section]:p-5 @md/profile:[&>div>section]:p-6",
          rendererKey === "stack" && "flex flex-col gap-6",
          rendererKey !== "stack" &&
            "grid grid-cols-1 gap-6 @md/profile:grid-cols-2 @md/profile:[&>div>section[data-showcase-variant=featured]]:col-span-2",
          rendererKey === "spotlight" &&
            "@md/profile:[&>div>section:first-of-type]:col-span-2 @md/profile:[&>div>section:first-of-type]:border-primary/25 @md/profile:[&>div>section:first-of-type]:bg-card/70 @md/profile:[&>div>section:first-of-type]:shadow-lg @md/profile:[&>div>section:first-of-type]:shadow-primary/5"
        )}
        data-profile-showcase-grid
      >
        {children}
      </div>
    </div>
  );
}
