import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import MDEditor from "@uiw/react-md-editor";
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
  privacy: "Política de Privacidad",
  terms: "Términos y Condiciones",
};

type StaticPageData = {
  title: string;
  content: string;
};

type StaticPageSlug = "about" | "legal" | "privacy" | "terms";

export const Route = createFileRoute("/admin/pages/$slug")({
  component: RouteComponent,
  loader: async ({ params }) => {
    const slug = params.slug as StaticPageSlug;
    const data = await orpcClient.staticPage.getForEdit({ slug });
    return {
      initialData: {
        content: data.content || "",
        title: data.title || PAGE_TITLES[slug] || "",
      },
      slug,
    };
  },
  staleTime: 0,
});

function RouteComponent() {
  const { initialData, slug } = Route.useLoaderData();

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

  const hasChanges = useMemo(
    () =>
      currentData.title !== savedData.title ||
      currentData.content !== savedData.content,
    [currentData, savedData]
  );

  const blocker = useBlocker({
    enableBeforeUnload: true,
    shouldBlockFn: () => hasChanges,
    withResolver: true,
  });

  useEffect(() => {
    if (blocker.status === "blocked") {
      setBlockerDialogOpen(true);
    }
  }, [blocker.status]);

  const updateMutation = useMutation({
    mutationFn: () =>
      orpcClient.staticPage.update({
        content: currentData.content,
        slug,
        title: currentData.title,
      }),
    onError: (error) => {
      toast.error(
        `Error al actualizar página: ${error instanceof Error ? error.message : "Error desconocido"}`,
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

      toast.success("Página actualizada correctamente", { duration: 3000 });
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
      <h1 className="font-bold text-2xl">Editar Página: {PAGE_TITLES[slug]}</h1>

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
          <Label htmlFor="title">Título de la Página</Label>
          <Input
            id="title"
            onChange={(e) =>
              setCurrentData((prev) => ({ ...prev, title: e.target.value }))
            }
            placeholder="Título de la página"
            value={currentData.title}
          />
          <p className="text-muted-foreground text-sm">
            Este título se mostrará en la pestaña del navegador
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <h2 className="font-semibold text-lg">Contenido</h2>
        <p className="text-muted-foreground text-sm">
          Escribe el contenido de la página en formato Markdown
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
          if (!open && blocker.status === "blocked") {
            blocker.reset?.();
          }
        }}
        open={blockerDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios sin guardar. ¿Estás seguro de que quieres salir sin
              guardar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                blocker.reset?.();
                setBlockerDialogOpen(false);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                blocker.proceed?.();
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
