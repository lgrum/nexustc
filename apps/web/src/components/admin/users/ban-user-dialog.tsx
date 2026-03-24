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

const expiresOptions = [
  { label: "Permanente", value: "permanent" },
  { label: "1 hora", value: "3600" },
  { label: "1 día", value: "86400" },
  { label: "7 días", value: "604800" },
  { label: "30 días", value: "2592000" },
];

export function BanUserDialog({
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
      banExpiresIn: "permanent",
      banReason: "",
    },
    onSubmit: async ({ value }) => {
      const expiresIn =
        value.banExpiresIn === "permanent"
          ? undefined
          : Number(value.banExpiresIn);

      await toast
        .promise(
          authClient.admin.banUser({
            banExpiresIn: expiresIn,
            banReason: value.banReason || undefined,
            userId: user.id,
          }),
          {
            error: "Error al banear usuario.",
            loading: "Baneando usuario...",
            success: "Usuario baneado.",
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
          <DialogTitle>Banear Usuario</DialogTitle>
          <DialogDescription>
            Banear a {user.name} ({user.email})
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <div className="space-y-4">
            <form.AppField name="banReason">
              {(field) => <field.TextField label="Razón del baneo" />}
            </form.AppField>
            <form.AppField name="banExpiresIn">
              {(field) => (
                <field.SelectField label="Duración" options={expiresOptions} />
              )}
            </form.AppField>
            <form.AppForm>
              <form.SubmitButton className="w-full">Banear</form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
