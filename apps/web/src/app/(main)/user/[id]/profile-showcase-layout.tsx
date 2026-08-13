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
      className={cn(
        "@container/profile w-full [&>div]:contents [&>div>section]:min-w-0",
        rendererKey === "stack" && "flex flex-col gap-12",
        rendererKey !== "stack" &&
          "grid grid-cols-1 gap-8 @md/profile:grid-cols-2 @md/profile:[&>div>section[data-showcase-variant=featured]]:col-span-2",
        rendererKey === "spotlight" &&
          "@md/profile:[&>div>section:first-of-type]:col-span-2 @md/profile:[&>div>section:first-of-type]:rounded-[1.75rem] @md/profile:[&>div>section:first-of-type]:border @md/profile:[&>div>section:first-of-type]:border-primary/25 @md/profile:[&>div>section:first-of-type]:bg-card/55 @md/profile:[&>div>section:first-of-type]:p-6 @md/profile:[&>div>section:first-of-type]:shadow-lg @md/profile:[&>div>section:first-of-type]:shadow-primary/5"
      )}
      data-profile-layout={rendererKey}
    >
      {children}
    </div>
  );
}
