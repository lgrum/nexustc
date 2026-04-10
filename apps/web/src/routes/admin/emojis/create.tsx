import { PATRON_TIER_KEYS } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
import { useStore } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppForm } from "@/hooks/use-app-form";
import {
  createEmptyDeferredMediaSelection,
  getDeferredMediaPreviewSource,
  requiredSingleDeferredMediaSelectionSchema,
} from "@/lib/deferred-media";
import { orpc } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

export const Route = createFileRoute("/admin/emojis/create")({
  component: RouteComponent,
});

const emojiCreateSchema = z.object({
  displayName: z.string().min(1).max(128),
  isActive: z.boolean(),
  mediaSelection: requiredSingleDeferredMediaSelectionSchema,
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^\w[\w-]*$/),
  order: z.number().int(),
  requiredTier: z.enum(PATRON_TIER_KEYS),
  type: z.enum(["static", "animated"]),
});

function RouteComponent() {
  const mutation = useMutation(orpc.emoji.admin.create.mutationOptions());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: mediaLibrary } = useSuspenseQuery(
    orpc.media.admin.list.queryOptions()
  );

  const form = useAppForm({
    defaultValues: {
      displayName: "",
      isActive: true,
      mediaSelection: createEmptyDeferredMediaSelection(),
      name: "",
      order: 0,
      requiredTier: "level1" as PatronTier,
      type: "static" as "static" | "animated",
    },
    onSubmit: async (formData) => {
      await toast.promise(mutation.mutateAsync(formData.value), {
        error: (error) => ({
          duration: 10_000,
          message: `Error al crear emoji: ${error}`,
        }),
        loading: "Creando emoji...",
        success: "Emoji creado!",
      });

      await queryClient.invalidateQueries({
        queryKey: orpc.emoji.admin.list.queryKey(),
      });
      await queryClient.invalidateQueries({
        queryKey: orpc.media.admin.list.queryKey(),
      });
      navigate({ to: "/admin/emojis" });
    },
    validators: { onSubmit: emojiCreateSchema },
  });

  const mediaSelection = useStore(
    form.store,
    (state) => state.values.mediaSelection
  );
  const mediaMap = new Map(mediaLibrary.map((item) => [item.id, item]));
  const selectedMediaSource = mediaSelection[0]
    ? getDeferredMediaPreviewSource(mediaSelection[0], mediaMap)
    : null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        form.handleSubmit();
      }}
    >
      <form.AppForm>
        <Card>
          <CardHeader>
            <CardTitle>Crear Emoji</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2 flex justify-center">
              <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/30">
                {selectedMediaSource ? (
                  <img
                    alt="Vista previa"
                    className="size-16 object-contain"
                    src={getBucketUrl(selectedMediaSource)}
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">
                    Sin imagen
                  </span>
                )}
              </div>
            </div>

            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label="Nombre (token)"
                  placeholder="heart"
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="displayName">
              {(field) => (
                <field.TextField
                  label="Nombre visible"
                  placeholder="Corazon"
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="type">
              {(field) => (
                <field.SelectField
                  label="Tipo"
                  options={[
                    { label: "Estatico", value: "static" },
                    { label: "Animado", value: "animated" },
                  ]}
                />
              )}
            </form.AppField>

            <form.AppField name="requiredTier">
              {(field) => (
                <field.SelectField
                  label="Tier requerido"
                  options={PATRON_TIER_KEYS.map((tier) => ({
                    label: tier,
                    value: tier,
                  }))}
                />
              )}
            </form.AppField>

            <form.AppField name="order">
              {(field) => (
                <field.TextField label="Orden" placeholder="0" type="number" />
              )}
            </form.AppField>

            <form.AppField name="mediaSelection">
              {(field) => (
                <field.MediaField
                  description="Selecciona o prepara un archivo desde la biblioteca de media."
                  label="Imagen"
                  maxItems={1}
                  ownerKind="Emoji"
                  required
                />
              )}
            </form.AppField>
          </CardContent>

          <CardFooter>
            <form.SubmitButton className="w-full">Crear</form.SubmitButton>
          </CardFooter>
        </Card>
      </form.AppForm>
    </form>
  );
}
