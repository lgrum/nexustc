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

const nameUrlCreateSchema = z.object({
  name: z.string().trim().min(1).max(255),
  url: webUrlSchema,
});

type NameUrlFormValue = z.infer<typeof nameUrlCreateSchema>;

type NameUrlCreateDialogProps<TCreated extends NameUrlFormValue> = {
  buttonLabel: string;
  dialogTitle: string;
  initialName?: string;
  initialUrl?: string;
  loadingMessage: string;
  mutationOptions: Parameters<
    typeof useMutation<TCreated | null, Error, NameUrlFormValue>
  >[0];
  namePlaceholder: string;
  onCreated?: (item: TCreated) => void;
  queryOptions: Parameters<
    ReturnType<typeof useQueryClient>["invalidateQueries"]
  >[0];
  saveLabel: string;
  successMessage: string;
  errorLabel: string;
};

export function NameUrlCreateDialog<TCreated extends NameUrlFormValue>({
  buttonLabel,
  dialogTitle,
  errorLabel,
  initialName = "",
  initialUrl = "",
  loadingMessage,
  mutationOptions,
  namePlaceholder,
  onCreated,
  queryOptions,
  saveLabel,
  successMessage,
}: NameUrlCreateDialogProps<TCreated>) {
  const [open, setOpen] = useState(false);
  const createMutation = useMutation(mutationOptions);
  const queryClient = useQueryClient();

  const form = useAppForm({
    defaultValues: {
      name: initialName,
      url: initialUrl,
    },
    onSubmit: async (formData) => {
      const createdItem = await toast
        .promise(createMutation.mutateAsync(formData.value), {
          error: (error) => ({
            duration: 10_000,
            message: `${errorLabel}: ${error}`,
          }),
          loading: loadingMessage,
          success: successMessage,
        })
        .unwrap();

      await queryClient.invalidateQueries(queryOptions);

      if (createdItem) {
        onCreated?.(createdItem);
      }

      setOpen(false);
    },
    validators: {
      onSubmit: nameUrlCreateSchema,
    },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        {buttonLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
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
                  placeholder={namePlaceholder}
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
                {saveLabel}
              </form.SubmitButton>
            </DialogFooter>
          </form.AppForm>
        </form>
      </DialogContent>
    </Dialog>
  );
}
