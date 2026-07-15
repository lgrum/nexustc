import { Dialog } from "@base-ui/react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { Tabs } from "@base-ui/react/tabs";
import {
  AlertCircleIcon,
  ArrowRight01Icon,
  Cancel01Icon,
  Mail01Icon,
  ShieldQuestionMarkIcon,
  SquareLock01Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Turnstile } from "@marsidev/react-turnstile";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { env } from "@repo/env";
import { ALLOWED_EMAIL_DOMAINS } from "@repo/shared/constants";
import { useStore } from "@tanstack/react-form";
import type { AnyFieldApi } from "@tanstack/react-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import z from "zod";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAppForm } from "@/hooks/use-app-form";
import { trackEvent } from "@/lib/analytics";
import { authClient, getAuthErrorMessage } from "@/lib/auth-client";
import { getTwoFactorMethods } from "@/lib/two-factor";
import {
  beginTwoFactorRedirect,
  clearPendingTwoFactorMethods,
  setPendingTwoFactorMethods,
  useIsTwoFactorRedirectActive,
  usePendingTwoFactorMethods,
} from "@/lib/two-factor-redirect";
import { cn } from "@/lib/utils";

import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "../ui/item";
import { TwoFactorChallenge } from "./two-factor-challenge";

type AuthDialogContextValue = {
  close: () => void;
  scope: string;
};

const AuthDialogScopeContext = createContext<AuthDialogContextValue | null>(
  null
);

type AuthDialogProps = Omit<Dialog.Root.Props, "children"> & {
  children: ReactNode;
};

const useAuthDialogScope = () => {
  const scope = useContext(AuthDialogScopeContext);
  if (!scope) {
    throw new Error("AuthDialogContent must be rendered inside AuthDialog");
  }
  return scope;
};

export function AuthDialog({
  children,
  defaultOpen = false,
  onOpenChange,
  onOpenChangeComplete,
  open,
  ...props
}: AuthDialogProps) {
  const scope = useId();
  const actionsRef = useRef<Dialog.Root.Actions>(null);
  const isTwoFactorRedirectActive = useIsTwoFactorRedirectActive(scope);
  const [isClosingTwoFactor, setIsClosingTwoFactor] = useState(false);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;

  useEffect(() => () => clearPendingTwoFactorMethods(scope), [scope]);

  const handleOpenChange: NonNullable<Dialog.Root.Props["onOpenChange"]> = (
    nextOpen,
    eventDetails
  ) => {
    const isUserDismissal =
      eventDetails.reason === "close-press" ||
      eventDetails.reason === "escape-key" ||
      eventDetails.reason === "outside-press" ||
      eventDetails.reason === "trigger-press";

    if (!nextOpen && isTwoFactorRedirectActive && isUserDismissal) {
      setIsClosingTwoFactor(true);
    }

    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen, eventDetails);
  };

  const handleOpenChangeComplete = (nextOpen: boolean) => {
    if (!nextOpen && isClosingTwoFactor) {
      clearPendingTwoFactorMethods(scope);
      setIsClosingTwoFactor(false);
    }
    onOpenChangeComplete?.(nextOpen);
  };

  const close = () => {
    setIsClosingTwoFactor(true);
    actionsRef.current?.close();
  };

  return (
    <AuthDialogScopeContext.Provider value={{ close, scope }}>
      <Dialog.Root
        {...props}
        actionsRef={actionsRef}
        onOpenChange={handleOpenChange}
        onOpenChangeComplete={handleOpenChangeComplete}
        open={
          !isClosingTwoFactor &&
          (isTwoFactorRedirectActive || (isControlled ? open : internalOpen))
        }
      >
        {children}
      </Dialog.Root>
    </AuthDialogScopeContext.Provider>
  );
}

export function AuthDialogTrigger({ ...props }: Dialog.Trigger.Props) {
  return <Dialog.Trigger {...props} />;
}

