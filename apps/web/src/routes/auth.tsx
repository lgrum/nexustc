import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { auth } from "@repo/auth";
import { env } from "@repo/env/client";
import { useStore } from "@tanstack/react-form";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { Facehash } from "facehash";
import { useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppForm } from "@/hooks/use-app-form";
import { authClient, getAuthErrorMessage } from "@/lib/auth-client";
import { defaultFacehashProps } from "@/lib/utils";

const redirectMiddleware = createMiddleware().server(
  async ({ request, next }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session) {
      throw redirect({ to: "/profile", replace: true });
    }
    return await next();
  }
);

export const Route = createFileRoute("/auth")({
  component: RouteComponent,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (session.data?.session) {
      throw redirect({ to: "/profile", replace: true });
    }
  },
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Autenticación",
      },
    ],
  }),
  server: {
    middleware: [redirectMiddleware],
  },
});

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

function RouteComponent() {
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
    <main className="relative flex min-h-dvh w-full items-center justify-center p-4">
      {/* Decorative glow orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-20 size-72 rounded-full bg-[radial-gradient(circle,oklch(0.8278_0.1659_79.4259/0.12),transparent_70%)]" />
        <div className="absolute -bottom-20 -left-24 size-64 rounded-full bg-[radial-gradient(circle,oklch(0.571_0.297_304.654/0.10),transparent_70%)]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="mb-6 text-center">
          <Link to="/">
            <h1 className="font-[Lexend] font-extrabold text-3xl">
              <span className="bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent">
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
              setTab(newTab);
              loginForm.resetField("turnstileToken");
              registerForm.resetField("turnstileToken");
              loginTurnstileRef.current?.reset();
              registerTurnstileRef.current?.reset();
              setError(undefined);
            }}
            value={tab}
          >
            <TabsList className="mb-4 w-full" variant="primary">
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
      siteKey={env.VITE_TURNSTILE_SITE_KEY}
    />
  );
}
