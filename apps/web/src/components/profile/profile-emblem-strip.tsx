import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, getBucketUrl } from "@/lib/utils";

type ProfileEmblem = {
  id: string;
  slug: string;
  name: string;
  tooltip: string;
  icon?: { objectKey: string; isAnimated: boolean } | null;
};

export function ProfileEmblemStrip({
  emblems,
  className,
}: {
  emblems?: ProfileEmblem[];
  className?: string;
}) {
  return (
    <div
      className={cn("flex min-h-10 flex-wrap items-center gap-2", className)}
    >
      {emblems?.map((emblem) => (
        <Popover key={emblem.id}>
          <PopoverTrigger
            render={
              <button
                aria-label={emblem.name}
                className="inline-flex size-10 items-center justify-center rounded-xl transition-transform hover:scale-105 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/60"
                type="button"
              />
            }
          >
            {emblem.icon ? (
              <img
                alt=""
                aria-hidden="true"
                className="size-8 object-contain"
                src={getBucketUrl(emblem.icon.objectKey)}
              />
            ) : (
              <span className="font-semibold text-sm">
                {emblem.name.slice(0, 1)}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent className="w-56">
            <PopoverHeader>
              <PopoverTitle>{emblem.name}</PopoverTitle>
            </PopoverHeader>
            {emblem.tooltip ? <p>{emblem.tooltip}</p> : null}
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}
