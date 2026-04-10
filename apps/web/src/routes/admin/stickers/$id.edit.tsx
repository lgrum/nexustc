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
import {
  createDeferredMediaSelectionFromExistingId,
  getDeferredMediaPreviewSource,
  requiredSingleDeferredMediaSelectionSchema,
} from "@/lib/deferred-media";
import { orpc, orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

export const Route = createFileRoute("/admin/stickers/$id/edit")({
  component: RouteComponent,
  gcTime: 0,
  loader: async ({ params }) => ({
    sticker: await orpcClient.sticker.admin.getById(params.id),
  }),
});

const stickerEditSchema = z.object({
  displayName: z.string().min(1).max(128),
  id: z.string(),
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
  const { sticker } = Route.useLoaderData();
  const mutation = useMutation(orpc.sticker.admin.update.mutationOptions());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: mediaLibrary } = useSuspenseQuery(
    orpc.media.admin.list.queryOptions()
  );

  const form = useAppForm({
    defaultValues: {
      displayName: sticker.displayName,
      id: sticker.id,
      isActive: sticker.isActive,
      mediaSelection: createDeferredMediaSelectionFromExistingId(
        sticker.mediaId
      ),
      name: sticker.name,
      order: sticker.order,
      requiredTier: sticker.requiredTier,
      type: sticker.type as "static" | "animated",
    },
    onSubmit: async (formData) => {
      await toast
        .promise(mutation.mutateAsync(formData.value), {
          error: (error) => ({
            duration: 10_000,
            message: `Error al editar sticker: ${error}`,
          }),
          loading: "Editando sticker...",
          success: "Sticker editado!",
        })
        .unwrap();

      await queryClient.invalidateQueries(
        orpc.sticker.admin.list.queryOptions()
      );
      await queryClient.invalidateQueries(orpc.media.admin.list.queryOptions());
      navigate({ to: "/admin/stickers" });
    },
    validators: { onSubmit: stickerEditSchema },
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
            <CardTitle>Editar Sticker</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2 flex justify-center">
              <div className="flex size-28 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/30">
                <img
                  alt={sticker.displayName}
                  className="size-24 object-contain"
                  src={getBucketUrl(selectedMediaSource ?? sticker.assetKey)}
                />
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

            <form.AppField name="mediaSelection">
              {(field) => (
                <field.MediaField
                  description="Reemplaza el asset del sticker con un archivo preparado desde la biblioteca."
                  label="Imagen"
                  maxItems={1}
                  ownerKind="Sticker"
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
