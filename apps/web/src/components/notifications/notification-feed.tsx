import {
  AlertCircleIcon,
  Megaphone01Icon,
  News01Icon,
  Notification03Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { cn, getBucketUrl } from "@/lib/utils";

type NotificationItem = {
  contentType: "comic" | "post" | null;
  description: string;
  id: string;
  imageObjectKey: string | null;
  isRead: boolean;
  metadata: Record<string, unknown>;
  publishedAt: Date | string;
  targetContentId: string | null;
  title: string;
  type: "content_news" | "content_update" | "global_announcement" | "system";
};

function getNotificationAccent(type: NotificationItem["type"]): {
  badgeClassName: string;
  icon: typeof Megaphone01Icon;
  label: string;
  panelClassName: string;
} {
  switch (type) {
    case "global_announcement": {
      return {
        badgeClassName:
          "border-amber-500/25 bg-amber-500/10 text-amber-200 shadow-[inset_0_1px_0_hsl(43_96%_56%/0.14)]",
        icon: Megaphone01Icon,
        label: "Anuncio",
        panelClassName:
          "border-amber-500/20 bg-[linear-gradient(135deg,hsl(33_88%_55%/0.18),transparent_58%)]",
      };
    }
    case "content_news": {
      return {
        badgeClassName:
          "border-sky-500/25 bg-sky-500/10 text-sky-200 shadow-[inset_0_1px_0_hsl(199_89%_48%/0.14)]",
        icon: News01Icon,
        label: "Staff",
        panelClassName:
          "border-sky-500/20 bg-[linear-gradient(135deg,hsl(199_89%_48%/0.16),transparent_58%)]",
      };
    }
    case "content_update": {
      return {
        badgeClassName:
          "border-emerald-500/25 bg-emerald-500/10 text-emerald-200 shadow-[inset_0_1px_0_hsl(160_84%_39%/0.14)]",
        icon: RefreshIcon,
        label: "Update",
        panelClassName:
          "border-emerald-500/20 bg-[linear-gradient(135deg,hsl(160_84%_39%/0.16),transparent_58%)]",
      };
    }
    default: {
      return {
        badgeClassName:
          "border-primary/25 bg-primary/10 text-primary shadow-[inset_0_1px_0_hsl(var(--primary)/0.18)]",
        icon: Notification03Icon,
        label: "Sistema",
        panelClassName:
          "border-primary/20 bg-[linear-gradient(135deg,hsl(var(--primary)/0.16),transparent_58%)]",
      };
    }
  }
}

function getContentLabel(contentType: NotificationItem["contentType"]) {
  if (contentType === "comic") {
    return "Comic";
  }

  if (contentType === "post") {
    return "Juego";
  }

  return null;
}

type NotificationFeedListProps = {
  emptyCopy: string;
  emptyTitle: string;
  isMarking?: boolean;
  items: NotificationItem[];
  onMarkRead?: (notificationId: string) => void;
};

export function NotificationFeedList({
  emptyCopy,
  emptyTitle,
  isMarking = false,
  items,
  onMarkRead,
}: NotificationFeedListProps) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-[1.75rem] border border-dashed border-border/80 bg-muted/20 p-6 text-center">
        <div className="rounded-full border border-primary/20 bg-primary/10 p-3 text-primary">
          <HugeiconsIcon className="size-5" icon={Notification03Icon} />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-sm">{emptyTitle}</p>
          <p className="max-w-sm text-muted-foreground text-sm">{emptyCopy}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <NotificationFeedCard
          item={item}
          isMarking={isMarking}
          key={item.id}
          onMarkRead={onMarkRead}
        />
      ))}
    </div>
  );
}

function NotificationFeedCard({
  item,
  isMarking,
  onMarkRead,
}: {
  isMarking: boolean;
  item: NotificationItem;
  onMarkRead?: (notificationId: string) => void;
}) {
  const accent = getNotificationAccent(item.type);
  const contentLabel = getContentLabel(item.contentType);
  const isUnread = item.isRead === false;
  const timestamp = formatDistanceToNow(new Date(item.publishedAt), {
    addSuffix: true,
    locale: es,
  });

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-[1.5rem] border-border/70 bg-card/95 py-0 shadow-[0_20px_50px_-32px_hsl(var(--foreground)/0.5)] backdrop-blur-md supports-backdrop-filter:bg-card/88 transition-colors",
        accent.panelClassName,
        isUnread &&
          "border-primary/30 shadow-[0_0_0_1px_hsl(var(--primary)/0.12),0_22px_60px_-34px_hsl(var(--primary)/0.6)]"
      )}
    >
      <CardHeader className="gap-3 border-border/40 border-b bg-black/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border text-white shadow-inner",
              accent.badgeClassName
            )}
          >
            <HugeiconsIcon className="size-4" icon={accent.icon} />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={cn("rounded-full px-2.5", accent.badgeClassName)}
                variant="outline"
              >
                {accent.label}
              </Badge>
              {contentLabel ? (
                <Badge
                  className="rounded-full border-border/80 bg-background/70 px-2.5 text-foreground"
                  variant="outline"
                >
                  {contentLabel}
                </Badge>
              ) : null}
              {isUnread ? (
                <Badge
                  className="rounded-full border-primary/20 bg-primary/12 px-2.5 text-primary"
                  variant="outline"
                >
                  Nuevo
                </Badge>
              ) : null}
            </div>
            <div className="space-y-1">
              <h3 className="text-balance font-semibold leading-tight">
                {item.title}
              </h3>
              <p className="text-muted-foreground text-xs uppercase tracking-[0.24em]">
                {timestamp}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      {item.imageObjectKey ? (
        <div className="relative aspect-[2.4/1] overflow-hidden border-border/40 border-b bg-black/10">
          <img
            alt={item.title}
            className="h-full w-full object-cover"
            src={getBucketUrl(item.imageObjectKey)}
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
        </div>
      ) : null}

      <CardContent className="px-4 py-4">
        <p className="text-pretty text-sm leading-6 text-foreground/88">
          {item.description}
        </p>
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-border/40 bg-black/5 px-4 py-3">
        <div className="text-muted-foreground text-xs">
          {isUnread ? "Aún no marcada como leída" : "Leída"}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.targetContentId ? (
            <Button
              className="rounded-full"
              nativeButton={false}
              onClick={() => {
                if (!item.isRead) {
                  onMarkRead?.(item.id);
                }
              }}
              render={
                <Link params={{ id: item.targetContentId }} to="/post/$id" />
              }
              size="sm"
              variant="outline"
            >
              Abrir
            </Button>
          ) : null}
          {isUnread ? (
            <Button
              className="rounded-full"
              disabled={isMarking}
              onClick={() => onMarkRead?.(item.id)}
              size="sm"
              variant="secondary"
            >
              Marcar leída
            </Button>
          ) : (
            <Button
              className="rounded-full"
              disabled={true}
              size="sm"
              variant="ghost"
            >
              Leída
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

export function NotificationFeedError({ copy }: { copy: string }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-[1.75rem] border border-destructive/20 bg-destructive/5 p-6 text-center">
      <div className="rounded-full border border-destructive/20 bg-destructive/10 p-3 text-destructive">
        <HugeiconsIcon className="size-5" icon={AlertCircleIcon} />
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-sm">No pudimos cargar tu bandeja</p>
        <p className="max-w-sm text-muted-foreground text-sm">{copy}</p>
      </div>
    </div>
  );
}
