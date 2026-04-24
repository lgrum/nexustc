import { Dialog } from "@base-ui/react/dialog";
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  LogoutSquare01Icon,
  ShieldUserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

import { getCookie } from "@/lib/utils";

import { Button } from "./ui/button";

const CONFIRMATIONS = [
  "Tengo 18 años o la mayoría de edad en mi jurisdicción.",
  "Entiendo que el sitio contiene material explícito para adultos.",
  "Accedo de forma voluntaria y bajo mi propia responsabilidad.",
] as const;

const AGE_VERIFIED_KEY = "age_verified";
const AGE_VERIFICATION_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

const handleReject = () => {
  window.location.assign("about:blank");
};

const hasAgeVerification = () => {
  if (getCookie(AGE_VERIFIED_KEY)) {
    return true;
  }

  try {
    return localStorage.getItem(AGE_VERIFIED_KEY) === "true";
  } catch {
    return false;
  }
};

const storeAgeVerification = async () => {
  if ("cookieStore" in window) {
    await window.cookieStore.set({
      expires: Date.now() + AGE_VERIFICATION_MAX_AGE_SECONDS * 1000,
      name: AGE_VERIFIED_KEY,
      path: "/",
      sameSite: "lax",
      value: "true",
    });
  } else {
    // oxlint-disable-next-line no-document-cookie: Safari on iOS does not support the Cookie Store API until iOS 18.3
    document.cookie = `${AGE_VERIFIED_KEY}=true; Path=/; Max-Age=${AGE_VERIFICATION_MAX_AGE_SECONDS}; SameSite=Lax`;
  }

  try {
    localStorage.setItem(AGE_VERIFIED_KEY, "true");
  } catch {
    // Cookies are enough when storage is unavailable.
  }
};

export function AgeVerificationDialog() {
  const [open, setOpen] = useState(false);

  // getCookie only works on browser environments, so we avoid ssr with this
  useEffect(() => {
    setOpen(!hasAgeVerification());
  }, []);

  const handleAccept = async () => {
    try {
      await storeAgeVerification();
    } finally {
      setOpen(false);
    }
  };

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 z-50 bg-background/85 backdrop-blur-md duration-200 data-closed:animate-out data-open:animate-in" />
        <Dialog.Popup className="data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 flex w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-2xl outline-none backdrop-blur-xl duration-200 data-closed:animate-out data-open:animate-in sm:max-w-130">
          {/* Ambient atmosphere — warm amber wash with a fuchsia accent */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-linear-to-b from-primary/[0.14] via-primary/4 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -left-20 h-56 w-56 rounded-full bg-primary/30 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -right-24 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-3xl"
          />

          <header className="relative flex flex-col items-center gap-4 px-8 pt-10 pb-4 text-center">
            <div className="relative">
              <span
                aria-hidden
                className="-inset-3 absolute rounded-full bg-primary/25 blur-xl"
              />
              <div className="relative flex size-16 items-center justify-center rounded-2xl border border-primary/40 bg-primary/15 shadow-[0_0_32px_-4px] shadow-primary/55">
                <HugeiconsIcon
                  className="size-7 text-primary"
                  icon={ShieldUserIcon}
                  strokeWidth={1.8}
                />
              </div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-semibold text-[10.5px] text-primary uppercase tracking-[0.24em]">
                +18 Only
              </span>
              <Dialog.Title
                className="display-heading text-balance text-[24px] text-foreground leading-[1.1] sm:text-[26px]"
                // oxlint-disable-next-line jsx_a11y/heading-has-content
                render={<h2 />}
              >
                Verificación de edad
              </Dialog.Title>
              <Dialog.Description
                className="max-w-md text-pretty text-[13px] text-muted-foreground leading-relaxed"
                render={<p />}
              >
                NeXusTC contiene material gráfico, lenguaje explícito y
                temáticas sexuales. Necesitamos confirmar que eres mayor de edad
                antes de continuar.
              </Dialog.Description>
            </div>
          </header>

          <div className="glow-line mx-auto w-[80%]" />

          <div className="relative px-6 py-5">
            <ul className="flex flex-col gap-2">
              {CONFIRMATIONS.map((line) => (
                <li
                  className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5"
                  key={line}
                >
                  <HugeiconsIcon
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    icon={CheckmarkCircle02Icon}
                  />
                  <span className="text-[12.5px] text-foreground/90 leading-snug">
                    {line}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-[11px] text-muted-foreground/80 leading-snug">
              Al continuar aceptas nuestros{" "}
              <a
                className="underline underline-offset-4 hover:text-primary"
                href="/terms"
              >
                Términos
              </a>{" "}
              y{" "}
              <a
                className="underline underline-offset-4 hover:text-primary"
                href="/privacy"
              >
                Política de Privacidad
              </a>
              . Si estás en una jurisdicción donde este contenido no es legal,
              abandona el sitio.
            </p>
          </div>

          <div className="relative flex flex-col gap-2 border-border/50 border-t bg-background/30 p-4 sm:flex-row-reverse sm:items-center sm:gap-3">
            <Button
              className="group h-11 w-full gap-2 rounded-lg font-semibold text-[13.5px] tracking-wide shadow-glow-primary/25 transition-[background-color,box-shadow] duration-200 hover:shadow-glow-primary/45 sm:flex-1"
              onClick={handleAccept}
            >
              <span>Soy mayor de edad — Entrar</span>
              <HugeiconsIcon
                className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                icon={ArrowRight01Icon}
              />
            </Button>
            <Button
              className="h-11 w-full gap-2 rounded-lg border-border/70 text-[12.5px] text-muted-foreground hover:text-foreground sm:w-auto sm:shrink-0 sm:px-4"
              onClick={handleReject}
              variant="outline"
            >
              <HugeiconsIcon className="size-4" icon={LogoutSquare01Icon} />
              Salir
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
