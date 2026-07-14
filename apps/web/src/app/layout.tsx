import type { Metadata } from "next";
import { Lexend, Outfit } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";

import { Providers } from "./providers";
import { createPageMetadata, metadataBaseUrl } from "./seo";
import "../lib/orpc.server"; // for pre-rendering

import "./globals.css";

const outfit = Outfit({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-outfit-next",
});

const lexend = Lexend({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-lexend-next",
  weight: "400",
});

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
    <html
      className={`${outfit.variable} ${lexend.variable} dark`}
      lang="es"
      suppressHydrationWarning
    >
      <head>
        <Script
          src="//unpkg.com/react-scan/dist/auto.global.js"
          crossOrigin="anonymous"
          strategy="beforeInteractive"
        />
      </head>

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
