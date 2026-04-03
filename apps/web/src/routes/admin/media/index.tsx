import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { orpc } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

export const Route = createFileRoute("/admin/media/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { data } = useSuspenseQuery(orpc.media.admin.list.queryOptions());

  return (
    <div className="flex w-full flex-col gap-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <div className="flex flex-col gap-3 items-start">
          <h1 className="font-semibold text-3xl">Biblioteca</h1>
          <Button>
            <HugeiconsIcon icon={PlusSignIcon} />
            Subir archivo
          </Button>
        </div>

        <div className="grid gap-3 grid-cols-2">
          <Stat label="Archivos registrados" value={String(data.length)} />
          <Stat
            label="Con uso activo"
            value={String(data.filter((item) => item.usageCount > 0).length)}
          />
        </div>
      </section>

      {data.length === 0 ? (
        <div className="py-10 text-center text-muted-foreground">
          Todavía no hay media registrada.
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {data.map((item) => (
            <div className="overflow-hidden" key={item.id}>
              <div className="aspect-video overflow-hidden bg-muted">
                <img
                  alt={item.objectKey}
                  className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
                  loading="lazy"
                  src={getBucketUrl(item.objectKey)}
                />
              </div>
              <div className="gap-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={item.usageCount > 0 ? "default" : "outline"}>
                    {item.usageCount > 0
                      ? `${item.usageCount} uso${item.usageCount === 1 ? "" : "s"}`
                      : "Sin uso"}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {formatDistanceToNow(new Date(item.createdAt), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </span>
                </div>
                <h3 className="break-all font-mono text-sm leading-5">
                  {item.objectKey}
                </h3>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="text-muted-foreground text-xs uppercase tracking-[0.22em]">
        {label}
      </div>
      <div className="mt-2 font-semibold text-2xl">{value}</div>
    </div>
  );
}
