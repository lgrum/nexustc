"use client";

import { QueryClientProvider } from "@tanstack/react-query";

import { AgeVerificationDialog } from "@/components/age-verification-dialog";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { Toaster } from "@/components/ui/sonner";
import { getQueryClient } from "@/lib/orpc";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      <ConfirmDialogProvider
        defaultOptions={{
          alertDialogContent: {
            className: "sm:max-w-[425px] rounded-md",
          },
          alertDialogFooter: {
            className: "gap-2",
          },
          alertDialogOverlay: {
            className: "bg-black/50 backdrop-blur",
          },
          cancelButton: {
            variant: "outline",
          },
          confirmButton: {
            variant: "destructive",
          },
        }}
      >
        {children}
      </ConfirmDialogProvider>
      <AgeVerificationDialog />
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
