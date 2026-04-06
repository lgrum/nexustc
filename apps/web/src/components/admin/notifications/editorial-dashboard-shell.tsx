import { Calendar03Icon, Notification03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardKey = "announcements" | "articles";

export function EditorialDashboardHeader({
  activeDashboard,
  description,
  title,
}: {
  activeDashboard: DashboardKey;
  description: string;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-primary/15 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_58%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-primary">
            <HugeiconsIcon className="size-5" icon={Notification03Icon} />
            <span className="font-semibold text-sm uppercase tracking-[0.24em]">
              Centro editorial
            </span>
          </div>
          <h1 className="mt-3 font-[Lexend] font-bold text-3xl">{title}</h1>
          <p className="mt-3 text-muted-foreground text-sm leading-6">
            {description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            className={cn(
              buttonVariants({
                variant:
                  activeDashboard === "announcements" ? "default" : "outline",
              })
            )}
            to="/admin/notifications/announcements"
          >
            Anuncios globales
          </Link>
          <Link
            className={cn(
              buttonVariants({
                variant: activeDashboard === "articles" ? "default" : "outline",
              })
            )}
            to="/admin/notifications/articles"
          >
            Articulos manuales
          </Link>
        </div>
      </div>
    </section>
  );
}

export function AdminNotificationCard({
  archiveDisabled = false,
  badgeLabel,
  description,
  expirationAt,
  onArchive,
  publishedAt,
  title,
}: {
  archiveDisabled?: boolean;
  badgeLabel: string;
  description: string;
  expirationAt?: Date | null;
  onArchive?: () => void;
  publishedAt?: Date | null;
  title: string;
}) {
  return (
    <Card className="rounded-[1.35rem] border-border/70 bg-muted/20 py-0">
      <CardHeader className="gap-3 border-border/50 border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <Badge className="rounded-full" variant="outline">
            {badgeLabel}
          </Badge>
          {expirationAt ? (
            <Badge className="rounded-full" variant="secondary">
              Expira {formatAdminDate(expirationAt)}
            </Badge>
          ) : null}
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {onArchive ? (
          <CardAction>
            <Button
              disabled={archiveDisabled}
              onClick={onArchive}
              size="sm"
              variant="destructive"
            >
              Archivar
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex items-center gap-2 px-4 py-3 text-muted-foreground text-xs uppercase tracking-[0.18em]">
        <HugeiconsIcon className="size-4" icon={Calendar03Icon} />
        {publishedAt
          ? `Publicado ${formatAdminDate(publishedAt)}`
          : "Sin fecha"}
      </CardContent>
    </Card>
  );
}

export function EmptyAdminState({ copy }: { copy: string }) {
  return (
    <div className="rounded-[1.35rem] border border-dashed border-border/80 bg-muted/20 p-6 text-center text-muted-foreground text-sm">
      {copy}
    </div>
  );
}

export function parseOptionalDate(value: string) {
  if (!value.trim()) {
    return;
  }

  return new Date(value);
}

function formatAdminDate(value: Date | string | null | undefined) {
  if (!value) {
    return "sin fecha";
  }

  return format(new Date(value), "PPp", {
    locale: es,
  });
}
