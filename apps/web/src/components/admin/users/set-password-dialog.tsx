import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppForm } from "@/hooks/use-app-form";
import { authClient } from "@/lib/auth-client";

import type { AdminUser } from "./types";

export function SetPasswordDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
}: {
  user: AdminUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const form = useAppForm({
    defaultValues: {
      newPassword: "",
    },
    onSubmit: async ({ value }) => {
      await toast
        .promise(
          authClient.admin.setUserPassword({
            newPassword: value.newPassword,
            userId: user.id,
          }),
          {
            error: "Error al cambiar contraseña.",
            loading: "Cambiando contraseña...",
            success: "Contraseña actualizada.",
          }
        )
        .unwrap();

      onOpenChange(false);
      onSuccess();
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar Contraseña</DialogTitle>
          <DialogDescription>
            Cambiar contraseña de {user.name} ({user.email})
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <div className="space-y-4">
            <form.AppField name="newPassword">
              {(field) => (
                <field.TextField
                  label="Nueva contraseña"
                  required
                  type="password"
                />
              )}
            </form.AppField>
            <form.AppForm>
              <form.SubmitButton className="w-full">Guardar</form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
