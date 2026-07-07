"use client";

import type { MarqueeItem } from "@repo/shared/schemas";
import { DEFAULT_MARQUEE_ITEMS } from "@repo/shared/schemas";
import { Suspense } from "react";

import { AdblockBlockerDialog } from "@/components/adblock-blocker-dialog";
import { BottomNav } from "@/components/bottom-nav";
import { Footer } from "@/components/landing/footer";
import { Header } from "@/components/landing/header";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useAdblockDetector } from "@/hooks/use-adblock-detector";

function Marquee({ items }: { items: readonly MarqueeItem[] }) {
  return (
    <div className="flex w-max shrink-0 items-center gap-10 py-2 pr-10 font-lexend font-semibold text-[11px] uppercase tracking-[0.22em]">
      {items.map((item, idx) => {
        const content = item.url ? (
          <a
            className="text-primary/80 underline-offset-4 transition-colors hover:text-primary hover:underline"
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

export function MainShell({
  children,
  marqueeItems = DEFAULT_MARQUEE_ITEMS,
}: {
  children: React.ReactNode;
  marqueeItems?: readonly MarqueeItem[];
}) {
  const { detected } = useAdblockDetector();

  return (
    <>
      <div className="relative min-h-screen w-full min-w-0 overflow-x-clip selection:bg-accent selection:text-accent-foreground">
        <AdblockBlockerDialog open={detected} />
        <div className="group relative w-full overflow-hidden whitespace-nowrap border-border/60 border-b bg-linear-to-r from-background via-[oklch(0.2_0.03_285)] to-background">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-linear-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-linear-to-l from-background to-transparent" />
          <div className="flex min-w-[200%] select-none justify-around hover:paused animate-marquee">
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
