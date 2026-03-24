import { PATRON_TIER_KEYS } from "@repo/shared/constants";
import type { PatronTier } from "@repo/shared/constants";
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
import { useAppForm } from "@/hooks/use-app-form";
import { orpc, orpcClient } from "@/lib/orpc";
import { convertImage, uploadBlobWithProgress } from "@/lib/utils";

export const Route = createFileRoute("/admin/stickers/create")({
  component: RouteComponent,
});

const stickerCreateSchema = z.object({
  displayName: z.string().min(1).max(128),
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
  const mutation = useMutation(orpc.sticker.admin.create.mutationOptions());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: {
      displayName: "",
      isActive: true,
      name: "",
      order: 0,
      requiredTier: "level3" as PatronTier,
      type: "static" as "static" | "animated",
    },
    onSubmit: async (formData) => {
      if (!file) {
        toast.error("Debes seleccionar un archivo de imagen.");
        return;
      }

      const values = formData.value;
      const isAnimated = values.type === "animated";
      const uploadFile = isAnimated
        ? file
        : await convertImage(file, "webp", 0.8);

      const extension = isAnimated
        ? file.name.split(".").pop()?.toLowerCase() === "gif"
          ? "gif"
          : "webp"
        : "webp";
      const assetKey = `stickers/${values.name}.${extension}`;

      const { presignedUrl } = await orpcClient.sticker.admin.getUploadUrl({
        contentLength: uploadFile.size,
        extension: extension as "webp" | "gif",
        name: values.name,
      });

      await uploadBlobWithProgress(uploadFile, presignedUrl);

      await toast
        .promise(
          mutation.mutateAsync({
            ...values,
            assetFormat: extension,
            assetKey,
          }),
          {
            error: (error) => ({
              duration: 10_000,
              message: `Error al crear sticker: ${error}`,
            }),
            loading: "Creando sticker...",
            success: "Sticker creado!",
          }
        )
        .unwrap();
      await queryClient.invalidateQueries(
        orpc.sticker.admin.list.queryOptions()
      );
      navigate({ to: "/admin/stickers" });
    },
    validators: { onSubmit: stickerCreateSchema },
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
          <CardTitle>Crear Sticker</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
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
                  { label: "Estático", value: "static" },
                  { label: "Animado", value: "animated" },
                ]}
              />
            )}
          </form.AppField>

          <div className="col-span-2 flex flex-col gap-2">
            <label className="font-medium text-sm" htmlFor="sticker-file">
              Imagen *
            </label>
            <input
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              id="sticker-file"
              onChange={handleFileChange}
              required
              type="file"
            />
            {preview && (
              <div className="flex justify-center pt-2">
                <img
                  alt="Vista previa"
                  className="size-24 object-contain"
                  src={preview}
                />
              </div>
            )}
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
        </CardContent>
        <CardFooter>
          <form.AppForm>
            <form.SubmitButton className="w-full">Crear</form.SubmitButton>
          </form.AppForm>
        </CardFooter>
      </Card>
    </form>
  );
}
