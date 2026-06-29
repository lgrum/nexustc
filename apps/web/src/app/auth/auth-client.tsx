"use client";

import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Turnstile } from "@marsidev/react-turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { useStore } from "@tanstack/react-form";
import { Facehash } from "facehash";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppForm } from "@/hooks/use-app-form";
import { trackEvent } from "@/lib/analytics";
import { authClient, getAuthErrorMessage } from "@/lib/auth-client";
import { defaultFacehashProps } from "@/lib/utils";

const loginSchema = z.object({
  email: z.email("Email invÃ¡lido"),
  password: z
    .string()
    .min(8, "Debe tener al menos 8 caracteres")
    .max(64, "Debe tener como mÃ¡ximo 64 caracteres"),
  turnstileToken: z.string().nonempty("Por favor completa el CAPTCHA"),
});

const registerSchema = z
  .object({
    confirmPassword: z.string(),
    email: z.email("Email invÃ¡lido"),
    name: z.string(),
    password: z
      .string()
      .min(8, "Debe tener al menos 8 caracteres")
      .max(64, "Debe tener como mÃ¡ximo 64 caracteres"),
    turnstileToken: z.string().nonempty("Por favor completa el CAPTCHA"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Las contraseÃ±as no coinciden",
    path: ["confirmPassword"],
  });

const getErrorMessage = (err: { message?: string; code?: string }): string => {
  const authMessage = err.code && getAuthErrorMessage(err.code);

  if (err.code && authMessage) {
    return authMessage;
  }

  if (err.message) {
    return err.message;
  }

  return "Ha ocurrido un error. IntÃ©ntalo nuevamente.";
};

export function AuthClient() {
  const [tab, setTab] = useState("login");
  const [formError, setFormError] = useState<string>();
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const loginTurnstileRef = useRef<TurnstileInstance>(null);
  const registerTurnstileRef = useRef<TurnstileInstance>(null);
  const router = useRouter();

  const loginForm = useAppForm({
    defaultValues: {
      email: "",
      password: "",
      turnstileToken: "",
    },
    onSubmit: async ({ value, formApi }) => {
      const { data, success } = loginSchema.safeParse(value);

      if (!success) {
        trackEvent("login_failed", {
          reason: "validation",
          source: "auth_page",
        });
        setFormError("Email o contraseÃ±a invÃ¡lidos");
        return;
      }

      try {
        setFormError(undefined);

        const { error: authError } = await toast
          .promise(
            authClient.signIn.email({
              callbackURL: window.location.origin,
              email: data.email,
              fetchOptions: {
                headers: {
                  "x-captcha-response": data.turnstileToken,
                },
              },
              password: data.password,
            }),
            {
              loading: "Iniciando sesiÃ³n...",
            }
          )
          .unwrap();

        if (authError) {
          if (authError.status === 403) {
            trackEvent("login_failed", {
              reason: "email_unverified",
              source: "auth_page",
            });
            toast.error(
              "Por favor verifica tu direcciÃ³n de correo electrÃ³nico antes de iniciar sesiÃ³n. Se te ha enviado un nuevo correo de verificaciÃ³n."
            );
            return;
          }

          trackEvent("login_failed", {
            reason: authError.code ?? "auth_error",
            source: "auth_page",
          });
          setFormError(getErrorMessage(authError));
          return;
        }

        trackEvent("login_completed", {
          method: "email",
          source: "auth_page",
        });
        router.push("/");
      } catch (error) {
        trackEvent("login_failed", {
          reason: "exception",
          source: "auth_page",
        });
        setFormError(
          error instanceof Error ? error.message : "Error desconocido"
        );
      } finally {
        loginForm.resetField("turnstileToken");
        loginTurnstileRef.current?.reset();
        formApi.setErrorMap({});
      }
    },
  });

  const registerForm = useAppForm({
    defaultValues: {
      confirmPassword: "",
      email: "",
      name: "",
      password: "",
      turnstileToken: "",
    },
    onSubmit: async ({ value }) => {
      try {
        setFormError(undefined);

        toast.loading("Registrando...", { id: "auth" });

        const { error: authError } = await authClient.signUp.email({
          callbackURL: "/",
          email: value.email,
          fetchOptions: {
            headers: {
              "x-captcha-response": value.turnstileToken,
            },
          },
          name: value.name,
          password: value.password,
        });

        if (authError) {
          toast.dismiss("auth");
          trackEvent("signup_failed", {
            reason: authError.code ?? "auth_error",
            source: "auth_page",
          });
          setFormError(getErrorMessage(authError));
          return;
        }

        toast.dismiss("auth");
        trackEvent("signup_completed", {
          method: "email",
          source: "auth_page",
        });
        toast.success(
          "Se ha enviado un correo a su cuenta de correo electrÃ³nico. Por favor verifique su correo antes de iniciar sesiÃ³n."
        );
        setShowVerificationDialog(true);
        setTab("login");
        registerForm.resetField("password");
        registerForm.resetField("confirmPassword");
        registerForm.resetField("turnstileToken");
      } catch (error) {
        toast.dismiss("auth");
        trackEvent("signup_failed", {
          reason: "exception",
          source: "auth_page",
        });
        setFormError(
          error instanceof Error ? error.message : "Error desconocido"
        );
      } finally {
        registerForm.resetField("turnstileToken");
        registerTurnstileRef.current?.reset();
      }
    },
    validators: {
      onSubmit: registerSchema,
    },
  });

  const registerName = useStore(
    registerForm.store,
    (state) => state.values.name
  );

  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center p-4">
      {/* Decorative glow orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-20 size-72 rounded-full bg-[radial-gradient(circle,oklch(0.8278_0.1659_79.4259/0.12),transparent_70%)]" />
        <div className="absolute -bottom-20 -left-24 size-64 rounded-full bg-[radial-gradient(circle,oklch(0.571_0.297_304.654/0.10),transparent_70%)]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="mb-6 text-center">
          <Link href="/">
            <h1 className="font-[Lexend] font-extrabold text-3xl">
              <span className="bg-linear-to-br from-primary to-accent bg-clip-text text-transparent">
                NeXusTC
              </span>
              <span className="align-super font-normal text-muted-foreground text-xs">
                +18
              </span>
            </h1>
          </Link>
        </div>

        {/* Auth card */}
        <div className="border border-border bg-card p-5">
          <Tabs
            defaultValue="login"
            onValueChange={(newTab) => {
              trackEvent(
                newTab === "register" ? "signup_started" : "login_started",
                { source: "auth_page" }
              );
              setTab(newTab);
              loginForm.resetField("turnstileToken");
              registerForm.resetField("turnstileToken");
              loginTurnstileRef.current?.reset();
              registerTurnstileRef.current?.reset();
              setFormError(undefined);
            }}
            value={tab}
          >
            <TabsList className="mb-4 w-full">
              <TabsTrigger value="login">Iniciar SesiÃ³n</TabsTrigger>
              <TabsTrigger value="register">Registrarse</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  loginForm.handleSubmit();
                }}
              >
                <loginForm.AppField name="email">
                  {(field) => <field.TextField label="Email" type="email" />}
                </loginForm.AppField>
                <loginForm.AppField name="password">
                  {(field) => (
                    <field.TextField label="ContraseÃ±a" type="password" />
                  )}
                </loginForm.AppField>
                <Link href="/forgot-password">
                  <Button className="p-0" type="button" variant="link">
                    Â¿Olvidaste tu contraseÃ±a?
                  </Button>
                </Link>
                <loginForm.AppField name="turnstileToken">
                  {(field) => (
                    <TurnstileContainer
                      ref={loginTurnstileRef}
                      setToken={(token) => field.setValue(token)}
                    />
                  )}
                </loginForm.AppField>
                {!!formError && (
                  <Alert variant="destructive">
                    <HugeiconsIcon icon={AlertCircleIcon} />
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <loginForm.AppForm>
                  <loginForm.SubmitButton>
                    Iniciar SesiÃ³n
                  </loginForm.SubmitButton>
                </loginForm.AppForm>
                {!!showVerificationDialog && (
                  <Alert variant="default">
                    <AlertTitle>Verifica tu correo</AlertTitle>
                    <AlertDescription>
                      <span>
                        Se ha enviado una verificaciÃ³n a su casilla de correo.
                        <br />
                        Por favor, verifiquela para poder acceder al sitio,
                      </span>
                    </AlertDescription>
                  </Alert>
                )}
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  registerForm.handleSubmit();
                }}
              >
                <div className="flex w-full justify-center">
                  <Facehash
                    name={registerName}
                    {...defaultFacehashProps}
                    className="w-16 place-items-center rounded-full border"
                    size={64}
                  />
                </div>
                <registerForm.AppField name="name">
                  {(field) => (
                    <field.TextField
                      label="Nombre de Usuario"
                      placeholder="Usuario"
                    />
                  )}
                </registerForm.AppField>
                <registerForm.AppField name="email">
                  {(field) => <field.TextField label="Email" type="email" />}
                </registerForm.AppField>
                <registerForm.AppField name="password">
                  {(field) => (
                    <field.TextField label="ContraseÃ±a" type="password" />
                  )}
                </registerForm.AppField>
                <registerForm.AppField name="confirmPassword">
                  {(field) => (
                    <field.TextField
                      label="Confirmar ContraseÃ±a"
                      type="password"
                    />
                  )}
                </registerForm.AppField>
                <registerForm.AppField name="turnstileToken">
                  {(field) => (
                    <TurnstileContainer
                      ref={registerTurnstileRef}
                      setToken={(token) => field.setValue(token)}
                    />
                  )}
                </registerForm.AppField>
                {!!formError && (
                  <Alert variant="destructive">
                    <HugeiconsIcon icon={AlertCircleIcon} />
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <registerForm.AppForm>
                  <registerForm.SubmitButton>
                    Registrarse
                  </registerForm.SubmitButton>
                </registerForm.AppForm>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}

function TurnstileContainer({
  ref,
  setToken,
}: {
  ref?: React.RefObject<TurnstileInstance | null>;
  setToken: (token: string) => void;
}) {
  return (
    <Turnstile
      onError={() => setToken("")}
      onSuccess={setToken}
      options={{
        size: "flexible",
        theme: "auto",
      }}
      ref={ref}
      siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
    />
  );
}
