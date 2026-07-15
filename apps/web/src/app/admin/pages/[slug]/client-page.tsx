"use client";

import { useMutation } from "@tanstack/react-query";
import MDEditor from "@uiw/react-md-editor";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpcClient, queryClient } from "@/lib/orpc";

const PAGE_TITLES: Record<string, string> = {
  about: "Sobre Nosotros",
  legal: "Aviso Legal",
  privacy: "PolÃ­tica de Privacidad",
  terms: "TÃ©rminos y Condiciones",
};

export type StaticPageData = {
  title: string;
  content: string;
};

export type StaticPageSlug = "about" | "legal" | "privacy" | "terms";

export function ClientPage({
  initialData,
  slug,
}: {
  initialData: StaticPageData;
  slug: StaticPageSlug;
}) {
  return <StaticPageEditor initialData={initialData} key={slug} slug={slug} />;
}

function StaticPageEditor({
  initialData,
  slug,
}: {
  initialData: StaticPageData;
  slug: StaticPageSlug;
}) {
  const [currentData, setCurrentData] = useState<StaticPageData>(initialData);
  const [savedData, setSavedData] = useState<StaticPageData>(initialData);
  const [blockerDialogOpen, setBlockerDialogOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const router = useRouter();

  const hasChanges = useMemo(
    () =>
      currentData.title !== savedData.title ||
      currentData.content !== savedData.content,
    [currentData, savedData]
  );

  useEffect(() => {
    if (!hasChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    const handleClick = (event: MouseEvent) => {
      const { target } = event;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return;
      }

      event.preventDefault();
      setPendingHref(`${url.pathname}${url.search}${url.hash}`);
      setBlockerDialogOpen(true);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [hasChanges]);

  const updateMutation = useMutation({
    mutationFn: () =>
      orpcClient.staticPage.update({
        content: currentData.content,
        slug,
        title: currentData.title,
      }),
    onError: (error) => {
      toast.error(
        `Error al actualizar pÃ¡gina: ${error instanceof Error ? error.message : "Error desconocido"}`,
        { duration: 5000 }
      );
    },
    onSuccess: async (data) => {
      const newData = {
        content: data.content,
        title: data.title,
      };

      setSavedData(newData);
      setCurrentData(newData);

      await queryClient.invalidateQueries({
        predicate: (query) => {
          const [key] = query.queryKey;
          return typeof key === "string" && key.includes("staticPage");
        },
      });

      toast.success("PÃ¡gina actualizada correctamente", { duration: 3000 });
    },
  });

  const handleSave = () => {
    updateMutation.mutate();
  };

  const handleDiscard = () => {
    setCurrentData(savedData);
  };

  return (
    <main className="flex flex-col gap-6">
      <h1 className="font-bold text-2xl">
        Editar PÃ¡gina: {PAGE_TITLES[slug]}
      </h1>

      <div className="flex flex-row items-center gap-4">
        <Button
          disabled={!hasChanges}
          loading={updateMutation.isPending}
          onClick={handleSave}
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
        <div className="flex flex-col gap-2">
          <Label htmlFor="title">TÃ­tulo de la PÃ¡gina</Label>
          <Input
            id="title"
            onChange={(e) =>
              setCurrentData((prev) => ({ ...prev, title: e.target.value }))
            }
            placeholder="TÃ­tulo de la pÃ¡gina"
            value={currentData.title}
          />
          <p className="text-muted-foreground text-sm">
            Este tÃ­tulo se mostrarÃ¡ en la pestaÃ±a del navegador
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-semibold text-lg">Contenido</h2>
        <p className="text-muted-foreground text-sm">
          Escribe el contenido de la pÃ¡gina en formato Markdown
        </p>

        <div data-color-mode="dark">
          <MDEditor
            height={600}
            onChange={(value) =>
              setCurrentData((prev) => ({
                ...prev,
                content: value ?? "",
              }))
            }
            preview="live"
            value={currentData.content}
          />
        </div>
      </section>

      <AlertDialog
        onOpenChange={(open) => {
          setBlockerDialogOpen(open);
          if (!open) {
            setPendingHref(null);
          }
        }}
        open={blockerDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Â¿Descartar cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios sin guardar. Â¿EstÃ¡s seguro de que quieres salir
              sin guardar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingHref(null);
                setBlockerDialogOpen(false);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingHref) {
                  router.push(pendingHref);
                }
                setBlockerDialogOpen(false);
              }}
            >
              Salir sin guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
