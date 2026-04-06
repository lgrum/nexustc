import { Calendar03Icon, News01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { BlockNoteContent } from "@/components/blocknote-content";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { safeOrpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

export const Route = createFileRoute("/_main/news/$id")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const [error, data, isDefined] =
      await safeOrpcClient.notification.getPublishedNewsArticleById(params.id);

    if (isDefined) {
      if (error.code === "NOT_FOUND") {
        throw notFound();
      }

      throw error;
    }

    if (!data) {
      throw notFound();
    }

    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        media: loaderData?.bannerImageObjectKey
          ? getBucketUrl(loaderData.bannerImageObjectKey)
          : undefined,
        title: `NeXusTC - ${loaderData?.title ?? "News"}`,
      },
    ],
  }),
});

function RouteComponent() {
  const article = Route.useLoaderData();

  return (
    <main className="flex flex-col gap-6 py-6">
      <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-card/70">
        {article.bannerImageObjectKey ? (
          <div className="relative aspect-[2.3/1] overflow-hidden border-border/40 border-b">
            <img
              alt={article.title}
              className="h-full w-full object-cover"
              src={getBucketUrl(article.bannerImageObjectKey)}
            />
            <div className="absolute inset-0 bg-linear-to-t from-background via-background/15 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full" variant="secondary">
                  {article.contentType === "comic" ? "Comic" : "Juego"}
                </Badge>
                <Badge className="rounded-full" variant="outline">
                  News editorial
                </Badge>
              </div>
              <h1 className="mt-3 max-w-4xl font-[Lexend] font-bold text-3xl text-white drop-shadow-lg md:text-5xl">
                {article.title}
              </h1>
            </div>
          </div>
        ) : (
          <div className="bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_60%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))] px-6 py-8 md:px-8 md:py-10">
            <div className="flex items-center gap-2 text-primary">
              <HugeiconsIcon className="size-5" icon={News01Icon} />
              <span className="font-semibold text-sm uppercase tracking-[0.24em]">
                News editorial
              </span>
            </div>
            <h1 className="mt-3 max-w-4xl font-[Lexend] font-bold text-3xl md:text-5xl">
              {article.title}
            </h1>
          </div>
        )}

        <CardContent className="flex flex-col gap-4 px-6 py-6 md:px-8">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge className="rounded-full" variant="outline">
              <HugeiconsIcon className="mr-1 size-3.5" icon={Calendar03Icon} />
              {format(new Date(article.publishedAt ?? new Date()), "PPp", {
                locale: es,
              })}
            </Badge>
            <Badge className="rounded-full" variant="outline">
              {article.contentType === "comic" ? "Comic" : "Juego"} relacionado
            </Badge>
          </div>

          {article.summary ? (
            <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
              {article.summary}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              nativeButton={false}
              render={
                <Link params={{ id: article.contentId }} to="/post/$id" />
              }
              variant="outline"
            >
              Ver {article.contentType === "comic" ? "comic" : "juego"}
            </Button>
            <Button
              nativeButton={false}
              render={<Link to="/news" />}
              variant="ghost"
            >
              Volver a News
            </Button>
          </div>
        </CardContent>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <BlockNoteContent value={article.body} />
        </div>

        <aside className="space-y-4">
          <Card className="rounded-[1.5rem]">
            <CardContent className="space-y-3 p-5">
              <p className="font-semibold uppercase tracking-[0.22em] text-muted-foreground text-xs">
                Relacionado
              </p>
              <div className="space-y-2">
                <p className="font-[Lexend] font-semibold text-lg leading-tight">
                  {article.contentTitle}
                </p>
                <p className="text-muted-foreground text-sm">
                  La noticia pertenece a este{" "}
                  {article.contentType === "comic" ? "comic" : "juego"}.
                </p>
              </div>
              <Button
                className="w-full"
                nativeButton={false}
                render={
                  <Link params={{ id: article.contentId }} to="/post/$id" />
                }
              >
                Abrir contenido
              </Button>
            </CardContent>
          </Card>
        </aside>
      </section>
    </main>
  );
}
