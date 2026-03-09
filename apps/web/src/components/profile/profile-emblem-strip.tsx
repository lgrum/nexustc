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
  visualConfig: {
    glowColor: string | null;
    backgroundColor: string | null;
  };
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
                className="inline-flex size-9 items-center justify-center rounded-2xl border"
                type="button"
              />
            }
            style={{
              backgroundColor:
                emblem.visualConfig.backgroundColor ??
                "color-mix(in srgb, var(--card) 86%, white 14%)",
              borderColor: emblem.visualConfig.glowColor ?? "var(--border)",
              boxShadow: emblem.visualConfig.glowColor
                ? `0 0 0 1px ${emblem.visualConfig.glowColor}26, 0 8px 18px ${emblem.visualConfig.glowColor}33`
                : undefined,
            }}
          >
            {emblem.icon ? (
              <img
                alt=""
                aria-hidden="true"
                className="size-5 object-contain"
                src={getBucketUrl(emblem.icon.objectKey)}
              />
            ) : (
              <span className="font-semibold text-xs">
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
