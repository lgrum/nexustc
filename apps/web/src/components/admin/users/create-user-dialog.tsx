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

export function CreateUserDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
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
      email: "",
      name: "",
      password: "",
      role: "user" as Role,
    },
    onSubmit: async ({ value }) => {
      await toast
        .promise(
          orpcClient.user.admin.createUser({
            email: value.email,
            name: value.name,
            password: value.password,
            role: value.role,
          }),
          {
            error: "Error al crear usuario.",
            loading: "Creando usuario...",
            success: "Usuario creado.",
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
          <DialogTitle>Crear Usuario</DialogTitle>
          <DialogDescription>
            Crear un nuevo usuario en la plataforma
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <div className="space-y-4">
            <form.AppField name="name">
              {(field) => <field.TextField label="Nombre" required />}
            </form.AppField>
            <form.AppField name="email">
              {(field) => (
                <field.TextField label="Email" required type="email" />
              )}
            </form.AppField>
            <form.AppField name="password">
              {(field) => (
                <field.TextField label="Contraseña" required type="password" />
              )}
            </form.AppField>
            <form.AppField name="role">
              {(field) => (
                <field.SelectField label="Rol" options={roleOptions} />
              )}
            </form.AppField>
            <form.AppForm>
              <form.SubmitButton className="w-full">
                Crear Usuario
              </form.SubmitButton>
            </form.AppForm>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
