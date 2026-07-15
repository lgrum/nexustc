import { Book02Icon, Notification03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import Image from "next/image";
import Link from "next/link";

import { NotificationFeedList } from "@/components/notifications/notification-feed";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trackEvent } from "@/lib/analytics";
import { orpc, queryClient } from "@/lib/orpc";
import { getThumbnailImageObjectKeys } from "@/lib/post-images";
import { getBucketUrl } from "@/lib/utils";

const FOLLOWING_LIMIT = 20;

export function FollowingSection() {
  const {
    data: following,
    isLoading: followingLoading,
    isPending: followingPending,
  } = useQuery(
    orpc.notification.getFollowing.queryOptions({
      input: { limit: FOLLOWING_LIMIT },
    })
  );

  const markReadMutation = useMutation(
    orpc.notification.markRead.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.notification.getFollowing.queryKey({
              input: { limit: FOLLOWING_LIMIT },
            }),
          }),
          queryClient.invalidateQueries({
            queryKey: orpc.notification.getUnreadCount.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: ["notification-feed"],
          }),
        ]);
      },
    })
  );

  if (followingLoading || followingPending) {
    return <FollowingSectionSkeleton />;
  }

  if (!following) {
    return (
      <div className="rounded-[2rem] border border-border bg-card p-6">
        <p className="text-muted-foreground text-sm">
          No pudimos cargar tu actividad seguida.
        </p>
      </div>
    );
  }

  const games = following.follows.filter((item) => item.contentType === "post");
  const comics = following.follows.filter(
    (item) => item.contentType === "comic"
  );

  return (
    <div className="flex flex-col gap-4 rounded-[2rem] border border-border bg-card p-4">
      <div className="flex flex-col gap-2 rounded-[1.5rem] border border-primary/15 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.16),transparent_58%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))] p-4">
        <div className="flex items-center gap-2 text-primary">
          <HugeiconsIcon className="size-5" icon={Notification03Icon} />
          <span className="font-semibold text-sm uppercase tracking-[0.24em]">
            Siguiendo
          </span>
        </div>
        <h2 className="font-lexend font-bold text-2xl">
          Tu radar de juegos y comics
        </h2>
        <p className="max-w-2xl text-muted-foreground text-sm leading-6">
          Desde aquí ves qué títulos estás siguiendo y las últimas noticias o
          updates que llegaron a tu bandeja.
        </p>
      </div>

      <Tabs className="w-full" defaultValue="games">
        <TabsList className="w-full">
          <TabsTrigger value="games">Juegos ({games.length})</TabsTrigger>
          <TabsTrigger value="comics">Comics ({comics.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="games">
          <FollowedContentGrid
            emptyCopy="Cuando sigas un juego aparecerá aquí con su acceso rápido."
            items={games}
          />
        </TabsContent>
        <TabsContent value="comics">
          <FollowedContentGrid
            emptyCopy="Cuando sigas un comic aparecerá aquí con su acceso rápido."
            items={comics}
          />
        </TabsContent>
      </Tabs>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon className="size-4 text-primary" icon={Book02Icon} />
          <h3 className="font-semibold text-base">
            Últimas novedades seguidas
          </h3>
        </div>
        <NotificationFeedList
          emptyCopy="En cuanto uno de tus títulos seguidos reciba páginas nuevas, noticias del staff o versiones nuevas, lo verás aquí."
          emptyTitle="Aún no hay novedades"
          isMarking={markReadMutation.isPending}
          items={following.updates}
          onMarkRead={(notificationId) => {
            trackEvent("notification_mark_read_clicked", {
              notificationId,
              source: "following_section",
            });
            markReadMutation.mutate({ notificationIds: [notificationId] });
          }}
        />
      </div>
    </div>
  );
}

function FollowedContentGrid({
  emptyCopy,
  items,
}: {
  emptyCopy: string;
  items: {
    contentId: string;
    contentType: "comic" | "post";
    coverImageObjectKey?: string | null;
    followedAt: Date | string;
    imageObjectKeys: string[] | null;
    title: string;
    version: string | null;
  }[];
}) {
  if (items.length === 0) {
    return (
      <div className="flex min-h-44 items-center justify-center rounded-[1.5rem] border border-dashed border-border/80 bg-muted/20 p-6 text-center">
        <p className="max-w-sm text-muted-foreground text-sm">{emptyCopy}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const [imageObjectKey] = getThumbnailImageObjectKeys(
          item.imageObjectKeys,
          1,
          item.coverImageObjectKey
        );

        return (
          <Link
            key={item.contentId}
            onClick={() =>
              trackEvent("followed_content_clicked", {
                contentId: item.contentId,
                contentType: item.contentType,
              })
            }
            href={`/post/${item.contentId}`}
          >
            <Card className="h-full rounded-[1.5rem] py-0 transition-transform hover:-translate-y-1">
              <div className="relative aspect-[2.1/1] overflow-hidden border-border/50 border-b bg-muted">
                {imageObjectKey ? (
                  <Image
                    alt={item.title}
                    className="object-cover"
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    src={getBucketUrl(imageObjectKey)}
                  />
                ) : null}
                <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/10 to-transparent" />
                <div className="absolute left-3 bottom-3 flex flex-wrap items-center gap-2">
                  <Badge
                    className="rounded-full border-white/20 bg-black/45 text-white"
                    variant="outline"
                  >
                    {item.contentType === "comic" ? "Comic" : "Juego"}
                  </Badge>
                  {item.version ? (
                    <Badge
                      className="rounded-full border-white/20 bg-primary/40 text-white"
                      variant="outline"
                    >
                      {item.version}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <CardHeader className="space-y-2 px-4 py-4">
                <h4 className="text-balance font-semibold leading-tight">
                  {item.title}
                </h4>
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Sigues esto{" "}
                  {formatDistanceToNow(new Date(item.followedAt), {
                    addSuffix: true,
                    locale: es,
                  })}
                </p>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <span className="font-medium text-primary text-sm">
                  Ver página del contenido
                </span>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function FollowingSectionSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-[2rem] border border-border bg-card p-4">
      <div className="space-y-3 rounded-[1.5rem] border border-border/70 p-4">
        <div className="h-3 w-28 animate-pulse rounded-full bg-muted" />
        <div className="h-8 w-72 animate-pulse rounded-full bg-muted" />
        <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div
            className="overflow-hidden rounded-[1.5rem] border border-border/70"
            key={index}
          >
            <div className="aspect-[2.1/1] animate-pulse bg-muted" />
            <div className="space-y-3 p-4">
              <div className="h-4 w-3/4 animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: 2 }, (_, index) => (
          <div
            className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/80"
            key={index}
          >
            <div className="flex items-start gap-3 border-border/40 border-b px-4 py-4">
              <div className="size-10 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-28 animate-pulse rounded-full bg-muted" />
                <div className="h-4 w-3/4 animate-pulse rounded-full bg-muted" />
              </div>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div className="h-3 w-full animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-5/6 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
