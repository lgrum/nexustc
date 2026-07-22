import {
  Alert02Icon,
  CircleLockIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function ProfilePanel({
  children,
  className,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-[2rem] border border-border/80 bg-card/75 shadow-lg shadow-black/5",
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function ProfileSectionHeader({
  action,
  className,
  description,
  eyebrow,
  icon,
  title,
  titleId,
}: {
  action?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  eyebrow?: string;
  icon?: IconSvgElement;
  title: string;
  titleId?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <div className="flex items-center gap-2 text-primary">
            {icon ? (
              <HugeiconsIcon aria-hidden className="size-4" icon={icon} />
            ) : null}
            <p className="font-semibold text-[11px] uppercase tracking-[0.28em]">
              {eyebrow}
            </p>
          </div>
        ) : null}
        <h2
          className="mt-2 text-balance font-lexend font-bold text-2xl sm:text-3xl"
          id={titleId}
        >
          {title}
        </h2>
        {description ? (
          <div className="mt-2 text-pretty text-muted-foreground text-sm leading-6">
            {description}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function ProfileCollectionState({
  actionLabel = "Reintentar",
  description,
  kind,
  onAction,
  title,
}: {
  actionLabel?: string;
  description: string;
  kind: "empty" | "error" | "loading" | "private";
  onAction?: () => void;
  title: string;
}) {
  const icon =
    kind === "error"
      ? Alert02Icon
      : kind === "private"
        ? CircleLockIcon
        : Search01Icon;

  return (
    <div
      aria-live={kind === "error" ? "polite" : undefined}
      className="flex min-h-52 flex-col items-center justify-center rounded-[1.5rem] border border-dashed border-border/80 bg-muted/15 p-7 text-center"
      role={kind === "loading" ? "status" : undefined}
    >
      {kind === "loading" ? (
        <Spinner className="size-7 text-primary" />
      ) : (
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-background/55 text-primary shadow-sm">
          <HugeiconsIcon aria-hidden className="size-5" icon={icon} />
        </div>
      )}
      <h3 className="mt-4 font-lexend font-semibold text-lg">{title}</h3>
      <p className="mt-1 max-w-md text-pretty text-muted-foreground text-sm leading-6">
        {description}
      </p>
      {kind === "error" && onAction ? (
        <Button className="mt-4" onClick={onAction} size="sm" variant="outline">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function ProfileLoadMore({
  isLoading,
  onClick,
}: {
  isLoading: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex justify-center pt-2">
      <Button
        aria-busy={isLoading}
        disabled={isLoading}
        onClick={onClick}
        variant="outline"
      >
        {isLoading ? <Spinner className="size-4" /> : null}
        {isLoading ? "Cargando" : "Cargar más"}
      </Button>
    </div>
  );
}

export function ProfileStatList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-2 gap-2", className)}>{children}</dl>
  );
}

export function ProfileStat({
  icon,
  label,
  value,
}: {
  icon: IconSvgElement;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-background/55 p-4 backdrop-blur-md">
      <dt className="flex items-center gap-2 text-muted-foreground text-[11px] uppercase tracking-[0.18em]">
        <HugeiconsIcon
          aria-hidden
          className="size-4 text-primary"
          icon={icon}
        />
        {label}
      </dt>
      <dd className="mt-2 font-lexend font-bold text-2xl text-foreground tabular-nums">
        {value}
      </dd>
    </div>
  );
}
