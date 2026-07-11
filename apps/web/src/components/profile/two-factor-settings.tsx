"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { CheckCircle2Icon, CopyIcon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";
import QRCode from "react-qr-code";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { authClient, getAuthErrorMessage } from "@/lib/auth-client";

type Flow = "backup" | "disable" | "enable";
type Step = "codes" | "password" | "scan";

export function TwoFactorSettings({
  email,
  enabled,
}: {
  email: string;
  enabled: boolean;
}) {
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [flow, setFlow] = useState<Flow>("enable");
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<Step>("password");
  const [totpUri, setTotpUri] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const passwordFormId = `two-factor-${flow}-password-form`;
  const passwordInputId = `password-input-${flow}`;
  const emailInputId = `two-factor-${flow}-email`;

  const open = (nextFlow: Flow) => {
    setBackupCodes([]);
    setCode("");
    setError(undefined);
    setFlow(nextFlow);
    setPassword("");
    setStep("password");
    setTotpUri("");
    setTrustDevice(false);
    setIsOpen(true);
  };

  const showError = (authError: { code?: string; message?: string }) => {
    setError(
      getAuthErrorMessage(authError.code) ??
        authError.message ??
        "No se pudo completar la operación"
    );
  };

  const submitPassword = async () => {
    if (!password) {
      setError("Ingresa tu contraseña");
      return;
    }

    setError(undefined);
    setIsPending(true);

    if (flow === "enable") {
      const { data, error: authError } = await authClient.twoFactor.enable({
        password,
      });
      setIsPending(false);

      if (authError) {
        showError(authError);
        return;
      }

      setBackupCodes(data.backupCodes);
      setTotpUri(data.totpURI);
      setStep("scan");
      return;
    }

    if (flow === "backup") {
      const { data, error: authError } =
        await authClient.twoFactor.generateBackupCodes({ password });
      setIsPending(false);

      if (authError) {
        showError(authError);
        return;
      }

      setBackupCodes(data.backupCodes);
      setStep("codes");
      return;
    }

    const { error: authError } = await authClient.twoFactor.disable({
      password,
    });
    setIsPending(false);

    if (authError) {
      showError(authError);
      return;
    }

    setIsEnabled(false);
    setIsOpen(false);
    toast.success("Verificación en dos pasos desactivada");
  };

  const verifyAuthenticator = async () => {
    if (!code) {
      setError("Ingresa el código de tu autenticador");
      return;
    }

    setError(undefined);
    setIsPending(true);
    const { error: authError } = await authClient.twoFactor.verifyTotp({
      code: code.trim(),
      trustDevice,
    });
    setIsPending(false);

    if (authError) {
      showError(authError);
      return;
    }

    setIsEnabled(true);
    setStep("codes");
    toast.success("Verificación en dos pasos activada");
  };

  const copyBackupCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join("\n"));
      toast.success("Códigos copiados");
    } catch {
      toast.error("No se pudieron copiar los códigos");
    }
  };

  return (
    <div className="rounded-4xl border border-border bg-card p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <ShieldCheckIcon className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Verificación en dos pasos</h2>
              <span
                className={
                  isEnabled
                    ? "text-emerald-500 text-xs"
                    : "text-muted-foreground text-xs"
                }
              >
                {isEnabled ? "Activada" : "Desactivada"}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground text-sm">
              Protege tu cuenta con un autenticador y códigos por email.
            </p>
          </div>
        </div>

        {isEnabled ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => open("backup")} variant="outline">
              Nuevos códigos de respaldo
            </Button>
            <Button onClick={() => open("disable")} variant="destructive">
              Desactivar
            </Button>
          </div>
        ) : (
          <Button onClick={() => open("enable")}>Activar</Button>
        )}
      </div>

      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogContent className="max-h-[90dvh] overflow-x-hidden overflow-y-auto sm:max-w-md">
          {step === "password" && (
            <form
              autoComplete="on"
              id={passwordFormId}
              key={passwordFormId}
              method="post"
              name={passwordFormId}
              className="contents"
              onSubmit={(event) => {
                event.preventDefault();
                void submitPassword();
              }}
            >
              <DialogHeader>
                <DialogTitle>
                  {flow === "enable"
                    ? "Activar verificación en dos pasos"
                    : flow === "backup"
                      ? "Generar nuevos códigos"
                      : "Desactivar verificación en dos pasos"}
                </DialogTitle>
                <DialogDescription>
                  Confirma tu contraseña para continuar.
                </DialogDescription>
              </DialogHeader>
              <input
                aria-label="Correo electrónico"
                autoComplete="email"
                className="sr-only"
                defaultValue={email}
                id={emailInputId}
                name="email"
                tabIndex={-1}
                type="email"
              />
              <div className="flex flex-col gap-2">
                <Label htmlFor={passwordInputId}>Contraseña</Label>
                <Input
                  autoFocus
                  id={passwordInputId}
                  name="password"
                  autoComplete="current-password"
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  value={password}
                  required
                />
              </div>
              {error && (
                <p aria-live="polite" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button
                  disabled={isPending}
                  type="submit"
                  variant={flow === "disable" ? "destructive" : "default"}
                >
                  {isPending ? "Procesando..." : "Continuar"}
                </Button>
              </DialogFooter>
            </form>
          )}

          {step === "scan" && (
            <form
              className="contents"
              onSubmit={(event) => {
                event.preventDefault();
                void verifyAuthenticator();
              }}
            >
              <DialogHeader>
                <DialogTitle>Escanea el código QR</DialogTitle>
                <DialogDescription>
                  Usa Google Authenticator, Authy, 1Password u otra aplicación
                  compatible y confirma el código generado.
                </DialogDescription>
              </DialogHeader>
              <div className="mx-auto rounded-2xl bg-white p-4">
                <QRCode size={200} value={totpUri} />
              </div>
              <div className="flex flex-col items-center gap-2">
                <Label className="sr-only" htmlFor="totp-code">
                  Código del autenticador
                </Label>
                <p
                  className="text-muted-foreground text-sm"
                  id="totp-code-hint"
                >
                  Ingresa el código de 6 dígitos
                </p>
                <InputOTP
                  aria-describedby="totp-code-hint"
                  autoComplete="one-time-code"
                  autoFocus
                  containerClassName="justify-center"
                  id="totp-code"
                  maxLength={6}
                  onChange={setCode}
                  pattern={REGEXP_ONLY_DIGITS}
                  value={code}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <label
                className="flex cursor-pointer items-center gap-3 text-sm"
                htmlFor="setup-trust-device"
              >
                <Checkbox
                  checked={trustDevice}
                  id="setup-trust-device"
                  onCheckedChange={setTrustDevice}
                />
                Confiar en este dispositivo durante 30 días
              </label>
              {error && (
                <p aria-live="polite" className="text-destructive text-sm">
                  {error}
                </p>
              )}
              <DialogFooter>
                <Button disabled={isPending} type="submit">
                  {isPending ? "Verificando..." : "Verificar y activar"}
                </Button>
              </DialogFooter>
            </form>
          )}

          {step === "codes" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2Icon className="size-5 text-emerald-500" />
                  Guarda tus códigos de respaldo
                </DialogTitle>
                <DialogDescription>
                  Cada código puede usarse una sola vez si pierdes acceso a tu
                  autenticador y correo.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-3 font-mono text-sm">
                {backupCodes.map((backupCode) => (
                  <code key={backupCode}>{backupCode}</code>
                ))}
              </div>
              <DialogFooter className="sm:justify-between">
                <Button onClick={copyBackupCodes} variant="outline">
                  <CopyIcon className="size-4" />
                  Copiar
                </Button>
                <Button onClick={() => setIsOpen(false)}>Listo</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
