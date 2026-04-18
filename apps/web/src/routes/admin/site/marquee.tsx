import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MarqueeItem } from "@repo/shared/schemas";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpcClient, queryClient } from "@/lib/orpc";
import { ownerMiddleware } from "@/middleware/owner";

type MarqueeDraftItem = {
  id: string;
  text: string;
  url: string;
};

export const Route = createFileRoute("/admin/site/marquee")({
  component: RouteComponent,
  loader: async () => {
    const data = await orpcClient.siteConfig.getMarqueeForEdit();
    return {
      initialItems: createDraftItems(data.items),
    };
  },
  server: {
    middleware: [ownerMiddleware],
  },
  staleTime: 0,
});

function RouteComponent() {
  const { initialItems } = Route.useLoaderData();

  return <MarqueeEditor initialItems={initialItems} />;
}

function MarqueeEditor({ initialItems }: { initialItems: MarqueeDraftItem[] }) {
  const [currentItems, setCurrentItems] =
    useState<MarqueeDraftItem[]>(initialItems);
  const [savedItems, setSavedItems] =
    useState<MarqueeDraftItem[]>(initialItems);

  const currentMarqueeItems = useMemo(
    () => normalizeDraftItems(currentItems),
    [currentItems]
  );
  const savedMarqueeItems = useMemo(
    () => normalizeDraftItems(savedItems),
    [savedItems]
  );
  const hasChanges = useMemo(
    () =>
      JSON.stringify(currentMarqueeItems) !== JSON.stringify(savedMarqueeItems),
    [currentMarqueeItems, savedMarqueeItems]
  );

  const hasInvalidItems = currentItems.some((item) => item.text.trim() === "");

  const updateMutation = useMutation({
    mutationFn: () =>
      orpcClient.siteConfig.updateMarquee({ items: currentMarqueeItems }),
    onError: (error) => {
      toast.error(
        `Error al actualizar marquee: ${error instanceof Error ? error.message : "Error desconocido"}`,
        { duration: 5000 }
      );
    },
    onSuccess: async (data) => {
      const nextItems = createDraftItems(data.items);
      setCurrentItems(nextItems);
      setSavedItems(nextItems);

      await queryClient.invalidateQueries({
        predicate: (query) => {
          const [key] = query.queryKey;
          return typeof key === "string" && key.includes("siteConfig");
        },
      });

      toast.success("Marquee actualizado correctamente", { duration: 3000 });
    },
  });

  const updateItem = (id: string, field: "text" | "url", value: string) => {
    setCurrentItems((items) =>
      items.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const addItem = () => {
    setCurrentItems((items) => [
      ...items,
      {
        id: createClientId(),
        text: "",
        url: "",
      },
    ]);
  };

  const removeItem = (id: string) => {
    setCurrentItems((items) => items.filter((item) => item.id !== id));
  };

  const handleDiscard = () => {
    setCurrentItems(savedItems);
  };

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl">Editar Marquesina</h1>
        <p className="text-muted-foreground text-sm">
          Administra los textos que aparecen en la barra superior del sitio.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!hasChanges || hasInvalidItems}
          loading={updateMutation.isPending}
          onClick={() => updateMutation.mutate()}
        >
          Guardar Cambios
        </Button>
        <Button
          disabled={!hasChanges}
          onClick={handleDiscard}
          variant="outline"
        >
          Descartar Cambios
        </Button>
        {hasChanges && <Badge variant="outline">Cambios sin guardar</Badge>}
      </div>

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">Elementos</h2>
            <p className="text-muted-foreground text-sm">
              El enlace es opcional. Puede ser una URL completa o una ruta del
              sitio.
            </p>
          </div>
          <Button onClick={addItem} type="button" variant="outline">
            <HugeiconsIcon className="size-4" icon={PlusSignIcon} />
            Agregar
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          {currentItems.map((item, index) => (
            <div className="grid gap-3 rounded-lg border p-3" key={item.id}>
              <div className="flex items-center justify-between gap-3">
                <Badge variant="secondary">Elemento {index + 1}</Badge>
                <Button
                  aria-label={`Eliminar elemento ${index + 1}`}
                  disabled={currentItems.length === 1}
                  onClick={() => removeItem(item.id)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon className="size-4" icon={Delete02Icon} />
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="grid gap-2">
                  <Label htmlFor={`${item.id}-text`}>Texto</Label>
                  <Input
                    id={`${item.id}-text`}
                    maxLength={120}
                    onChange={(event) =>
                      updateItem(item.id, "text", event.target.value)
                    }
                    placeholder="Texto del marquee"
                    value={item.text}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`${item.id}-url`}>URL</Label>
                  <Input
                    id={`${item.id}-url`}
                    onChange={(event) =>
                      updateItem(item.id, "url", event.target.value)
                    }
                    placeholder="https://... o /post/..."
                    type="url"
                    value={item.url}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-semibold text-lg">Vista previa</h2>
        <div className="overflow-hidden whitespace-nowrap rounded-md bg-primary">
          <div className="flex w-max gap-8 px-4 py-2 text-black font-[Lexend] font-bold text-sm uppercase tracking-widest">
            {currentItems.map((item) =>
              item.text.trim() && item.url.trim() ? (
                <a
                  className="underline-offset-4 hover:underline"
                  href={item.url.trim()}
                  key={item.id}
                  rel="noopener"
                  target="_blank"
                >
                  {item.text.trim()}
                </a>
              ) : item.text.trim() ? (
                <span key={item.id}>{item.text.trim()}</span>
              ) : null
            )}
            {currentMarqueeItems.length === 0 && (
              <span className="text-black/60">Sin elementos para mostrar</span>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function createDraftItems(items: readonly MarqueeItem[]): MarqueeDraftItem[] {
  return items.map((item, index) => ({
    id: `marquee-${index}-${item.text}-${item.url ?? ""}`,
    text: item.text,
    url: item.url ?? "",
  }));
}

function normalizeDraftItems(
  items: readonly MarqueeDraftItem[]
): MarqueeItem[] {
  return items
    .map((item) => ({
      text: item.text.trim(),
      url: item.url.trim() || undefined,
    }))
    .filter((item) => item.text.length > 0);
}

function createClientId() {
  return globalThis.crypto?.randomUUID?.() ?? `marquee-${Date.now()}`;
}
