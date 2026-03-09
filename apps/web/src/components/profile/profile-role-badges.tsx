import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, getBucketUrl } from "@/lib/utils";

type ProfileRole = {
  id: string;
  slug: string;
  name: string;
  description: string;
  visualConfig: {
    baseColor: string;
    accentColor: string | null;
    textColor: string;
    glowColor: string | null;
  };
  icon?: { objectKey: string; isAnimated: boolean } | null;
  overlay?: { objectKey: string; isAnimated: boolean } | null;
};

export function ProfileRoleBadges({
  roles,
  className,
}: {
  roles?: ProfileRole[];
  className?: string;
}) {
  if (!(roles && roles.length > 0)) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {roles.map((role) => (
        <Popover key={role.id}>
          <PopoverTrigger
            render={
              <button
                className="relative inline-flex min-h-8 items-center gap-2 rounded-full border px-3 py-1.5 font-semibold text-xs"
                type="button"
              />
            }
            style={{
              background: role.visualConfig.accentColor
                ? `linear-gradient(135deg, ${role.visualConfig.baseColor}, ${role.visualConfig.accentColor})`
                : role.visualConfig.baseColor,
              borderColor:
                role.visualConfig.glowColor ?? role.visualConfig.baseColor,
              boxShadow: role.visualConfig.glowColor
                ? `0 0 0 1px ${role.visualConfig.glowColor}33, 0 6px 18px ${role.visualConfig.glowColor}40`
                : undefined,
              color: role.visualConfig.textColor,
            }}
          >
            {role.icon && (
              <img
                alt=""
                aria-hidden="true"
                className="size-4 rounded-full object-cover"
                src={getBucketUrl(role.icon.objectKey)}
              />
            )}
            <span>{role.name}</span>
            {role.overlay && (
              <img
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 size-full rounded-full object-cover opacity-25"
                src={getBucketUrl(role.overlay.objectKey)}
              />
            )}
          </PopoverTrigger>
          <PopoverContent className="w-64">
            <PopoverHeader>
              <PopoverTitle>{role.name}</PopoverTitle>
            </PopoverHeader>
            {role.description ? <p>{role.description}</p> : null}
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}
