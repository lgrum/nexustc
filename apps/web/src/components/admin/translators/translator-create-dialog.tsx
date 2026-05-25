import { webUrlSchema } from "@repo/shared/schemas";
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
import type { orpcClient } from "@/lib/orpc";
import { orpc } from "@/lib/orpc";

type TranslatorListItem = Awaited<
  ReturnType<typeof orpcClient.translator.admin.list>
>[number];

const translatorCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  url: webUrlSchema,
});

type TranslatorCreateDialogProps = {
  buttonLabel?: string;
  initialName?: string;
  initialUrl?: string;
  onCreated?: (translator: TranslatorListItem) => void;
};

export function TranslatorCreateDialog({
  buttonLabel = "Crear traductor",
  initialName = "",
  initialUrl = "",
  onCreated,
}: TranslatorCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const createMutation = useMutation(
    orpc.translator.admin.create.mutationOptions()
  );
  const queryClient = useQueryClient();

  const form = useAppForm({
    defaultValues: {
      name: initialName,
      url: initialUrl,
    },
    onSubmit: async (formData) => {
      const createdTranslator = await toast
        .promise(createMutation.mutateAsync(formData.value), {
          error: (error) => ({
            duration: 10_000,
            message: `Error al crear traductor: ${error}`,
          }),
          loading: "Creando traductor...",
          success: "Traductor creado.",
        })
        .unwrap();

      await queryClient.invalidateQueries(
        orpc.translator.admin.list.queryOptions()
      );

      if (createdTranslator) {
        onCreated?.(createdTranslator);
      }

      setOpen(false);
    },
    validators: {
      onSubmit: translatorCreateSchema,
    },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        {buttonLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo traductor</DialogTitle>
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
                  placeholder="Nombre del traductor"
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
            <DialogFooter>
              <form.SubmitButton className="w-full">
                Guardar traductor
              </form.SubmitButton>
            </DialogFooter>
          </form.AppForm>
        </form>
      </DialogContent>
    </Dialog>
  );
}
