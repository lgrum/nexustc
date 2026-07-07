"use client";

import { PATRON_TIER_KEYS } from "@repo/shared/constants";
import { useStore } from "@tanstack/react-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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
import type { orpcClient } from "@/lib/orpc";
import { orpc } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

const emojiEditSchema = z.object({
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

type Emoji = Awaited<ReturnType<typeof orpcClient.emoji.admin.getById>>;

export function ClientPage({ emoji }: { emoji: Emoji }) {
  const mutation = useMutation(orpc.emoji.admin.update.mutationOptions());
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: mediaLibrary } = useSuspenseQuery(
    orpc.media.admin.list.queryOptions()
  );

  const form = useAppForm({
    defaultValues: {
      displayName: emoji.displayName,
      id: emoji.id,
      isActive: emoji.isActive,
      mediaSelection: createDeferredMediaSelectionFromExistingId(emoji.mediaId),
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
      router.push("/admin/emojis");
    },
    validators: { onSubmit: emojiEditSchema },
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
            <CardTitle>Editar Emoji</CardTitle>
          </CardHeader>

          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2 flex justify-center">
              <div className="flex size-20 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted/30">
                <img
                  alt={emoji.displayName}
                  className="size-16 object-contain"
                  src={getBucketUrl(selectedMediaSource ?? emoji.assetKey)}
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

            <form.AppField name="mediaSelection">
              {(field) => (
                <field.MediaField
                  description="Reemplaza el asset del emoji con un archivo preparado desde la biblioteca."
                  label="Imagen"
                  maxItems={1}
                  ownerKind="Emoji"
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
