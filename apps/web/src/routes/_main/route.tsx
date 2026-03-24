import { AlertCircleIcon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Suspense } from "react";

import { AdblockBlockerDialog } from "@/components/adblock-blocker-dialog";
import { AppSidebar } from "@/components/app-sidebar";
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
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAdblockDetector } from "@/hooks/use-adblock-detector";
import { cn } from "@/lib/utils";

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
});

function MainLayout() {
  const { detected } = useAdblockDetector();

  return (
    <Wrapper>
      <AdblockBlockerDialog open={detected} />
      <Suspense fallback={<LoadingSpinner />}>
        <Outlet />
      </Suspense>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <div
        className={cn("relative min-h-screen w-full min-w-0 overflow-x-clip")}
      >
        <div className="fixed inset-0 z-0 h-screen" />

        <SidebarInset>
          <div
            className="relative grid min-h-dvh min-w-0 grid-rows-[1fr_auto] overflow-x-clip pb-[calc(theme(spacing.16)+env(safe-area-inset-bottom))] md:pb-0"
            id="main-scrollable-area"
          >
            <div className="flex w-full min-w-0 max-w-full flex-col items-center overflow-x-clip">
              <Header />
              {children}
            </div>
            <Footer />
          </div>
        </SidebarInset>
      </div>
      <BottomNav />
    </SidebarProvider>
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