export function AuthDialogContent() {
  const { close, scope } = useAuthDialogScope();
  const [tab, setTab] = useState("login");
  const [formError, setFormError] = useState<string>();
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const twoFactorMethods = usePendingTwoFactorMethods(scope);
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
      const resetChallenge = () => {
        loginForm.resetField("turnstileToken");
        loginTurnstileRef.current?.reset();
        formApi.setErrorMap({});
      };

      if (!success) {
        trackEvent("login_failed", {
          reason: "validation",
          source: "auth_dialog",
        });
        setFormError("Email o contraseña inválidos");
        return;
      }

      try {
        setFormError(undefined);
        beginTwoFactorRedirect(scope);

        const { data: signInData, error: authError } = await toast
          .promise(
            authClient.signIn.email(
              {
                email: data.email,
                password: data.password,
              },
              {
                headers: {
                  "x-captcha-response": data.turnstileToken,
                },
              }
            ),
            {
              loading: "Iniciando sesión...",
            }
          )
          .unwrap();

        if (authError) {
          clearPendingTwoFactorMethods(scope);
          if (authError.status === 403) {
            trackEvent("login_failed", {
              reason: "email_unverified",
              source: "auth_dialog",
            });
            toast.error(
              "Por favor verifica tu dirección de correo electrónico antes de iniciar sesión. Se te ha enviado un nuevo correo de verificación."
            );
            return;
          }

          trackEvent("login_failed", {
            reason: authError.code ?? "auth_error",
            source: "auth_dialog",
          });
          setFormError(getErrorMessage(authError));
          return;
        }

        const methods = getTwoFactorMethods(signInData);
        if (methods) {
          setPendingTwoFactorMethods(scope, methods);
          return;
        }

        clearPendingTwoFactorMethods(scope);
        trackEvent("login_completed", {
          method: "email",
          source: "auth_dialog",
        });
        router.push("/");
      } catch (error) {
        clearPendingTwoFactorMethods(scope);
        trackEvent("login_failed", {
          reason: "exception",
          source: "auth_dialog",
        });
        setFormError(
          error instanceof Error ? error.message : "Error desconocido"
        );
      } finally {
        resetChallenge();
      }
    },
  });

  const registerForm = useAppForm({
    defaultValues: {
      confirmPassword: "",
      email: "",
      name: "",
      newsletterOptIn: false,
      password: "",
      turnstileToken: "",
    },
    onSubmit: async ({ value }) => {
      const resetChallenge = () => {
        registerForm.resetField("turnstileToken");
        registerTurnstileRef.current?.reset();
      };

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
          newsletterOptIn: value.newsletterOptIn,
          password: value.password,
        });

        if (authError) {
          toast.dismiss("auth");
          trackEvent("signup_failed", {
            newsletterOptIn: Boolean(value.newsletterOptIn),
            reason: authError.code ?? "auth_error",
            source: "auth_dialog",
          });
          setFormError(getErrorMessage(authError));
          resetChallenge();
          return;
        }

        toast.dismiss("auth");
        trackEvent("signup_completed", {
          method: "email",
          newsletterOptIn: Boolean(value.newsletterOptIn),
          source: "auth_dialog",
        });
        toast.success(
          "Se ha enviado un correo a su cuenta de correo electrónico. Por favor verifique su correo antes de iniciar sesión."
        );
        setShowVerificationDialog(true);
        setTab("login");
        registerForm.resetField("password");
        registerForm.resetField("confirmPassword");
        registerForm.resetField("newsletterOptIn");
        registerForm.resetField("turnstileToken");
      } catch (error) {
        toast.dismiss("auth");
        trackEvent("signup_failed", {
          reason: "exception",
          source: "auth_dialog",
        });
        setFormError(
          error instanceof Error ? error.message : "Error desconocido"
        );
      }
      resetChallenge();
    },
    validators: {
      onSubmit: registerSchema,
    },
  });

  const handleTabChange = (newTab: string | number | null) => {
    if (newTab === null) {
      return;
    }
    trackEvent(newTab === "register" ? "signup_started" : "login_started", {
      source: "auth_dialog",
    });
    setTab(String(newTab));
    loginForm.resetField("turnstileToken");
    registerForm.resetField("turnstileToken");
    loginTurnstileRef.current?.reset();
    registerTurnstileRef.current?.reset();
    setFormError(undefined);
  };

  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 z-50 bg-background/70 backdrop-blur-md duration-150 data-closed:animate-out data-open:animate-in" />
      <Dialog.Popup className="overflow-y-auto max-h-[95dvh] data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 flex w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-2xl outline-none backdrop-blur-xl duration-150 data-closed:animate-out data-open:animate-in sm:max-w-100">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-primary/8 via-primary/3 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 right-[-20%] h-48 w-48 rounded-full bg-primary/20 blur-3xl"
        />

        <Dialog.Close
          className="absolute top-3 right-3 z-10 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          render={<button type="button" />}
        >
          <HugeiconsIcon
            className="size-4"
            icon={Cancel01Icon}
            strokeWidth={2}
          />
          <span className="sr-only">Cerrar</span>
        </Dialog.Close>

        <header className="relative flex flex-col items-center gap-1 px-6 pt-8 pb-4">
          <div className="flex items-center gap-2.5">
            <Dialog.Title
              className="display-heading text-[26px] text-foreground"
              // oxlint-disable-next-line jsx_a11y/heading-has-content
              render={<h1 />}
            >
              NeXus<span className="text-primary">TC</span>
            </Dialog.Title>
          </div>
          <Dialog.Description
            className="inline-flex items-center gap-2 font-medium text-[10.5px] text-muted-foreground uppercase tracking-[0.22em]"
            render={<p />}
          >
            <span className="text-primary/80">Beta</span>
          </Dialog.Description>
          <div className="glow-line mt-1 w-full" />
        </header>

        <div className="relative px-6 pb-6">
          {twoFactorMethods ? (
            <TwoFactorChallenge
              methods={twoFactorMethods}
              onCancel={() => clearPendingTwoFactorMethods(scope)}
              onVerified={(method) => {
                trackEvent("login_completed", {
                  method,
                  source: "auth_dialog",
                });
                close();
                router.push("/");
                router.refresh();
              }}
            />
          ) : (
            <Tabs.Root
              className="slide-in-from-left-2 animate-in fade-in-0 duration-200 motion-reduce:animate-none"
              onValueChange={handleTabChange}
              value={tab}
            >
              <Tabs.List className="mb-5 inline-flex h-10 w-full items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-1">
                <AuthTabTrigger value="login">Iniciar Sesión</AuthTabTrigger>
                <AuthTabTrigger value="register">Registrarse</AuthTabTrigger>
              </Tabs.List>

              <Tabs.Panel className="outline-none" value="login">
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    loginForm.handleSubmit();
                  }}
                >
                  <loginForm.AppField name="email">
                    {(field) => (
                      <AuthField
                        autoComplete="email"
                        field={field}
                        icon={Mail01Icon}
                        label="Email"
                        placeholder="tu@correo.com"
                        type="email"
                      />
                    )}
                  </loginForm.AppField>
                  <loginForm.AppField name="password">
                    {(field) => (
                      <AuthField
                        autoComplete="current-password"
                        field={field}
                        icon={SquareLock01Icon}
                        label="Contraseña"
                        placeholder="••••••••"
                        type="password"
                      />
                    )}
                  </loginForm.AppField>
                  <div className="-mt-1 flex justify-end">
                    <Link
                      className="text-[12px] text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
                      href="/forgot-password"
                    >
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>
                  <loginForm.AppField name="turnstileToken">
                    {(field) => (
                      <TurnstileContainer
                        ref={loginTurnstileRef}
                        setToken={(token) => field.setValue(token)}
                      />
                    )}
                  </loginForm.AppField>
                  {!!formError && <AuthErrorBanner message={formError} />}
                  {!!showVerificationDialog && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[12.5px] text-emerald-100/90 leading-snug">
                      <p className="font-semibold text-emerald-50">
                        Verifica tu correo
                      </p>
                      <p className="text-emerald-200/80">
                        Te enviamos un enlace de verificación a tu casilla.
                      </p>
                    </div>
                  )}
                  <loginForm.AppForm>
                    <loginForm.SubmitButton className="h-11 w-full rounded-lg font-semibold text-[13.5px] tracking-wide shadow-glow-primary/20 transition-[background-color,box-shadow] duration-200 hover:shadow-glow-primary/40">
                      Iniciar Sesión
                    </loginForm.SubmitButton>
                  </loginForm.AppForm>
                </form>
              </Tabs.Panel>

              <Tabs.Panel className="outline-none" value="register">
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    registerForm.handleSubmit();
                  }}
                >
                  <registerForm.AppField name="name">
                    {(field) => (
                      <AuthField
                        autoComplete="username"
                        field={field}
                        icon={UserIcon}
                        label="Nombre de Usuario"
                        placeholder="Tu alias"
                      />
                    )}
                  </registerForm.AppField>
                  <registerForm.AppField name="email">
                    {(field) => (
                      <AuthField
                        autoComplete="email"
                        field={field}
                        icon={Mail01Icon}
                        label="Email"
                        placeholder="tu@correo.com"
                        type="email"
                      />
                    )}
                  </registerForm.AppField>
                  <Item>
                    <ItemMedia variant="icon">
                      <HugeiconsIcon icon={ShieldQuestionMarkIcon} />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>Proveedores permitidos</ItemTitle>
                      <ItemDescription>
                        Gmail, Outlook, Yahoo, ProtonMail y iCloud.
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                  <registerForm.AppField name="password">
                    {(field) => (
                      <AuthField
                        autoComplete="new-password"
                        field={field}
                        icon={SquareLock01Icon}
                        label="Contraseña"
                        placeholder="Mínimo 8 caracteres"
                        type="password"
                      />
                    )}
                  </registerForm.AppField>
                  <registerForm.AppField name="confirmPassword">
                    {(field) => (
                      <AuthField
                        autoComplete="new-password"
                        field={field}
                        icon={SquareLock01Icon}
                        label="Confirmar Contraseña"
                        placeholder="Repite tu contraseña"
                        type="password"
                      />
                    )}
                  </registerForm.AppField>
                  <registerForm.AppField name="newsletterOptIn">
                    {(field) => <NewsletterOptInField field={field} />}
                  </registerForm.AppField>
                  <registerForm.AppField name="turnstileToken">
                    {(field) => (
                      <TurnstileContainer
                        ref={registerTurnstileRef}
                        setToken={(token) => field.setValue(token)}
                      />
                    )}
                  </registerForm.AppField>
                  {!!formError && <AuthErrorBanner message={formError} />}
                  <registerForm.AppForm>
                    <registerForm.SubmitButton className="group h-11 w-full rounded-lg font-semibold text-[13.5px] tracking-wide shadow-glow-primary/20 transition-[background-color,box-shadow] duration-200 hover:shadow-glow-primary/40">
                      <span>Crear cuenta</span>
                      <HugeiconsIcon
                        className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                        icon={ArrowRight01Icon}
                      />
                    </registerForm.SubmitButton>
                  </registerForm.AppForm>
                </form>
              </Tabs.Panel>
            </Tabs.Root>
          )}
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}

