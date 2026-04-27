import { AlertCircleIcon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DEFAULT_MARQUEE_ITEMS } from "@repo/shared/schemas";
import type { MarqueeItem } from "@repo/shared/schemas";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Suspense } from "react";

import { AdblockBlockerDialog } from "@/components/adblock-blocker-dialog";
import { BottomNav } from "@/components/bottom-nav";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { LoadingSpinner } from "@/components/loading-spinner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAdblockDetector } from "@/hooks/use-adblock-detector";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_main")({
  component: MainLayout,
  errorComponent: ({ error, reset }) => (
    <Wrapper>
      <ErrorComponent error={error} reset={reset} />
    </Wrapper>
  ),
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Principal",
      },
    ],
  }),
  loader: async () => {
    try {
      return await orpcClient.siteConfig.getMarquee();
    } catch {
      return { items: DEFAULT_MARQUEE_ITEMS };
    }
  },
});

function MainLayout() {
  const { items } = Route.useLoaderData();
  const { detected } = useAdblockDetector();

  return (
    <Wrapper marqueeItems={items}>
      <AdblockBlockerDialog open={detected} />
      <Suspense fallback={<LoadingSpinner />}>
        <Outlet />
      </Suspense>
    </Wrapper>
  );
}

function Marquee({ items }: { items: readonly MarqueeItem[] }) {
  return (
    <div className="font-[Lexend] font-semibold uppercase tracking-[0.22em] text-[11px] flex w-max shrink-0 gap-10 py-2 pr-10 items-center">
      {items.map((item, idx) => {
        const content = item.url ? (
          <a
            className="text-primary/80 transition-colors hover:text-primary underline-offset-4 hover:underline"
            href={item.url}
            key={`${item.text}:${item.url}`}
          >
            {item.text}
          </a>
        ) : (
          <span className="text-muted-foreground" key={item.text}>
            {item.text}
          </span>
        );
        return (
          <span
            className="flex items-center gap-10"
            // oxlint-disable-next-line react/no-array-index-key
            key={`${item.text}:${idx}`}
          >
            {content}
            {idx !== items.length - 1 && (
              <span aria-hidden className="size-1 rounded-full bg-primary/40" />
            )}
          </span>
        );
      })}
    </div>
  );
}

function Wrapper({
  children,
  marqueeItems = DEFAULT_MARQUEE_ITEMS,
}: {
  children: React.ReactNode;
  marqueeItems?: readonly MarqueeItem[];
}) {
  return (
    <>
      <div className="relative min-h-screen w-full min-w-0 overflow-x-clip selection:bg-accent selection:text-accent-foreground">
        <div className="group relative w-full overflow-hidden whitespace-nowrap border-b border-border/60 bg-linear-to-r from-background via-[oklch(0.2_0.03_285)] to-background">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-linear-to-r from-background to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-linear-to-l from-background to-transparent z-10" />
          <div className="flex min-w-[200%] justify-around hover:paused animate-marquee select-none">
            <Marquee items={marqueeItems} />
            <Marquee items={marqueeItems} />
          </div>
        </div>
        <div
          className="relative grid min-h-dvh min-w-0 grid-rows-[1fr_auto] overflow-x-clip pb-[calc(--spacing(16)+env(safe-area-inset-bottom))] md:pb-0"
          id="main-scrollable-area"
        >
          <div className="relative flex w-full min-w-0 max-w-full flex-col items-center overflow-x-clip">
            <div className="container space-y-4">
              <Header />
              <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>
            </div>
          </div>
          <Footer />
        </div>
      </div>
      <BottomNav />
    </>
  );
}

function isRateLimitError(error: unknown) {
  return error instanceof Error && error.message === "RATE_LIMITED";
}

function reload() {
  window.location.reload();
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const rateLimited = isRateLimitError(error);

  if (rateLimited) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center text-center">
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-amber-500/10">
            <HugeiconsIcon
              className="size-6 text-amber-500"
              icon={Clock01Icon}
            />
          </div>
          <CardTitle>Demasiadas solicitudes</CardTitle>
          <CardDescription>
            <p>Has realizado demasiadas solicitudes en poco tiempo.</p>
            <p>Por favor, espera un momento antes de intentarlo de nuevo.</p>
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button onClick={reload}>Recargar</Button>
        </CardFooter>
      </Card>
    );
  }

  // Generic error UI
  return (
    <Card className="max-w-md">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <HugeiconsIcon
            className="size-6 text-destructive"
            icon={AlertCircleIcon}
          />
        </div>
        <CardTitle>Ha ocurrido un error</CardTitle>
        <CardDescription>{error.message}</CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-muted-foreground">
          Algo salió mal. Por favor, intenta recargar la página. Si el problema
          persiste, contacta al administrador del sitio.
        </p>
      </CardContent>
      <CardFooter className="justify-center gap-2">
        <Button onClick={reset}>Reintentar</Button>
        {!!error.stack && (
          <Dialog>
            <DialogTrigger render={<Button variant="outline" />}>
              Ver detalles
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Detalles del error</DialogTitle>
                <DialogDescription>
                  Información técnica del error para depuración.
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-80 overflow-auto rounded-lg bg-muted p-4">
                <pre className="whitespace-pre-wrap text-destructive text-xs">
                  {error.stack}
                </pre>
              </div>
              <DialogFooter showCloseButton />
            </DialogContent>
          </Dialog>
        )}
      </CardFooter>
    </Card>
  );
}
