"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { AssetPicker } from "@/components/collectibles/asset-picker";
import type { CollectibleAssetOption } from "@/components/collectibles/asset-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";

type ListingSort = "newest" | "price" | "rarity" | "mint";

function idempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

type LogicalAttempt = { fingerprint: string; key: string };

/** Keep retries of one confirmation/publish command on the same server replay key. */
export function stableAttemptKey(
  prefix: string,
  fingerprint: string,
  attempt: { current: LogicalAttempt | null }
) {
  if (attempt.current?.fingerprint !== fingerprint) {
    attempt.current = { fingerprint, key: idempotencyKey(prefix) };
  }
  return attempt.current.key;
}

export function isStaleListingError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const code = "code" in error ? error.code : undefined;
  const message = "message" in error ? error.message : undefined;
  return (
    code === "STALE_PRICE" ||
    code === "STALE_VERSION" ||
    (typeof message === "string" &&
      (message.includes("STALE_PRICE") || message.includes("STALE_VERSION")))
  );
}

export default function BlackMarketClient() {
  const queryClient = useQueryClient();
  const publishAttempt = useRef<LogicalAttempt | null>(null);
  const purchaseAttempt = useRef<LogicalAttempt | null>(null);
  const [search, setSearch] = useState("");
  const [assetKind, setAssetKind] = useState<"card" | "pack" | "">("");
  const [bundleStatus, setBundleStatus] = useState<"single" | "bundle" | "">(
    ""
  );
  const [sort, setSort] = useState<ListingSort>("newest");
  const [message, setMessage] = useState<string | null>(null);
  const [askingPrice, setAskingPrice] = useState("");
  const [listingAssets, setListingAssets] = useState<CollectibleAssetOption[]>(
    []
  );
  const [selectedListing, setSelectedListing] = useState<{
    askingPrice: string;
    id: string;
    version: number;
  } | null>(null);

  const listingInput = useMemo(
    () => ({
      ...(assetKind ? { assetKind } : {}),
      ...(bundleStatus ? { bundleStatus } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      limit: 24,
      sort,
    }),
    [assetKind, bundleStatus, search, sort]
  );
  const listings = useQuery(
    orpc.blackMarket.search.queryOptions({ input: listingInput })
  );
  const eligible = useQuery(orpc.blackMarket.eligible.queryOptions());
  const publish = useMutation(
    orpc.blackMarket.publish.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        publishAttempt.current = null;
        setMessage(
          "Publicación creada. La tarifa quedó registrada y tus activos están en custodia."
        );
        setListingAssets([]);
        setAskingPrice("");
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.blackMarket.search.queryOptions({
              input: listingInput,
            }).queryKey,
          }),
          queryClient.invalidateQueries({
            queryKey: orpc.blackMarket.eligible.queryOptions().queryKey,
          }),
        ]);
      },
    })
  );
  const purchase = useMutation(
    orpc.blackMarket.purchase.mutationOptions({
      onError: (error) => {
        if (isStaleListingError(error)) {
          purchaseAttempt.current = null;
          setSelectedListing(null);
          void queryClient.invalidateQueries({
            queryKey: orpc.blackMarket.search.queryOptions({
              input: listingInput,
            }).queryKey,
          });
          setMessage(
            "La publicación cambió. Actualizamos el mercado; revisa el precio y confirma una nueva compra."
          );
          return;
        }
        setMessage(
          `${error.message} Si el precio o la versión cambiaron, vuelve a confirmar antes de intentar otra vez.`
        );
      },
      onSuccess: async (result) => {
        purchaseAttempt.current = null;
        setMessage(
          result.replayed
            ? "La compra ya estaba confirmada; recuperamos el mismo resultado."
            : "Compra completada. El lote indivisible fue transferido a tu inventario."
        );
        setSelectedListing(null);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.blackMarket.search.queryOptions({
              input: listingInput,
            }).queryKey,
          }),
          queryClient.invalidateQueries({
            queryKey: orpc.blackMarket.eligible.queryOptions().queryKey,
          }),
        ]);
      },
    })
  );
  const fee = listingFeePreview(askingPrice);

  function submitPublish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (listingAssets.length < 1 || !askingPrice.trim()) {
      setMessage("Añade al menos un activo y define un precio entero.");
      return;
    }
    publish.mutate({
      askingPrice: askingPrice.trim(),
      assets: listingAssets.map(({ assetId, kind }) => ({ assetId, kind })),
      idempotencyKey: stableAttemptKey(
        "black-market-publish",
        JSON.stringify({
          askingPrice: askingPrice.trim(),
          assets: listingAssets.map(({ assetId, kind }) => ({ assetId, kind })),
        }),
        publishAttempt
      ),
    });
  }

  return (
    <main className="container space-y-10 py-10">
      <header className="max-w-4xl space-y-3">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Mercado Negro
        </p>
        <h1 className="font-black text-4xl tracking-tight sm:text-5xl">
          Lotes fijos de coleccionables
        </h1>
        <p className="text-muted-foreground">
          Cada publicación contiene de 1 a 50 Cartas o Packs transferibles. Los
          términos son inmutables, duran 30 días y un lote se compra completo.
          No hay descripciones de vendedor, subastas ni comisiones de venta.
        </p>
        <nav
          aria-label="Navegación del Mercado Negro"
          className="flex flex-wrap gap-2"
        >
          <Link
            className="rounded-full border px-4 py-2 font-semibold text-sm"
            href="/cards/inventory"
          >
            Mi inventario
          </Link>
          <Link
            className="rounded-full border px-4 py-2 font-semibold text-sm"
            href="/profile"
          >
            Mis showcases
          </Link>
        </nav>
      </header>

      <section
        aria-labelledby="market-filters"
        className="space-y-4 rounded-3xl border bg-card/70 p-5"
      >
        <h2 className="font-bold text-xl" id="market-filters">
          Buscar publicaciones
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm" htmlFor="black-market-search">
            Texto libre
            <Input
              id="black-market-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Personaje, juego o Serie"
              value={search}
            />
          </label>
          <label
            className="space-y-1 text-sm"
            htmlFor="black-market-asset-kind"
          >
            Tipo de activo
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-3"
              id="black-market-asset-kind"
              onChange={(event) =>
                setAssetKind(event.target.value as "card" | "pack" | "")
              }
              value={assetKind}
            >
              <option value="">Cualquiera</option>
              <option value="card">Carta</option>
              <option value="pack">Pack</option>
            </select>
          </label>
          <label
            className="space-y-1 text-sm"
            htmlFor="black-market-bundle-status"
          >
            Composición
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-3"
              id="black-market-bundle-status"
              onChange={(event) =>
                setBundleStatus(event.target.value as "single" | "bundle" | "")
              }
              value={bundleStatus}
            >
              <option value="">Cualquiera</option>
              <option value="single">Activo único</option>
              <option value="bundle">Lote</option>
            </select>
          </label>
          <label className="space-y-1 text-sm" htmlFor="black-market-sort">
            Ordenar
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-3"
              id="black-market-sort"
              onChange={(event) => setSort(event.target.value as ListingSort)}
              value={sort}
            >
              <option value="newest">Más recientes</option>
              <option value="price">Precio</option>
              <option value="rarity">Rareza</option>
              <option value="mint">Mint Number</option>
            </select>
          </label>
        </div>
      </section>

      <section aria-labelledby="market-listings" className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-bold text-2xl" id="market-listings">
            En venta
          </h2>
          {listings.isFetching ? (
            <p className="text-muted-foreground text-sm">Actualizando…</p>
          ) : null}
        </div>
        {listings.isError ? (
          <p
            className="rounded-xl border border-destructive/40 p-4 text-destructive"
            role="alert"
          >
            No pudimos cargar las publicaciones. Intenta nuevamente.
          </p>
        ) : listings.data?.items.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.data.items.map((listing) => (
              <Card key={listing.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2">
                    <span>{listing.isBundle ? "Lote" : "Activo único"}</span>
                    <span className="text-primary">
                      {listing.askingPrice} Eteris
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-muted-foreground text-sm">
                    {listing.assetCount} activo
                    {listing.assetCount === 1 ? "" : "s"} · vence{" "}
                    {listing.expiresAt.toLocaleDateString("es-AR")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      className="inline-flex h-8 flex-1 items-center justify-center rounded-lg border px-3 font-medium text-sm hover:bg-muted"
                      href={`/cards/black-market/${listing.id}`}
                    >
                      Ver detalle
                    </Link>
                    <Button
                      className="flex-1"
                      onClick={() =>
                        setSelectedListing({
                          askingPrice: listing.askingPrice,
                          id: listing.id,
                          version: listing.version,
                        })
                      }
                      type="button"
                    >
                      Comprar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            No hay publicaciones que coincidan con estos filtros.
          </p>
        )}
      </section>

      {selectedListing ? (
        <PurchaseDialog
          listing={selectedListing}
          isPending={purchase.isPending}
          onCancel={() => setSelectedListing(null)}
          onConfirm={() =>
            purchase.mutate({
              expectedPrice: selectedListing.askingPrice,
              expectedVersion: selectedListing.version,
              idempotencyKey: stableAttemptKey(
                "black-market-purchase",
                `${selectedListing.id}:${selectedListing.askingPrice}:${selectedListing.version}`,
                purchaseAttempt
              ),
              listingId: selectedListing.id,
            })
          }
        />
      ) : null}

      <section
        aria-labelledby="publish-listing"
        className="space-y-4 rounded-3xl border bg-card/70 p-5"
      >
        <div>
          <h2 className="font-bold text-2xl" id="publish-listing">
            Publicar un lote
          </h2>
          <p className="text-muted-foreground text-sm">
            La tarifa inicial es exactamente el 5% redondeado hacia arriba, con
            mínimo 1 Eteris. Añade entre 1 y 50 activos; el lote no se puede
            dividir. No es reembolsable al cancelar, vender o expirar.
          </p>
        </div>
        <form className="grid gap-3" onSubmit={submitPublish}>
          <AssetPicker
            label="Coleccionables del lote"
            loading={eligible.isLoading}
            onChange={(assets) => {
              setListingAssets(assets);
              publishAttempt.current = null;
            }}
            options={[
              ...(eligible.data?.cards ?? []).map((asset) => ({
                ...asset,
                assetId: asset.id,
                kind: "card" as const,
              })),
              ...(eligible.data?.packs ?? []).map((asset) => ({
                ...asset,
                assetId: asset.id,
                kind: "pack" as const,
              })),
            ]}
            selected={listingAssets}
          />
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
            <label className="space-y-1 text-sm" htmlFor="black-market-price">
              Precio
              <Input
                id="black-market-price"
                inputMode="numeric"
                min="1"
                onChange={(event) => setAskingPrice(event.target.value)}
                type="number"
                value={askingPrice}
              />
            </label>
            <Button
              disabled={publish.isPending}
              loading={publish.isPending}
              type="submit"
            >
              Publicar
            </Button>
            {fee === null ? null : (
              <span className="text-muted-foreground text-sm">
                Tarifa estimada:{" "}
                <strong className="text-foreground">{fee} Eteris</strong>
              </span>
            )}
            <span className="text-muted-foreground text-xs">
              Activos del lote: {listingAssets.length}/50 · Elegibles
              detectados:{" "}
              {(eligible.data?.cards.length ?? 0) +
                (eligible.data?.packs.length ?? 0)}
            </span>
          </div>
        </form>
      </section>

      {message ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm"
        >
          {message}
        </p>
      ) : null}
    </main>
  );
}

function listingFeePreview(value: string): string | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  try {
    const askingPrice = BigInt(normalized);
    if (askingPrice < 1n) {
      return null;
    }
    return ((askingPrice * 5n + 99n) / 100n).toString();
  } catch {
    return null;
  }
}

function PurchaseDialog({
  isPending,
  listing,
  onCancel,
  onConfirm,
}: {
  isPending: boolean;
  listing: { askingPrice: string; id: string; version: number };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      aria-labelledby="purchase-confirmation"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
    >
      <div className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-xl">
        <div>
          <h2 className="font-bold text-2xl" id="purchase-confirmation">
            Confirmar compra
          </h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Vas a comprar el lote completo por{" "}
            <strong className="text-foreground">
              {listing.askingPrice} Eteris
            </strong>
            . El pago es atómico y los términos no se pueden editar.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="outline">
            Volver
          </Button>
          <Button
            disabled={isPending}
            loading={isPending}
            onClick={onConfirm}
            type="button"
          >
            Confirmar y pagar
          </Button>
        </div>
      </div>
    </div>
  );
}