function NewsletterOptInField({ field }: { field: AnyFieldApi }) {
  return (
    <label
      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 bg-input/20 px-3 py-2.5 text-[12.5px] text-muted-foreground leading-snug transition-[border-color,background-color] hover:border-primary/40 hover:bg-input/30 has-data-checked:border-primary/50 has-data-checked:bg-primary/8"
      htmlFor={field.name}
    >
      <Checkbox
        checked={Boolean(field.state.value)}
        className="mt-0.5 rounded-md"
        id={field.name}
        onCheckedChange={(checked) => field.handleChange(checked)}
      />
      <span>
        Quiero recibir novedades, actualizaciones y noticias por email.
      </span>
    </label>
  );
}

function AuthTabTrigger({
  children,
  value,
}: {
  children: React.ReactNode;
  value: string;
}) {
  return (
    <Tabs.Tab
      className="relative inline-flex h-full flex-1 cursor-pointer items-center justify-center rounded-md font-medium text-[13px] text-muted-foreground outline-none transition-all duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-active:bg-card data-active:text-foreground data-active:shadow-sm"
      value={value}
    >
      {children}
    </Tabs.Tab>
  );
}

function AuthField({
  field,
  label,
  icon,
  className,
  ...inputProps
}: {
  field: AnyFieldApi;
  label: string;
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
} & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const errors = useStore(field.store, (state) => state.meta.errors);
  const hasError = errors.length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <Label
        className="font-medium text-[12px] text-muted-foreground uppercase tracking-wider"
        htmlFor={field.name}
      >
        {label}
      </Label>
      <div
        className={cn(
          "group/input relative flex items-center rounded-lg border border-border/70 bg-input/30 transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-primary/70 focus-within:bg-input/50 focus-within:ring-[3px] focus-within:ring-primary/20",
          hasError &&
            "border-rose-500/60 bg-rose-500/4 focus-within:border-rose-500/80 focus-within:ring-rose-500/20"
        )}
      >
        <HugeiconsIcon
          className={cn(
            "pointer-events-none absolute left-3 size-4 text-muted-foreground/70 transition-colors duration-200 group-focus-within/input:text-primary",
            hasError && "text-rose-400 group-focus-within/input:text-rose-400"
          )}
          icon={icon}
        />
        <InputPrimitive
          className={cn(
            "h-11 w-full bg-transparent pr-3 pl-10 text-[14px] text-foreground outline-none placeholder:text-muted-foreground/50",
            className
          )}
          id={field.name}
          onChange={(e) => field.handleChange(e.target.value)}
          value={field.state.value}
          {...inputProps}
        />
      </div>
      {hasError && (
        <p className="text-[12px] text-rose-300/90">
          {errors
            .map((error: { message?: string }) => error.message)
            .join(", ")}
        </p>
      )}
    </div>
  );
}

function AuthErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/40 bg-rose-500/8 px-3 py-2.5 text-[12.5px] text-rose-100 leading-snug">
      <HugeiconsIcon
        className="mt-0.5 size-4 shrink-0 text-rose-300"
        icon={AlertCircleIcon}
      />
      <span className="text-rose-100/95">{message}</span>
    </div>
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
    confirmPassword: z.string(),
    email: z
      .email("Email inválido")
      .refine(
        (email) => ALLOWED_EMAIL_DOMAINS.has(email.split("@")[1]),
        "Proveedor de e-mail no permitido"
      ),
    name: z
      .string()
      .min(3, "Debe tener al menos 3 caracteres")
      .max(16, "Debe tener como máximo 16 caracteres"),
    newsletterOptIn: z.boolean(),
    password: z
      .string()
      .min(8, "Debe tener al menos 8 caracteres")
      .max(64, "Debe tener como máximo 64 caracteres"),
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
      siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
    />
  );
}
