"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { KeyRoundIcon, MailIcon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { authClient, getAuthErrorMessage } from "@/lib/auth-client";
import type { TwoFactorMethod } from "@/lib/two-factor";
import { canUseBackupCode, getInitialTwoFactorMethod } from "@/lib/two-factor";

type ChallengeMethod = TwoFactorMethod | "backup";

type TwoFactorChallengeProps = {
  methods: string[];
  onCancel: () => void;
  onVerified: (method: ChallengeMethod) => Promise<void> | void;
};

export function TwoFactorChallenge({
  methods,
  onCancel,
  onVerified,
}: TwoFactorChallengeProps) {
  const [method, setMethod] = useState<ChallengeMethod>(() =>
    getInitialTwoFactorMethod(methods)
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);

  const sendEmailOtp = async (): Promise<boolean> => {
    setError(undefined);
    setIsPending(true);
    try {
      const { error: sendError } = await authClient.twoFactor.sendOtp();

      if (sendError) {
        setError(
          getAuthErrorMessage(sendError.code) ??
            sendError.message ??
            "No se pudo enviar el código"
        );
        return false;
      }

      setOtpSent(true);
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo enviar el código"
      );
      return false;
    } finally {
      setIsPending(false);
    }
  };

  const selectMethod = (nextMethod: ChallengeMethod) => {
    setCode("");
    setError(undefined);
    setMethod(nextMethod);
  };

  const selectEmailOtp = async () => {
    if (await sendEmailOtp()) {
      selectMethod("otp");
    }
  };

  const verify = async () => {
    if (!code.trim()) {
      setError("Ingresa el código");
      return;
    }

    setError(undefined);
    setIsPending(true);
    const normalizedCode = code.trim();
    try {
      const result =
        method === "totp"
          ? await authClient.twoFactor.verifyTotp({
              code: normalizedCode,
              trustDevice,
            })
          : method === "otp"
            ? await authClient.twoFactor.verifyOtp({
                code: normalizedCode,
                trustDevice,
              })
            : await authClient.twoFactor.verifyBackupCode({
                code: normalizedCode,
                disableSession: false,
                trustDevice,
              });
      if (result.error) {
        setError(
          getAuthErrorMessage(result.error.code) ??
            result.error.message ??
            "No se pudo verificar el código"
        );
        return;
      }

      await onVerified(method);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo verificar el código"
      );
    } finally {
      setIsPending(false);
    }
  };

  const isEmail = method === "otp";
  const isBackup = method === "backup";
  const isWaitingForEmailOtp = isEmail && !otpSent;
  const showBackupCodeOption = canUseBackupCode(methods);

  return (
    <form
      className="slide-in-from-right-2 animate-in fade-in-0 flex flex-col gap-4 duration-200 motion-reduce:animate-none"
      onSubmit={async (event) => {
        event.preventDefault();
        await verify();
      }}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          {isEmail ? (
            <MailIcon className="size-6" />
          ) : isBackup ? (
            <KeyRoundIcon className="size-6" />
          ) : (
            <ShieldCheckIcon className="size-6" />
          )}
        </div>
        <h2 className="font-semibold text-lg">Verificación en dos pasos</h2>
        <p className="text-muted-foreground text-sm">
          {isEmail
            ? otpSent
              ? "Ingresa el código que enviamos a tu correo."
              : "Solicita un código para continuar por email."
            : isBackup
              ? "Ingresa uno de tus códigos de respaldo."
              : "Ingresa el código de tu aplicación autenticadora."}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {isWaitingForEmailOtp ? (
          <Button disabled={isPending} onClick={sendEmailOtp} type="button">
            {isPending ? "Enviando..." : "Enviar código por email"}
          </Button>
        ) : isBackup ? (
          <Input
            autoComplete="off"
            autoFocus
            id="two-factor-code"
            maxLength={32}
            onChange={(event) => setCode(event.target.value)}
            placeholder="XXXXX-XXXXX"
            value={code}
          />
        ) : (
          <InputOTP
            autoComplete="one-time-code"
            autoFocus
            containerClassName="justify-center"
            id="two-factor-code"
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
        )}
      </div>

      <label
        className="flex cursor-pointer items-center gap-3 text-sm"
        htmlFor="login-trust-device"
      >
        <Checkbox
          checked={trustDevice}
          id="login-trust-device"
          onCheckedChange={setTrustDevice}
        />
        Confiar en este dispositivo durante 30 días
      </label>

      {error && (
        <p aria-live="polite" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {!isWaitingForEmailOtp && (
        <Button disabled={isPending} type="submit">
          {isPending ? "Verificando..." : "Verificar"}
        </Button>
      )}

      <div className="flex flex-wrap justify-center gap-1">
        {method !== "totp" && methods.includes("totp") && (
          <Button
            disabled={isPending}
            onClick={() => selectMethod("totp")}
            type="button"
            variant="link"
          >
            Usar autenticador
          </Button>
        )}
        {method !== "otp" && methods.includes("otp") && (
          <Button
            disabled={isPending}
            onClick={selectEmailOtp}
            type="button"
            variant="link"
          >
            Enviar código por email
          </Button>
        )}
        {method !== "backup" && showBackupCodeOption && (
          <Button
            disabled={isPending}
            onClick={() => selectMethod("backup")}
            type="button"
            variant="link"
          >
            Usar código de respaldo
          </Button>
        )}
      </div>

      {isEmail && otpSent && (
        <Button
          disabled={isPending}
          onClick={sendEmailOtp}
          type="button"
          variant="ghost"
        >
          Reenviar código
        </Button>
      )}
      <Button
        disabled={isPending}
        onClick={onCancel}
        type="button"
        variant="ghost"
      >
        Volver al inicio de sesión
      </Button>
    </form>
  );
}
