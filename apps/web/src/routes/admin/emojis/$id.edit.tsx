import { PATRON_TIER_KEYS } from "@repo/shared/constants";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
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
import {
  convertImage,
  getBucketUrl,
  uploadBlobWithProgress,
} from "@/lib/utils";

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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      displayName: emoji.displayName,
      id: emoji.id,
      isActive: emoji.isActive,
      name: emoji.name,
      order: emoji.order,
      requiredTier: emoji.requiredTier,
      type: emoji.type as "static" | "animated",
    },
    onSubmit: async (formData) => {
      const values = formData.value;
      let { assetKey } = emoji;
      let { assetFormat } = emoji;

      if (file) {
        const isAnimated = values.type === "animated";
        const uploadFile = isAnimated
          ? file
          : await convertImage(file, "webp", 0.8);

        const extension = isAnimated
          ? file.name.split(".").pop()?.toLowerCase() === "gif"
            ? "gif"
            : "webp"
          : "webp";
        assetKey = `emojis/${values.name}.${extension}`;
        assetFormat = extension;

        const { presignedUrl } = await orpcClient.emoji.admin.getUploadUrl({
          contentLength: uploadFile.size,
          extension: extension as "webp" | "gif",
          name: values.name,
        });

        await uploadBlobWithProgress(uploadFile, presignedUrl);
      }

      await toast
        .promise(
          mutation.mutateAsync({
            ...values,
            assetFormat,
            assetKey,
          }),
          {
            error: (error) => ({
              duration: 10_000,
              message: `Error al editar emoji: ${error}`,
            }),
            loading: "Editando emoji...",
            success: "Emoji editado!",
          }
        )
        .unwrap();
      await queryClient.invalidateQueries(orpc.emoji.admin.list.queryOptions());
      navigate({ to: "/admin/emojis" });
    },
    validators: { onSubmit: emojiEditSchema },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) {
      return;
    }
    setFile(selected);
    const url = URL.createObjectURL(selected);
    setPreview(url);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Editar Emoji</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="col-span-2 flex justify-center">
            <img
              alt={emoji.displayName}
              className="size-16"
              src={preview ?? getBucketUrl(emoji.assetKey)}
            />
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
                placeholder="Corazón"
                required
              />
            )}
          </form.AppField>

          <form.AppField name="type">
            {(field) => (
              <field.SelectField
                label="Tipo"
                options={[
                  { label: "Estático", value: "static" },
                  { label: "Animado", value: "animated" },
                ]}
              />
            )}
          </form.AppField>

          <div className="col-span-2 flex flex-col gap-2">
            <label className="font-medium text-sm" htmlFor="emoji-file">
              Reemplazar imagen
            </label>
            <input
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="emoji-file"
              onChange={handleFileChange}
              type="file"
            />
          </div>

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
                  onCheckedChange={(val) => field.handleChange(val)}
                />
                <Label>{field.state.value ? "Activo" : "Inactivo"}</Label>
              </div>
            )}
          </form.AppField>
        </CardContent>
        <CardFooter>
          <form.AppForm>
            <form.SubmitButton className="w-full">Editar</form.SubmitButton>
          </form.AppForm>
        </CardFooter>
      </Card>
    </form>
  );
}
