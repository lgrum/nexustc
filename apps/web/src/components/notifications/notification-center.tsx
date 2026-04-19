import { Notification03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  NotificationFeedError,
  NotificationFeedList,
} from "@/components/notifications/notification-feed";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { authClient } from "@/lib/auth-client";
import { orpc, orpcClient, queryClient } from "@/lib/orpc";
import { cn } from "@/lib/utils";

type NotificationFeedResponse = Awaited<
  ReturnType<(typeof orpcClient.notification)["getFeed"]>
>;
type NotificationFeedItem = NotificationFeedResponse["items"][number];
type NotificationFilter = "all" | "unread" | "read";

const FEED_PAGE_SIZE = 12;

export function NotificationCenter() {
  const { data: auth } = authClient.useSession();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const readOnly = filter === "read";
  const unreadOnly = filter === "unread";

  useEffect(() => {
    if (!open) {
      setFilter("all");
    }
  }, [open]);

  const isAuthed = Boolean(auth?.session);
  const unreadCountQuery = useQuery({
    ...orpc.notification.getUnreadCount.queryOptions(),
    enabled: isAuthed,
    refetchInterval: 60_000,
    staleTime: 15_000,
  });

  const unreadCount = unreadCountQuery.data ?? 0;

  const notificationsQuery = useInfiniteQuery({
    // The feed uses cursor pagination so we keep the page param as an ISO string.
    enabled: isAuthed && open,
    getNextPageParam: (lastPage: NotificationFeedResponse) =>
      lastPage.nextCursor
        ? new Date(lastPage.nextCursor).toISOString()
        : undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      orpcClient.notification.getFeed({
        cursor: pageParam ? new Date(pageParam) : undefined,
        limit: FEED_PAGE_SIZE,
        readOnly,
        unreadOnly,
      }),
    queryKey: ["notification-feed", filter],
    staleTime: 15_000,
  });

  const markReadMutation = useMutation(
    orpc.notification.markRead.mutationOptions({
      onSuccess: async () => {
        await invalidateNotificationQueries();
      },
    })
  );

  const markAllReadMutation = useMutation(
    orpc.notification.markAllRead.mutationOptions({
      onSuccess: async () => {
        await invalidateNotificationQueries();
      },
    })
  );

  const items = useMemo(
    () =>
      notificationsQuery.data?.pages.flatMap(
        (page: NotificationFeedResponse) => page.items
      ) ?? [],
    [notificationsQuery.data]
  );

  if (!isAuthed) {
    return null;
  }

  const trigger = (
    <NotificationTriggerButton
      isLoading={unreadCountQuery.isLoading}
      open={open}
      unreadCount={unreadCount}
    />
  );

  const content = (
    <NotificationPanel
      canMarkAllRead={unreadCount > 0}
      filter={filter}
      hasMore={Boolean(notificationsQuery.hasNextPage)}
      isFetchingMore={notificationsQuery.isFetchingNextPage}
      isLoading={
        notificationsQuery.isLoading ||
        notificationsQuery.isPending ||
        unreadCountQuery.isLoading
      }
      items={items}
      onFilterChange={setFilter}
      onLoadMore={() => notificationsQuery.fetchNextPage()}
      onMarkAllRead={() => markAllReadMutation.mutate({})}
      onMarkRead={(notificationId) =>
        markReadMutation.mutate({ notificationIds: [notificationId] })
      }
      readActionPending={
        markReadMutation.isPending || markAllReadMutation.isPending
      }
      unreadCount={unreadCount}
      wasError={notificationsQuery.isError}
    />
  );

  if (isMobile) {
    return (
      <>
        <div>
          <NotificationTriggerButton
            isLoading={unreadCountQuery.isLoading}
            onClick={() => setOpen(true)}
            open={open}
            unreadCount={unreadCount}
          />
        </div>
        <Drawer onOpenChange={setOpen} open={open}>
          <DrawerContent className="relative isolate max-h-[82vh] rounded-t-[2rem] border-border/70 bg-background/96 shadow-[0_-24px_90px_-40px_hsl(var(--foreground)/0.8)] supports-backdrop-filter:bg-background/80 supports-backdrop-filter:backdrop-blur-2xl supports-backdrop-filter:backdrop-saturate-150">
            <DrawerHeader className="border-border/60 border-b px-4 pb-4 text-left">
              <DrawerTitle className="font-[Lexend] text-xl">
                Notificaciones
              </DrawerTitle>
              <DrawerDescription>
                Novedades de la plataforma, tus juegos seguidos y avisos del
                sistema.
              </DrawerDescription>
            </DrawerHeader>
            {content}
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        align="end"
        className="relative isolate w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-[1.9rem] border border-border/70 bg-background/96 pb-0 px-0 shadow-[0_34px_100px_-42px_hsl(var(--foreground)/0.75)] before:pointer-events-none before:absolute before:inset-0 before:-z-1 before:rounded-[inherit] before:backdrop-blur-2xl before:backdrop-saturate-150 supports-backdrop-filter:bg-background/80"
        sideOffset={10}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}

function NotificationTriggerButton({
  isLoading,
  onClick,
  open,
  unreadCount,
}: {
  isLoading: boolean;
  onClick?: () => void;
  open: boolean;
  unreadCount: number;
}) {
  const visibleCount = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <button
      aria-label={
        unreadCount > 0
          ? `Abrir notificaciones, ${visibleCount} sin leer`
          : "Abrir notificaciones"
      }
      className={cn(
        "group relative flex size-10 items-center justify-center rounded-full border border-border/70 bg-background/80 text-foreground transition-all hover:border-primary/30 hover:bg-primary/8 hover:text-primary",
        open &&
          "border-primary/35 bg-primary/10 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.12)]"
      )}
      onClick={onClick}
      type="button"
    >
      <HugeiconsIcon
        className={cn(
          "size-4.5 transition-transform duration-200 group-hover:scale-105",
          isLoading && "animate-pulse"
        )}
        icon={Notification03Icon}
      />
      {unreadCount > 0 ? (
        <span className="absolute top-0 right-0 inline-flex min-w-5 translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full border border-background bg-destructive px-1.5 py-0.5 font-semibold text-[10px] leading-none text-white">
          {visibleCount}
        </span>
      ) : null}
    </button>
  );
}

function NotificationPanel({
  canMarkAllRead,
  filter,
  hasMore,
  isFetchingMore,
  isLoading,
  items,
  onFilterChange,
  onLoadMore,
  onMarkAllRead,
  onMarkRead,
  readActionPending,
  unreadCount,
  wasError,
}: {
  canMarkAllRead: boolean;
  filter: NotificationFilter;
  hasMore: boolean;
  isFetchingMore: boolean;
  isLoading: boolean;
  items: NotificationFeedItem[];
  onFilterChange: (value: NotificationFilter) => void;
  onLoadMore: () => void;
  onMarkAllRead: () => void;
  onMarkRead: (notificationId: string) => void;
  readActionPending: boolean;
  unreadCount: number;
  wasError: boolean;
}) {
  const emptyState = getNotificationEmptyState(filter);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative overflow-hidden border-border/60 border-b bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_58%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))] px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            onValueChange={(value) =>
              onFilterChange(value as NotificationFilter)
            }
            value={filter}
          >
            <TabsList className="rounded-full p-1 shadow-none" variant="line">
              <TabsTrigger className="rounded-full px-4" value="all">
                Todo
              </TabsTrigger>
              <TabsTrigger className="rounded-full px-4" value="unread">
                Sin leer
              </TabsTrigger>
              <TabsTrigger className="rounded-full px-4" value="read">
                Leídos
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <button
            className={cn(
              "rounded-full px-3 py-1.5 font-medium text-xs tracking-[0.18em] uppercase transition-colors",
              canMarkAllRead
                ? "bg-primary/12 text-primary hover:bg-primary/18"
                : "cursor-not-allowed bg-muted/60 text-muted-foreground"
            )}
            disabled={!canMarkAllRead || readActionPending}
            onClick={onMarkAllRead}
            type="button"
          >
            Leer todo
          </button>
        </div>
        <div className="py-3 flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.22em]">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          {unreadCount > 0
            ? `${unreadCount} pendientes en tu bandeja`
            : "Todo al día"}
        </div>
      </div>

      <ScrollArea className="h-[min(70vh,30rem)]">
        <div className="flex flex-col gap-4 p-4">
          {isLoading ? (
            <NotificationFeedSkeleton />
          ) : wasError ? (
            <NotificationFeedError copy="Vuelve a intentarlo en unos segundos para recuperar tus novedades." />
          ) : (
            <>
              <NotificationFeedList
                emptyCopy={emptyState.copy}
                emptyTitle={emptyState.title}
                isMarking={readActionPending}
                items={items}
                onMarkRead={onMarkRead}
              />
              {hasMore ? (
                <button
                  className="rounded-[1.25rem] border border-border/70 bg-muted/30 px-4 py-3 font-medium text-sm transition-colors hover:bg-muted/60"
                  disabled={isFetchingMore}
                  onClick={onLoadMore}
                  type="button"
                >
                  {isFetchingMore ? "Cargando más…" : "Cargar más"}
                </button>
              ) : null}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function getNotificationEmptyState(filter: NotificationFilter): {
  copy: string;
  title: string;
} {
  if (filter === "unread") {
    return {
      copy: "Cuando haya nuevas noticias o actualizaciones del contenido que sigues, aparecerán aquí!",
      title: "No Tienes Notificaciones Pendientes",
    };
  }

  if (filter === "read") {
    return {
      copy: "Cuando abras o marques novedades como leídas, quedarán guardadas aquí.",
      title: "Aún no hay notificaciones leídas",
    };
  }

  return {
    copy: "Ya sabes… lo bueno siempre llega sin avisar. Anuncios, noticias o actualizaciones del contenido que sigues, aparecerán aquí!",
    title: "Hoy está demasiado calmado...",
  };
}

function NotificationFeedSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/80"
          key={index}
        >
          <div className="flex items-start gap-3 border-border/40 border-b px-4 py-4">
            <div className="size-10 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-28 animate-pulse rounded-full bg-muted" />
              <div className="h-4 w-3/4 animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
          <div className="space-y-3 px-4 py-4">
            <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-5/6 animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function invalidateNotificationQueries() {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: ["notification-feed"],
    }),
    queryClient.invalidateQueries({
      queryKey: orpc.notification.getUnreadCount.queryKey(),
    }),
    queryClient.invalidateQueries({
      queryKey: orpc.notification.getFollowing.queryKey({
        input: { limit: 20 },
      }),
    }),
  ]);
}
