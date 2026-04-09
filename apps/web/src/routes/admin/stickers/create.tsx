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
import { orpc } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

export const Route = createFileRoute("/admin/stickers/create")({
  component: RouteComponent,
});

const stickerCreateSchema = z.object({
  displayName: z.string().min(1).max(128),
  isActive: z.boolean(),
  mediaId: z.string().min(1, "Debes seleccionar una imagen."),
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
  const mutation = useMutation(orpc.sticker.admin.create.mutationOptions());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: mediaLibrary } = useSuspenseQuery(
    orpc.media.admin.list.queryOptions()
  );

  const form = useAppForm({
    defaultValues: {
      displayName: "",
      isActive: true,
      mediaId: "",
      name: "",
      order: 0,
      requiredTier: "level3" as PatronTier,
      type: "static" as "static" | "animated",
    },
    onSubmit: async (formData) => {
      await toast
        .promise(mutation.mutateAsync(formData.value), {
          error: (error) => ({
            duration: 10_000,
            message: `Error al crear sticker: ${error}`,
          }),
          loading: "Creando sticker...",
          success: "Sticker creado!",
        })
        .unwrap();

      await queryClient.invalidateQueries({
        queryKey: orpc.sticker.admin.list.queryKey(),
      });
      await queryClient.invalidateQueries({
        queryKey: orpc.media.admin.list.queryKey(),
      });
      navigate({ to: "/admin/stickers" });
    },
    validators: { onSubmit: stickerCreateSchema },
  });

  const selectedMediaId = useStore(form.store, (state) => state.values.mediaId);
  const selectedMedia = mediaLibrary.find(
    (item) => item.id === selectedMediaId
  );

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
            <CardTitle>Crear Sticker</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2 flex justify-center">
              <div className="flex size-28 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-muted/30">
                {selectedMedia ? (
                  <img
                    alt="Vista previa"
                    className="size-24 object-contain"
                    src={getBucketUrl(selectedMedia.objectKey)}
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
                  placeholder="cool-cat"
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="displayName">
              {(field) => (
                <field.TextField
                  label="Nombre visible"
                  placeholder="Gato Cool"
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

            <form.AppField name="mediaId">
              {(field) => (
                <field.MediaField
                  description="Selecciona o sube un archivo desde la biblioteca de media."
                  label="Imagen"
                  maxItems={1}
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
