import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAppForm } from "@/hooks/use-app-form";
import {
  createEmptyDeferredMediaSelection,
  requiredSingleDeferredMediaSelectionSchema,
} from "@/lib/deferred-media";
import type { orpcClient } from "@/lib/orpc";
import { orpc } from "@/lib/orpc";

type CreatorListItem = Awaited<
  ReturnType<typeof orpcClient.creator.admin.list>
>[number];

const creatorCreateSchema = z.object({
  mediaSelection: requiredSingleDeferredMediaSelectionSchema,
  name: z.string().trim().min(1).max(255),
  url: z.url(),
});

type CreatorCreateDialogProps = {
  buttonLabel?: string;
  initialName?: string;
  initialUrl?: string;
  onCreated?: (creator: CreatorListItem) => void;
};

export function CreatorCreateDialog({
  buttonLabel = "Crear creador",
  initialName = "",
  initialUrl = "",
  onCreated,
}: CreatorCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const createMutation = useMutation(
    orpc.creator.admin.create.mutationOptions()
  );
  const queryClient = useQueryClient();

  const form = useAppForm({
    defaultValues: {
      mediaSelection: createEmptyDeferredMediaSelection(),
      name: initialName,
      url: initialUrl,
    },
    onSubmit: async (formData) => {
      const createdCreator = await toast
        .promise(createMutation.mutateAsync(formData.value), {
          error: (error) => ({
            duration: 10_000,
            message: `Error al crear creador: ${error}`,
          }),
          loading: "Creando creador...",
          success: "Creador creado.",
        })
        .unwrap();

      await queryClient.invalidateQueries(
        orpc.creator.admin.list.queryOptions()
      );
      await queryClient.invalidateQueries(orpc.media.admin.list.queryOptions());

      if (createdCreator) {
        onCreated?.(createdCreator);
      }

      setOpen(false);
    },
    validators: {
      onSubmit: creatorCreateSchema,
    },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        {buttonLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo creador</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            form.handleSubmit();
          }}
        >
          <form.AppForm>
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  className="w-full"
                  label="Nombre"
                  placeholder="Nombre del creador"
                  required
                />
              )}
            </form.AppField>
            <form.AppField name="url">
              {(field) => (
                <field.TextField
                  className="w-full"
                  label="URL"
                  placeholder="https://..."
                  required
                />
              )}
            </form.AppField>
            <form.AppField name="mediaSelection">
              {(field) => (
                <field.MediaField
                  description="Selecciona o sube el avatar del creador desde la biblioteca central."
                  label="Avatar"
                  maxItems={1}
                  ownerKind="Creador"
                  required
                />
              )}
            </form.AppField>
            <DialogFooter>
              <form.SubmitButton className="w-full">
                Guardar creador
              </form.SubmitButton>
            </DialogFooter>
          </form.AppForm>
        </form>
      </DialogContent>
    </Dialog>
  );
}
