"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import z from "zod";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppForm } from "@/hooks/use-app-form";
import { trackEvent } from "@/lib/analytics";
import { authClient, getAuthErrorMessage } from "@/lib/auth-client";

export function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const error = searchParams.get("error");

  useEffect(() => {
    if (!token && !error) {
      router.push("/auth");
    }
  }, [error, router, token]);

  const form = useAppForm({
    defaultValues: {
      confirmPassword: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      if (!token) {
        trackEvent("password_reset_completed", {
          reason: "missing_token",
          result: "failed",
        });
        return;
      }

      const { error: resetError } = await authClient.resetPassword({
        newPassword: value.password,
        token,
      });

      if (resetError) {
        trackEvent("password_reset_completed", {
          reason: resetError.code ?? "auth_error",
          result: "failed",
        });
        const message = getAuthErrorMessage(resetError.code);
        toast.error(message ?? resetError.message);
        console.error(resetError);
        return;
      }

      trackEvent("password_reset_completed", {
        result: "success",
      });
      toast.success(
        "Contrasena cambiada exitosamente! Ya puedes iniciar sesion.",
        {
          duration: 10_000,
        }
      );

      router.push("/auth");
    },
    validators: {
      onSubmit: z
        .object({ confirmPassword: z.string(), password: z.string() })
        .refine((data) => data.password === data.confirmPassword, {
          message: "Las contrasenas no coinciden",
          path: ["confirmPassword"],
        }),
    },
  });

  if (token) {
    return (
      <Card className="min-w-xs">
        <CardHeader>
          <CardTitle>Resetea tu contrasena</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <form.AppField name="password">
              {(field) => <field.TextField label="Nueva Contrasena" />}
            </form.AppField>
            <form.AppField name="confirmPassword">
              {(field) => (
                <field.TextField
                  label="Confirmar Nueva Contrasena"
                  type="password"
                />
              )}
            </form.AppField>
            <form.AppForm>
              <form.SubmitButton>Cambiar Contrasena</form.SubmitButton>
            </form.AppForm>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="min-w-xs">
        <CardHeader>
          <CardTitle>Error al restablecer la contrasena</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return null;
}
