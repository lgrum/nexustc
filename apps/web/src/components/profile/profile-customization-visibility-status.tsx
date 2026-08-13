import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProfileCustomizationVisibilityStatus({
  description,
  status,
}: {
  description: string;
  status: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[1.25rem] border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">{status}</p>
        <p className="mt-1 text-muted-foreground text-sm">{description}</p>
      </div>
      <Link
        className={cn(buttonVariants({ variant: "outline" }), "shrink-0")}
        href="/profile/customize"
      >
        Personalizar perfil
      </Link>
    </div>
  );
}
