import { PATRON_TIER_KEYS } from "@repo/shared/constants";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppForm } from "@/hooks/use-app-form";
import { orpc, orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

export const Route = createFileRoute("/admin/emojis/$id/edit")({
  component: RouteComponent,
  gcTime: 0,
  loader: async ({ params }) => ({
    emoji: await orpcClient.emoji.admin.getById(params.id),
  }),
});

const emojiEditSchema = z.object({
  displayName: z.string().min(1).max(128),
  id: z.string(),
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
  const { emoji } = Route.useLoaderData();
  const mutation = useMutation(orpc.emoji.admin.update.mutationOptions());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: mediaLibrary } = useSuspenseQuery(
    orpc.media.admin.list.queryOptions()
  );

  const form = useAppForm({
    defaultValues: {
      displayName: emoji.displayName,
      id: emoji.id,
      isActive: emoji.isActive,
      mediaId: emoji.mediaId ?? "",
      name: emoji.name,
      order: emoji.order,
      requiredTier: emoji.requiredTier,
      type: emoji.type as "static" | "animated",
    },
    onSubmit: async (formData) => {
      await toast
        .promise(mutation.mutateAsync(formData.value), {
          error: (error) => ({
            duration: 10_000,
            message: `Error al editar emoji: ${error}`,
          }),
          loading: "Editando emoji...",
          success: "Emoji editado!",
        })
        .unwrap();

      await queryClient.invalidateQueries(orpc.emoji.admin.list.queryOptions());
      await queryClient.invalidateQueries(orpc.media.admin.list.queryOptions());
      navigate({ to: "/admin/emojis" });
    },
    validators: { onSubmit: emojiEditSchema },
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
            <CardTitle>Editar Emoji</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2 flex justify-center">
              <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/30">
                <img
                  alt={emoji.displayName}
                  className="size-16 object-contain"
                  src={getBucketUrl(selectedMedia?.objectKey ?? emoji.assetKey)}
                />
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

            <form.AppField name="isActive">
              {(field) => (
                <div className="flex items-center gap-3 self-end pb-2">
                  <Switch
                    checked={field.state.value}
                    onCheckedChange={(value) => field.handleChange(value)}
                  />
                  <Label>{field.state.value ? "Activo" : "Inactivo"}</Label>
                </div>
              )}
            </form.AppField>

            <form.AppField name="mediaId">
              {(field) => (
                <field.MediaField
                  description="Reemplaza el asset del emoji con un archivo de la biblioteca."
                  label="Imagen"
                  maxItems={1}
                  required
                />
              )}
            </form.AppField>
          </CardContent>

          <CardFooter>
            <form.SubmitButton className="w-full">Editar</form.SubmitButton>
          </CardFooter>
        </Card>
      </form.AppForm>
    </form>
  );
}
