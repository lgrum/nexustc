import { Dialog } from "@base-ui/react/dialog";
import {
  AlertCircleIcon,
  BlockedIcon,
  Crown02Icon,
  ReloadIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";

import { Button } from "./ui/button";

type AdblockBlockerDialogProps = {
  open: boolean;
};

const STEPS = [
  "Abre el menú de tu bloqueador en la barra del navegador.",
  'Elige "Pausar en este sitio" o "Desactivar".',
  "Recarga la página desde el botón de abajo.",
] as const;

const handleReload = () => {
  window.location.reload();
};

export function AdblockBlockerDialog({ open }: AdblockBlockerDialogProps) {
  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Backdrop className="data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 z-50 bg-background/80 backdrop-blur-md duration-200 data-closed:animate-out data-open:animate-in" />
        <Dialog.Popup className="data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 flex w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/90 shadow-2xl outline-none backdrop-blur-xl duration-200 data-closed:animate-out data-open:animate-in sm:max-w-115">
          {/* Ambient tint — rose-washed atmosphere up top */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-linear-to-b from-rose-500/12 via-rose-500/4 to-transparent"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-rose-500/25 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-16 -left-20 h-44 w-44 rounded-full bg-amber-400/15 blur-3xl"
          />

          <header className="relative flex flex-col items-center gap-4 px-8 pt-10 pb-5 text-center">
            <div className="relative">
              <span
                aria-hidden
                className="-inset-3 absolute rounded-full bg-rose-500/30 blur-xl"
              />
              <div className="relative flex size-16 items-center justify-center rounded-2xl border border-rose-500/35 bg-rose-500/15 shadow-[0_0_30px_-4px] shadow-rose-500/50">
                <HugeiconsIcon
                  className="size-7 text-rose-200"
                  icon={BlockedIcon}
                  strokeWidth={1.8}
                />
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-2xl border border-rose-400/40 mask-[linear-gradient(to_bottom,black,transparent)]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="inline-flex items-center gap-1.5 self-center rounded-full border border-rose-500/35 bg-rose-500/10 px-2.5 py-0.5 font-medium text-[10.5px] text-rose-200 uppercase tracking-[0.2em]">
                <HugeiconsIcon className="size-3" icon={AlertCircleIcon} />
                Sistema
              </span>
              <Dialog.Title
                className="display-heading text-balance text-[22px] text-foreground leading-[1.1]"
                // oxlint-disable-next-line jsx_a11y/heading-has-content
                render={<h2 />}
              >
                Bloqueador de anuncios detectado
              </Dialog.Title>
              <Dialog.Description
                className="text-pretty text-[13px] text-muted-foreground leading-relaxed"
                render={<p />}
              >
                Los anuncios son lo que mantiene NeXusTC vivo y sin costo para
                ti. Desactiva tu bloqueador y recarga para seguir navegando.
              </Dialog.Description>
            </div>
          </header>

          <div className="relative px-6 pb-6">
            <ol className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/40 p-4">
              {STEPS.map((step, index) => (
                <li
                  className="flex items-start gap-3 text-[12.5px] text-foreground/90 leading-snug"
                  key={step}
                >
                  <span
                    aria-hidden
                    className="mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/15 font-semibold text-[10.5px] text-rose-200 tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            <Button
              className="mt-5 h-11 w-full gap-2 rounded-lg font-semibold text-[13.5px] tracking-wide shadow-glow-primary/20 transition-[background-color,box-shadow] duration-200 hover:shadow-glow-primary/40"
              onClick={handleReload}
            >
              <HugeiconsIcon className="size-4" icon={ReloadIcon} />
              Ya lo desactivé — Recargar
            </Button>

            <div className="mt-4 flex items-center gap-3">
              <div className="h-px grow bg-border/60" />
              <span className="font-medium text-[10.5px] text-muted-foreground uppercase tracking-[0.22em]">
                o
              </span>
              <div className="h-px grow bg-border/60" />
            </div>

            <Link
              className="group mt-3 flex items-center gap-3 rounded-xl border border-amber-400/40 bg-linear-to-r from-amber-400/10 via-amber-400/6 to-transparent px-3 py-2.5 transition-[background-color,border-color,box-shadow] duration-200 hover:border-amber-400/65 hover:bg-amber-400/15 hover:shadow-glow-amber-400/30"
              to="/vip"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-amber-400/55 bg-amber-400/15">
                <HugeiconsIcon
                  className="size-4 text-amber-200"
                  icon={Crown02Icon}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="font-semibold text-[12.5px] text-amber-50">
                  Mejor aún: hazte VIP
                </span>
                <span className="text-[11px] text-amber-200/75">
                  Navegación sin anuncios desde LvL 3 · Apoya al proyecto.
                </span>
              </div>
              <span className="text-[11px] text-amber-200/80 transition-transform duration-200 group-hover:translate-x-0.5">
                →
              </span>
            </Link>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
