import { Turnstile } from "@marsidev/react-turnstile";
import { env } from "@repo/env/client";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppForm } from "@/hooks/use-app-form";
import { authClient, getAuthErrorMessage } from "@/lib/auth-client";

export const Route = createFileRoute("/_main/forgot-password")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Olvidé mi Contraseña",
      },
    ],
  }),
});

function RouteComponent() {
  const form = useAppForm({
    defaultValues: {
      email: "",
      turnstileToken: "",
    },
    onSubmit: async ({ value }) => {
      try {
        const { error } = await authClient.requestPasswordReset({
          email: value.email,
          fetchOptions: {
            headers: {
              "x-captcha-response": value.turnstileToken,
            },
          },
          redirectTo: `${window.location.origin}/reset-password`,
        });

        if (error) {
          const message = getAuthErrorMessage(error.code);
          toast.error(message ?? error.message);
          console.error(error);
          return;
        }

        toast.success(
          "Se ha enviado un enlace a tu casilla de correo electrónico para restablecer tu contraseña.",
          {
            dismissible: true,
          }
        );
        form.reset();
      } catch (error) {
        console.error(error);
      }
    },
    validators: {
      onSubmit: z.object({
        email: z.email(),
        turnstileToken: z.string().nonempty("Por favor completa el CAPTCHA"),
      }),
    },
  });

  return (
    <Card className="min-w-sm">
      <CardHeader>
        <CardTitle>Olvidé mi contraseña</CardTitle>
        <CardDescription>
          Ingresa tu correo electrónico y te enviaremos un enlace para
          restablecer tu contraseña.
        </CardDescription>
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
          <form.AppField name="email">
            {(field) => <field.TextField label="Correo Electrónico" />}
          </form.AppField>
          <form.AppField name="turnstileToken">
            {(field) => (
              <Turnstile
                onError={() => field.setValue("")}
                onSuccess={(token) => field.setValue(token)}
                options={{
                  size: "flexible",
                  theme: "auto",
                }}
                siteKey={env.VITE_TURNSTILE_SITE_KEY!}
              />
            )}
          </form.AppField>
          <form.AppForm>
            <form.SubmitButton>Enviar</form.SubmitButton>
          </form.AppForm>
        </form>
      </CardContent>
    </Card>
  );
}
