import { ROLE_LABELS } from "@repo/shared/constants";
import type { Role } from "@repo/shared/permissions";
import { getAllowedRoles } from "@repo/shared/permissions";
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
import { orpcClient } from "@/lib/orpc";

import type { AdminUser } from "./types";

export function SetRoleDialog({
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
  const session = authClient.useSession();
  const currentRole = (session.data?.user?.role ?? "user") as Role;
  const roleOptions = getAllowedRoles(currentRole).map((role) => ({
    label: ROLE_LABELS[role] ?? role,
    value: role,
  }));

  const form = useAppForm({
    defaultValues: {
      role: user.role as Role,
    },
    onSubmit: async ({ value }) => {
      await toast
        .promise(
          orpcClient.user.admin.setRole({
            role: value.role,
            userId: user.id,
          }),
          {
            error: "Error al cambiar rol.",
            loading: "Cambiando rol...",
            success: "Rol actualizado.",
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
          <DialogTitle>Cambiar Rol</DialogTitle>
          <DialogDescription>
            Cambiar rol de {user.name} ({user.email})
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <div className="space-y-4">
            <form.AppField name="role">
              {(field) => (
                <field.SelectField label="Rol" options={roleOptions} />
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
