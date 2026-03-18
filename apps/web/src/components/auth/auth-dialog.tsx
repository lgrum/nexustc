import { Dialog } from "@base-ui/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { env } from "@repo/env/client";
import { useStore } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { Facehash } from "facehash";
import { useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppForm } from "@/hooks/use-app-form";
import { authClient, getAuthErrorMessage } from "@/lib/auth-client";
import { defaultFacehashProps } from "@/lib/utils";
import { DialogContent } from "../ui/dialog";

export function AuthDialog({ ...props }: Dialog.Root.Props) {
  return <Dialog.Root {...props} />;
}

export function AuthDialogTrigger({ ...props }: Dialog.Trigger.Props) {
  return <Dialog.Trigger {...props} />;
}

export function AuthDialogContent() {
  const [tab, setTab] = useState("login");
  const [error, setError] = useState<string>();
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const loginTurnstileRef = useRef<TurnstileInstance>(null);
  const registerTurnstileRef = useRef<TurnstileInstance>(null);

  const navigate = useNavigate();

  const loginForm = useAppForm({
    defaultValues: {
      email: "",
      password: "",
      turnstileToken: "",
    },
    onSubmit: async ({ value, formApi }) => {
      const { data, error } = loginSchema.safeParse(value);

      if (error) {
        setError("Email o contraseña inválidos");
        return;
      }

      try {
        setError(undefined);

        const { error: authError } = await toast
          .promise(
            authClient.signIn.email({
              email: data.email,
              password: data.password,
              callbackURL: window.location.origin,
              fetchOptions: {
                headers: {
                  "x-captcha-response": data.turnstileToken,
                },
              },
            }),
            {
              loading: "Iniciando sesión...",
            }
          )
          .unwrap();

        if (authError) {
          if (authError.status === 403) {
            toast.error(
              "Por favor verifica tu dirección de correo electrónico antes de iniciar sesión. Se te ha enviado un nuevo correo de verificación."
            );
            return;
          }

          setError(getErrorMessage(authError));
          return;
        }

        navigate({ to: "/" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        loginForm.resetField("turnstileToken");
        loginTurnstileRef.current?.reset();
        formApi.setErrorMap({});
      }
    },
  });

  const registerForm = useAppForm({
    validators: {
      onSubmit: registerSchema,
    },
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      turnstileToken: "",
    },
    onSubmit: async ({ value }) => {
      try {
        setError(undefined);

        toast.loading("Registrando...", { id: "auth" });

        const { error: authError } = await authClient.signUp.email({
          name: value.name,
          email: value.email,
          password: value.password,
          callbackURL: "/",
          fetchOptions: {
            headers: {
              "x-captcha-response": value.turnstileToken,
            },
          },
        });

        if (authError) {
          toast.dismiss("auth");
          setError(getErrorMessage(authError));
          return;
        }

        toast.dismiss("auth");
        toast.success(
          "Se ha enviado un correo a su cuenta de correo electrónico. Por favor verifique su correo antes de iniciar sesión."
        );
        setShowVerificationDialog(true);
        setTab("login");
        registerForm.resetField("password");
        registerForm.resetField("confirmPassword");
        registerForm.resetField("turnstileToken");
      } catch (err) {
        toast.dismiss("auth");
        setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        registerForm.resetField("turnstileToken");
        registerTurnstileRef.current?.reset();
      }
    },
  });

  const registerName = useStore(
    registerForm.store,
    (state) => state.values.name
  );

  return (
    <DialogContent className="p-0 ring-0">
      <Card className="w-full">
        <CardHeader>
          <h1 className="text-center font-bold text-3xl text-primary">
            NeXusTC
            <span className="align-super font-normal text-xs">+18</span>
            <span className="font-normal text-xs"> BETA</span>
          </h1>
        </CardHeader>
        <CardContent>
          <Tabs
            defaultValue="login"
            onValueChange={(newTab) => {
              setTab(newTab);
              loginForm.resetField("turnstileToken");
              registerForm.resetField("turnstileToken");
              loginTurnstileRef.current?.reset();
              registerTurnstileRef.current?.reset();
              setError(undefined); // Clear errors when switching tabs
            }}
            value={tab}
          >
            <TabsList className="w-full">
              <TabsTrigger value="login">Iniciar Sesión</TabsTrigger>
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
                    <field.TextField label="Contraseña" type="password" />
                  )}
                </loginForm.AppField>
                <Link to="/forgot-password">
                  <Button className="p-0" type="button" variant="link">
                    ¿Olvidaste tu contraseña?
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
                {!!error && (
                  <Alert variant="destructive">
                    <HugeiconsIcon icon={AlertCircleIcon} />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <loginForm.AppForm>
                  <loginForm.SubmitButton>
                    Iniciar Sesión
                  </loginForm.SubmitButton>
                </loginForm.AppForm>
                {!!showVerificationDialog && (
                  <Alert variant="default">
                    <AlertTitle>Verifica tu correo</AlertTitle>
                    <AlertDescription>
                      <span>
                        Se ha enviado una verificación a su casilla de correo.
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
                    className="size-3 w-full place-items-center rounded-full border"
                    size="10vh"
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
                    <field.TextField label="Contraseña" type="password" />
                  )}
                </registerForm.AppField>
                <registerForm.AppField name="confirmPassword">
                  {(field) => (
                    <field.TextField
                      label="Confirmar Contraseña"
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
                {!!error && (
                  <Alert variant="destructive">
                    <HugeiconsIcon icon={AlertCircleIcon} />
                    <AlertDescription>{error}</AlertDescription>
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
        </CardContent>
      </Card>
    </DialogContent>
  );
}

const loginSchema = z.object({
  email: z.email("Email inválido"),
  password: z
    .string()
    .min(8, "Debe tener al menos 8 caracteres")
    .max(64, "Debe tener como máximo 64 caracteres"),
  turnstileToken: z.string().nonempty("Por favor completa el CAPTCHA"),
});

const registerSchema = z
  .object({
    name: z.string(),
    email: z.email("Email inválido"),
    password: z
      .string()
      .min(8, "Debe tener al menos 8 caracteres")
      .max(64, "Debe tener como máximo 64 caracteres"),
    confirmPassword: z.string(),
    turnstileToken: z.string().nonempty("Por favor completa el CAPTCHA"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Las contraseñas no coinciden",
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

  return "Ha ocurrido un error. Inténtalo nuevamente.";
};

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
      siteKey={env.VITE_TURNSTILE_SITE_KEY}
    />
  );
}
