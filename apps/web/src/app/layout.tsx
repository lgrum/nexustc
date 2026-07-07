import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";

import { Providers } from "./providers";
import { createPageMetadata, metadataBaseUrl } from "./seo";
import "../lib/orpc.server"; // for pre-rendering

import "./globals.css";

export const metadata: Metadata = {
  ...createPageMetadata(),
  applicationName: "NeXusTC",
  metadataBase: new URL(metadataBaseUrl),
  robots: {
    follow: true,
    index: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="dark" lang="es" suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground antialiased">
        <Suspense fallback={null}>
          <Providers>{children}</Providers>
        </Suspense>
        <Script
          data-performance="true"
          data-website-id="59156ec8-eed3-446f-85bd-ab0edc3958bf"
          defer
          src="https://umami.nexustc18.com/script.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
