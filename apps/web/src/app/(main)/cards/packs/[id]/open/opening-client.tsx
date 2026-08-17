"use client";

import type { PackOpeningCard } from "@repo/shared/collectibles";
import { useMutation, useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { getClientErrorMessage, orpc } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

const SLICE_DISTANCE = 64;
const REVEAL_DELAY_MS = 520;

type OpeningView = {
  assetObjectKey: string;
  cardCount: number;
  id: string;
  openedAt: Date | string | null;
  openingId: string | null;
  revision: number | null;
  revisionId: string;
  result: PackOpeningCard[] | null;
  source: string;
  state: "opened" | "unopened";
  templateId: string;
  templateName: string;
};

type CommittedResult = {
  cards: PackOpeningCard[];
  openedAt: Date | string;
  openingId: string;
  packInstanceId: string;
  replayed: boolean;
  revision: number;
  revisionId: string;
  source: string;
  templateId: string;
};

export default function OpeningClient({
  packInstanceId,
}: {
  packInstanceId: string;
}) {
  const [idempotencyKey] = useState(
    () => `pack-open:${packInstanceId}:${Date.now()}`
  );
  const [committedResult, setCommittedResult] =
    useState<CommittedResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [muted, setMuted] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const revealHeadingRef = useRef<HTMLHeadingElement>(null);
  const sliceStartRef = useRef<{ x: number; y: number } | null>(null);
  const sliceTriggeredRef = useRef(false);
  const openingQuery = useQuery({
    ...orpc.packs.opening.queryOptions({ input: { packInstanceId } }),
    refetchOnMount: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });
  const openMutation = useMutation(orpc.packs.open.mutationOptions());

  const recoveredResult = useMemo<CommittedResult | null>(() => {
    const view = openingQuery.data as OpeningView | null | undefined;
    if (view?.state !== "opened" || !view.result || !view.openingId) {
      return null;
    }
    return {
      cards: view.result,
      openedAt: view.openedAt ?? new Date(),
      openingId: view.openingId,
      packInstanceId: view.id,
      replayed: true,
      revision: view.revision ?? 0,
      revisionId: view.revisionId,
      source: view.source,
      templateId: view.templateId,
    };
  }, [openingQuery.data]);
  const result = committedResult ?? recoveredResult;
  const view = openingQuery.data as OpeningView | null | undefined;
  const isOpened = Boolean(result) || view?.state === "opened";
  const isBusy = openMutation.isPending || openingQuery.isFetching;

  const focusRevealHeading = useCallback(() => {
    window.requestAnimationFrame(() => {
      revealHeadingRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const recoverOpening = useCallback(async () => {
    const recovered = await openingQuery.refetch();
    if (recovered.data?.state === "opened") {
      setErrorMessage(null);
    }
    return recovered.data;
  }, [openingQuery.refetch]);

  const commitOpening = useCallback(async () => {
    if (isBusy || isOpened) {
      return;
    }
    setErrorMessage(null);
    try {
      const nextResult = await openMutation.mutateAsync({
        idempotencyKey,
        packInstanceId,
      });
      setCommittedResult(nextResult);
      focusRevealHeading();
    } catch (error) {
      try {
        const recovered = await recoverOpening();
        if (recovered?.state === "opened") {
          return;
        }
      } catch {
        // The visible error below keeps the retry path available.
      }
      setErrorMessage(getClientErrorMessage(error));
    }
  }, [
    focusRevealHeading,
    idempotencyKey,
    isBusy,
    isOpened,
    openMutation,
    packInstanceId,
    recoverOpening,
  ]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mediaQuery) {
      return;
    }
    const updateReducedMotion = () => setIsReducedMotion(mediaQuery.matches);
    updateReducedMotion();
    mediaQuery.addEventListener?.("change", updateReducedMotion);
    return () =>
      mediaQuery.removeEventListener?.("change", updateReducedMotion);
  }, []);

  useEffect(() => {
    try {
      setMuted(window.localStorage.getItem("pack-opening-muted") === "true");
    } catch {
      // A restricted storage context still gets a working opening flow.
    }
  }, []);

  useEffect(() => {
    const goOnline = () => {
      setIsOffline(false);
      void recoverOpening();
    };
    const goOffline = () => setIsOffline(true);
    setIsOffline(typeof navigator !== "undefined" && !navigator.onLine);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [recoverOpening]);

  useEffect(() => {
    if (!result) {
      setRevealedCount(0);
      return;
    }
    setRevealedCount(isReducedMotion ? result.cards.length : 0);
    focusRevealHeading();
  }, [focusRevealHeading, isReducedMotion, result]);

  useEffect(() => {
    if (!result || isReducedMotion || revealedCount >= result.cards.length) {
      return;
    }
    const timer = window.setTimeout(
      () =>
        setRevealedCount((count) => Math.min(count + 1, result.cards.length)),
      REVEAL_DELAY_MS
    );
    return () => window.clearTimeout(timer);
  }, [isReducedMotion, revealedCount, result]);

  const skipReveal = () => {
    if (!result) {
      return;
    }
    setRevealedCount(result.cards.length);
    focusRevealHeading();
  };

  const updateTilt = (clientX: number, clientY: number, element: Element) => {
    const bounds = element.getBoundingClientRect();
    const x = Math.max(
      -1,
      Math.min(1, ((clientX - bounds.left) / bounds.width) * 2 - 1)
    );
    const y = Math.max(
      -1,
      Math.min(1, ((clientY - bounds.top) / bounds.height) * 2 - 1)
    );
    setTilt({ x, y });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (isBusy || isOpened) {
      return;
    }
    sliceTriggeredRef.current = false;
    sliceStartRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!sliceStartRef.current) {
      return;
    }
    updateTilt(event.clientX, event.clientY, event.currentTarget);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = sliceStartRef.current;
    sliceStartRef.current = null;
    setTilt({ x: 0, y: 0 });
    if (!start) {
      return;
    }
    const distance = Math.hypot(
      event.clientX - start.x,
      event.clientY - start.y
    );
    if (distance >= SLICE_DISTANCE) {
      sliceTriggeredRef.current = true;
      void commitOpening();
    }
  };

  const toggleMuted = () => {
    setMuted((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("pack-opening-muted", String(next));
      } catch {
        // The control remains usable when storage is unavailable.
      }
      return next;
    });
  };

  if (openingQuery.isPending) {
    return <OpeningShell>Preparando tu Pack…</OpeningShell>;
  }

  if (!view && openingQuery.error) {
    return (
      <OpeningShell>
        <p className="text-destructive">No pudimos encontrar este Pack.</p>
        <Button
          onClick={() => void openingQuery.refetch()}
          type="button"
          variant="outline"
        >
          Reintentar
        </Button>
      </OpeningShell>
    );
  }

  if (!view) {
    return <OpeningShell>Este Pack no está disponible.</OpeningShell>;
  }

  return (
    <main className="container space-y-8 py-10">
      <Link
        className="text-muted-foreground text-sm hover:text-foreground"
        href="/cards/inventory"
      >
        ← Volver al inventario
      </Link>
      <header className="max-w-2xl space-y-3">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Revelado privado · revisión {view.revision ?? "histórica"}
        </p>
        <h1 className="font-black text-4xl tracking-tight">
          {isOpened ? "Tus cartas están listas" : `Abrir ${view.templateName}`}
        </h1>
        <p className="text-muted-foreground">
          {isOpened
            ? "Este resultado quedó confirmado y se puede recuperar aunque cierres o actualices la página."
            : `${view.cardCount} cartas esperan dentro de este Pack. La apertura se confirma antes de mostrar cualquier carta.`}
        </p>
      </header>

      {isOffline ? (
        <p className="rounded-xl border border-amber-400/50 bg-amber-400/10 p-4 text-sm">
          Estás sin conexión. Conservamos la pantalla y volveremos a consultar
          el resultado confirmado cuando regreses.
        </p>
      ) : null}
      {errorMessage ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-destructive text-sm">
          {errorMessage}
        </p>
      ) : null}

      {/* The preparation state reads more clearly before the committed reveal. */}
      {/* oxlint-disable-next-line eslint/no-negated-condition */}
      {!result ? (
        <section aria-label="Abrir Pack" className="grid gap-8 lg:grid-cols-2">
          <button
            aria-label={`Abrir ${view.templateName}`}
            className="group relative touch-none overflow-hidden rounded-3xl border bg-card p-2 text-left shadow-xl outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-transform motion-safe:duration-200"
            disabled={isBusy}
            onClick={() => {
              if (sliceTriggeredRef.current) {
                sliceTriggeredRef.current = false;
                return;
              }
              void commitOpening();
            }}
            onPointerCancel={() => {
              sliceStartRef.current = null;
              setTilt({ x: 0, y: 0 });
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              transform: `perspective(900px) rotateX(${tilt.y * -4}deg) rotateY(${tilt.x * 4}deg)`,
            }}
            type="button"
          >
            <Image
              alt={`Arte del Pack ${view.templateName}`}
              className="aspect-video h-auto w-full rounded-2xl object-cover"
              height={720}
              priority
              src={getBucketUrl(view.assetObjectKey)}
              width={1280}
            />
            <span className="absolute inset-x-6 bottom-6 rounded-xl bg-background/90 px-4 py-3 text-center font-bold text-sm backdrop-blur">
              Desliza para cortar o pulsa Abrir
            </span>
          </button>
          <div className="flex flex-col justify-center gap-4 rounded-3xl border bg-card/60 p-6">
            <h2 className="font-bold text-2xl">Una apertura confirmada</h2>
            <p className="text-muted-foreground text-sm">
              El servidor guarda el resultado antes de iniciar el revelado. No
              hay previsualizaciones ni tiradas nuevas al reintentar.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={isBusy}
                onClick={() => void commitOpening()}
                type="button"
              >
                {openMutation.isPending ? "Confirmando…" : "Abrir Pack"}
              </Button>
              <Button
                aria-pressed={muted}
                onClick={toggleMuted}
                type="button"
                variant="outline"
              >
                Sonido: {muted ? "apagado" : "encendido"}
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <section aria-labelledby="opening-results" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2
              className="rounded-md font-bold text-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              id="opening-results"
              ref={revealHeadingRef}
              tabIndex={-1}
            >
              Resultado confirmado
            </h2>
            <div className="flex flex-wrap gap-3">
              {revealedCount < result.cards.length ? (
                <Button onClick={skipReveal} type="button" variant="outline">
                  Saltar revelado
                </Button>
              ) : null}
              <Button
                aria-pressed={muted}
                onClick={toggleMuted}
                type="button"
                variant="outline"
              >
                Sonido: {muted ? "apagado" : "encendido"}
              </Button>
            </div>
          </div>
          <p aria-live="polite" className="text-muted-foreground text-sm">
            {revealedCount < result.cards.length
              ? `Revelando carta ${revealedCount + 1} de ${result.cards.length}…`
              : "Todas las cartas están visibles."}
          </p>
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {result.cards.slice(0, revealedCount).map((card) => (
              <OpeningCard
                card={card}
                key={card.cardInstanceId}
                reducedMotion={isReducedMotion}
              />
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}

function OpeningCard({
  card,
  reducedMotion,
}: {
  card: PackOpeningCard;
  reducedMotion: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const variant = card.template.renderedVariants.find(({ variant: key }) =>
    reducedMotion
      ? key === "reduced-motion" || key === "static"
      : key === "standard" || key === "static"
  );
  return (
    <li className="overflow-hidden rounded-3xl border bg-card shadow-lg motion-safe:transition-opacity">
      <div className="aspect-[4/5] bg-gradient-to-br from-primary/20 via-card to-muted">
        {variant && !imageFailed ? (
          <Image
            alt={`${card.template.characterName}, ${card.template.gameName}, ${card.mintDisplay}`}
            className="h-full w-full object-cover"
            height={variant.height}
            onError={() => setImageFailed(true)}
            src={getBucketUrl(variant.objectKey)}
            width={variant.width}
          />
        ) : (
          <div
            aria-label={`${card.template.characterName}, ${card.template.gameName}, ${card.mintDisplay}`}
            className="flex h-full flex-col items-center justify-center gap-2 p-5 text-center"
            role="img"
          >
            <span className="font-black text-2xl">
              {card.template.characterName}
            </span>
            <span className="text-muted-foreground text-sm">
              {card.template.gameName} · {card.mintDisplay}
            </span>
          </div>
        )}
      </div>
      <div className="space-y-1 p-4">
        <h3 className="font-bold">{card.template.characterName}</h3>
        <p className="text-muted-foreground text-sm">
          {card.template.gameName} · {card.template.seriesName}
        </p>
        <p className="text-muted-foreground text-xs">
          {card.mintDisplay} · {card.template.rarity}
        </p>
      </div>
    </li>
  );
}

function OpeningShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="container flex min-h-[50vh] flex-col items-center justify-center gap-4 py-10 text-center">
      {children}
    </main>
  );
}
