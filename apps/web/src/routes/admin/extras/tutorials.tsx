import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useConfirm } from "@omit/react-confirm-dialog";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppForm } from "@/hooks/use-app-form";
import { orpc, orpcClient } from "@/lib/orpc";

const query = orpc.extras.getTutorials.queryOptions();

export const Route = createFileRoute("/admin/extras/tutorials")({
  component: RouteComponent,
  loader: () => orpcClient.extras.getTutorials(),
});

function RouteComponent() {
  const { data: tutorials } = useSuspenseQuery(query);
  const queryClient = useQueryClient();
  const deleteTutorialMutation = useMutation({
    ...orpc.extras.deleteTutorial.mutationOptions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries(query);
    },
  });
  const confirm = useConfirm();

  const form = useAppForm({
    defaultValues: {
      description: "",
      embedUrl: "",
      title: "",
    },
    onSubmit: async ({ value }) => {
      await orpcClient.extras.createTutorial(value);
      await queryClient.invalidateQueries(query);
      form.reset();
    },
    validators: {
      onSubmit: z.object({
        description: z.string(),
        embedUrl: z.url(),
        title: z.string(),
      }),
    },
  });

  return (
    <main className="flex h-[90dvh] max-h-screen w-full flex-col items-center gap-6 overflow-hidden p-6">
      <form
        className="flex h-full w-xl flex-1 flex-col justify-center gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <h1 className="font-bold text-2xl">Tutoriales</h1>
        <div className="space-y-4">
          <form.AppField name="title">
            {(field) => <field.TextField label="Título" placeholder="Título" />}
          </form.AppField>
          <form.AppField name="embedUrl">
            {(field) => (
              <field.TextField
                label="URL Embed"
                placeholder="URL Embed"
                required
              />
            )}
          </form.AppField>
          <form.AppField name="description">
            {(field) => (
              <field.TextareaField
                label="Descripción"
                placeholder="Descripción"
              />
            )}
          </form.AppField>
        </div>
        <div>
          <form.AppForm>
            <form.SubmitButton className="flex-1">Crear</form.SubmitButton>
          </form.AppForm>
        </div>
      </form>
      <ScrollArea className="h-25 flex-1">
        <section className="grid grid-cols-3 gap-6">
          {tutorials.map((tutorial) => (
            <Card key={tutorial.id}>
              <CardHeader>
                <CardTitle>{tutorial.title}</CardTitle>
                <CardDescription>{tutorial.description}</CardDescription>
                <CardAction>
                  <Button
                    disabled={deleteTutorialMutation.isPending}
                    onClick={async () => {
                      const isConfirmed = await confirm({
                        cancelText: "Cancelar",
                        confirmText: "Eliminar",
                        description:
                          "¿Estás absolutamente seguro de que quieres eliminar este tutorial? Esta acción no se puede deshacer.",
                        title: "Eliminar Tutorial",
                      });

                      if (!isConfirmed) {
                        return;
                      }

                      toast.promise(
                        deleteTutorialMutation.mutateAsync({
                          id: tutorial.id,
                        }),
                        {
                          error: (error) => ({
                            duration: 10_000,
                            message: `Error al eliminar tutorial: ${error}`,
                          }),
                          loading: "Eliminando tutorial...",
                          success: "Tutorial eliminado",
                        }
                      );
                    }}
                    size="icon"
                    variant="destructive"
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="mt-auto">
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="aspect-video w-full"
                  referrerPolicy="strict-origin-when-cross-origin"
                  src={tutorial.embedUrl}
                  title="YouTube video player"
                />
              </CardContent>
            </Card>
          ))}
        </section>
      </ScrollArea>
    </main>
  );
}
