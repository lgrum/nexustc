"use client";

import {
  LockPasswordIcon,
  LogoutSquare01Icon,
  ShieldUserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { toast } from "sonner";
import z from "zod";

import {
  ProfilePanel,
  ProfileSectionHeader,
} from "@/components/profile/profile-section";
import { TwoFactorSettings } from "@/components/profile/two-factor-settings";
import { Button } from "@/components/ui/button";
import { useAppForm } from "@/hooks/use-app-form";
import { trackEvent } from "@/lib/analytics";
import { authClient, getAuthErrorMessage } from "@/lib/auth-client";

export const passwordSchema = z
  .object({
    confirmNewPassword: z
      .string()
      .min(8, "Debe tener al menos 8 caracteres")
      .max(64, "Debe tener como máximo 64 caracteres"),
    currentPassword: z.string().min(1, "Requerido"),
    email: z.string(),
    newPassword: z
      .string()
      .min(8, "Debe tener al menos 8 caracteres")
      .max(64, "Debe tener como máximo 64 caracteres"),
  })
  .refine((values) => values.confirmNewPassword === values.newPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmNewPassword"],
  });

export function SecuritySection({
  email,
  isSigningOut,
  onSignOut,
  twoFactorEnabled,
}: {
  email: string;
  isSigningOut: boolean;
  onSignOut: () => void;
  twoFactorEnabled: boolean;
}) {
  return (
    <div className="space-y-5">
      <ProfilePanel className="p-5 sm:p-6">
        <ProfileSectionHeader
          description="Añade una segunda comprobación a tu inicio de sesión y conserva los códigos de recuperación en un lugar seguro."
          eyebrow="Seguridad"
          icon={ShieldUserIcon}
          title="Verificación en dos pasos"
        />
        <div className="mt-6">
          <TwoFactorSettings email={email} enabled={twoFactorEnabled} />
        </div>
      </ProfilePanel>

      <ProfilePanel className="p-5 sm:p-6">
        <ProfileSectionHeader
          description="Al cambiarla, cerraremos las demás sesiones para proteger la cuenta."
          eyebrow="Credenciales"
          icon={LockPasswordIcon}
          title="Cambiar contraseña"
        />
        <div className="mt-6 max-w-xl">
          <ChangePasswordForm email={email} />
        </div>
      </ProfilePanel>

      <ProfilePanel className="border-destructive/20 p-5 sm:p-6">
        <ProfileSectionHeader
          action={
            <Button
              disabled={isSigningOut}
              onClick={onSignOut}
              variant="outline"
            >
              <HugeiconsIcon
                aria-hidden
                className="size-4"
                icon={LogoutSquare01Icon}
              />
              {isSigningOut ? "Cerrando sesión" : "Cerrar sesión"}
            </Button>
          }
          description="Finaliza la sesión actual en este dispositivo. Tus demás sesiones no se verán afectadas."
          eyebrow="Sesión actual"
          icon={LogoutSquare01Icon}
          title="Salir de NeXusTC"
        />
      </ProfilePanel>
    </div>
  );
}

export function ChangePasswordForm({ email }: { email: string }) {
  const form = useAppForm({
    defaultValues: {
      confirmNewPassword: "",
      currentPassword: "",
      email,
      newPassword: "",
    },
    onSubmit: async () => {
      const { values } = form.state;

      try {
        const { error } = await authClient.changePassword({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
          revokeOtherSessions: true,
        });

        if (error) {
          trackEvent("password_changed", {
            reason: error.code ?? "auth_error",
            result: "failed",
          });
          toast.error(
            error.code ? getAuthErrorMessage(error.code) : error.message
          );
          return;
        }

        toast.success("Contraseña cambiada exitosamente");
        trackEvent("password_changed", { result: "success" });
        form.reset();
      } catch (error) {
        trackEvent("password_changed", {
          reason: "exception",
          result: "failed",
        });
        toast.error(
          error instanceof Error
            ? error.message
            : "No pudimos cambiar la contraseña."
        );
      }
    },
    validators: {
      onSubmit: passwordSchema,
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        form.handleSubmit();
      }}
    >
      <form.AppField name="email">
        {(field) => (
          <field.TextField
            autoComplete="email"
            className="hidden"
            label="Correo electrónico"
            type="email"
          />
        )}
      </form.AppField>
      <form.AppField name="currentPassword">
        {(field) => (
          <field.TextField
            autoComplete="current-password"
            label="Contraseña actual"
            type="password"
          />
        )}
      </form.AppField>
      <form.AppField name="newPassword">
        {(field) => (
          <field.TextField
            autoComplete="new-password"
            label="Nueva contraseña"
            type="password"
          />
        )}
      </form.AppField>
      <form.AppField name="confirmNewPassword">
        {(field) => (
          <field.TextField
            autoComplete="new-password"
            label="Confirmar nueva contraseña"
            type="password"
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton>Cambiar contraseña</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}
