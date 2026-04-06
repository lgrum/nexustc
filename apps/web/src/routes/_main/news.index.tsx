import { News01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { orpcClient, safeOrpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

const NEWS_LIMIT = 36;

export const Route = createFileRoute("/_main/news/")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - News",
      },
    ],
  }),
  loader: async () => {
    const [error, data, isDefined] =
      await safeOrpcClient.notification.listPublishedNewsArticles({
        limit: NEWS_LIMIT,
      });

    if (isDefined && error) {
      throw error;
    }

    return data ?? [];
  },
});

function RouteComponent() {
  const initialArticles = Route.useLoaderData();
  const { data: articles = initialArticles } = useQuery({
    initialData: initialArticles,
    queryFn: () =>
      orpcClient.notification.listPublishedNewsArticles({
        limit: NEWS_LIMIT,
      }),
    queryKey: ["news", "published", NEWS_LIMIT],
  });

  return (
    <main className="flex flex-col gap-8 py-6">
      <section className="overflow-hidden rounded-[2rem] border border-primary/15 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_58%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))] p-6">
        <div className="flex items-center gap-2 text-primary">
          <HugeiconsIcon className="size-5" icon={News01Icon} />
          <span className="font-semibold text-sm uppercase tracking-[0.24em]">
            News
          </span>
        </div>
        <h1 className="mt-3 font-[Lexend] font-bold text-3xl">
          Todas las noticias editoriales en un solo lugar
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground text-sm leading-6">
          Sigue los articulos del staff sobre juegos y comics, con acceso
          directo a la nota completa y al contenido relacionado.
        </p>
      </section>

      {articles.length === 0 ? (
        <Card className="rounded-[1.75rem] border-dashed">
          <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full border border-primary/20 bg-primary/10 p-3 text-primary">
              <HugeiconsIcon className="size-5" icon={News01Icon} />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-sm">Todavia no hay articulos</p>
              <p className="max-w-sm text-muted-foreground text-sm">
                Cuando el staff publique nuevas noticias, apareceran aqui.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {articles.map((article) => (
            <Link
              className="group block outline-none"
              key={article.id}
              params={{ id: article.id }}
              to="/news/$id"
            >
              <Card className="h-full rounded-[1.6rem] border-border/70 bg-card/90 pt-0 transition-transform duration-200 group-hover:-translate-y-1">
                {article.bannerImageObjectKey ? (
                  <div className="aspect-[1.85/1] overflow-hidden border-border/40 border-b">
                    <img
                      alt={article.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      src={getBucketUrl(article.bannerImageObjectKey)}
                    />
                  </div>
                ) : (
                  <div className="flex aspect-[1.85/1] items-center justify-center border-border/40 border-b bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.18),transparent_62%),linear-gradient(180deg,hsl(var(--muted)/0.75),hsl(var(--background)))]">
                    <HugeiconsIcon
                      className="size-10 text-primary/70"
                      icon={News01Icon}
                    />
                  </div>
                )}

                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="rounded-full" variant="secondary">
                      {article.contentType === "comic" ? "Comic" : "Juego"}
                    </Badge>
                    <Badge className="rounded-full" variant="outline">
                      {formatNewsDate(article.publishedAt)}
                    </Badge>
                  </div>
                  <CardTitle className="text-balance font-[Lexend] text-xl leading-tight">
                    {article.title}
                  </CardTitle>
                  <p className="text-muted-foreground text-sm leading-6">
                    {article.summary || "Sin resumen disponible."}
                  </p>
                </CardHeader>

                <CardContent className="mt-auto flex items-center justify-between gap-3 pt-0 text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  <span className="truncate">{article.contentTitle}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}

function formatNewsDate(value: Date | string | null) {
  if (!value) {
    return "Sin fecha";
  }

  return format(new Date(value), "d MMM yyyy", {
    locale: es,
  });
}
