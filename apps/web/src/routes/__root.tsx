import { TanStackDevtools } from "@tanstack/react-devtools";
import { formDevtoolsPlugin } from "@tanstack/react-form-devtools";
import {
  createRootRoute,
  HeadContent,
  ScriptOnce,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { AgeVerificationDialog } from "@/components/age-verification-dialog";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    links: [
      {
        href: appCss,
        rel: "stylesheet",
      },
    ],
    meta: [
      {
        charSet: "utf8",
      },
      {
        content: "width=device-width, initial-scale=1",
        name: "viewport",
      },
      {
        title: "TanStack Start Starter",
      },
    ],
  }),

  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <HeadContent />

        <script
          crossOrigin="anonymous"
          src="https://tweakcn.com/live-preview.min.js"
        />
      </head>
      <body className="dark">
        <ScriptOnce>{themeInitScript()}</ScriptOnce>
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
        <TanStackDevtools
          config={{
            position: "top-right",
          }}
          plugins={[
            formDevtoolsPlugin(),
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}

function themeInitScript() {
  return `
(function () {
  try {
    const theme = localStorage.getItem("theme");
    if (!theme) theme = "system";

    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = theme === "dark" || (theme === "system" && systemDark)
      ? "dark"
      : "light";

    document.documentElement.classList.add(resolved);
    document.documentElement.style.colorScheme = resolved;
  } catch (_) {}
})();
`;
}
