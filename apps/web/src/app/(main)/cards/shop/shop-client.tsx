"use client";

import type { OfficialCardShopPublicOffer } from "@repo/shared/collectibles";
import { collectibleBindingLabel } from "@repo/shared/collectibles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCollectibleDateTime } from "@/lib/format-date";
import { orpc } from "@/lib/orpc";

type Offer = OfficialCardShopPublicOffer;

type PurchaseReceipt = {
  offerId: string;
  packInstanceIds: string[];
  purchaseId: string;
  quantity: number;
  totalPrice: string;
  transactionId: string;
  unitPrice: string;
};

export function CardShopClient({ initialOffers }: { initialOffers: Offer[] }) {
  const queryClient = useQueryClient();
  const offersQuery = useQuery({
    ...orpc.cardShop.list.queryOptions(),
    initialData: initialOffers,
    staleTime: 30_000,
  });
  const purchaseMutation = useMutation(
    orpc.cardShop.purchase.mutationOptions()
  );
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [receipt, setReceipt] = useState<PurchaseReceipt | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [staleConsent, setStaleConsent] = useState(false);
  const idempotencyKeys = useRef(new Map<string, string>());

  const offers = offersQuery.data ?? [];
  const openConfirmation = (offer: Offer) => {
    setSelectedOffer(offer);
    setQuantity((current) => Math.min(current, maximumQuantity(offer)));
    setMessage(null);
    setReceipt(null);
    setStaleConsent(false);
  };

  const confirmPurchase = async () => {
    if (!selectedOffer) {
      return;
    }
    const offer = selectedOffer;
    const key = `${offer.id}:${offer.version}:${offer.price}:${quantity}`;
    const idempotencyKey =
      idempotencyKeys.current.get(key) ?? crypto.randomUUID();
    idempotencyKeys.current.set(key, idempotencyKey);
    setMessage(null);
    setStaleConsent(false);
    try {
      const result = await purchaseMutation.mutateAsync({
        expectedOfferVersion: offer.version,
        expectedUnitPrice: offer.price,
        idempotencyKey,
        offerId: offer.id,
        quantity,
      });
      setReceipt(result);
      setSelectedOffer(null);
      idempotencyKeys.current.delete(key);
      await queryClient.invalidateQueries(orpc.cardShop.list.queryOptions());
    } catch (error) {
      const candidate = error as { code?: string; message?: string };
      const text = candidate.message ?? "No pudimos completar la compra.";
      if (
        candidate.code === "CONFLICT" ||
        /versión|precio|clave de compra/i.test(text)
      ) {
        setStaleConsent(true);
        // Surface the declared server reason (stale price/version vs reused
        // idempotency key) instead of a generic "offer changed" label.
        setMessage(text);
        const refreshed = await offersQuery.refetch();
        const currentOffer = refreshed.data?.find(({ id }) => id === offer.id);
        if (currentOffer) {
          setSelectedOffer(currentOffer);
          setQuantity((current) =>
            Math.min(current, maximumQuantity(currentOffer))
          );
        }
      } else {
        setMessage(text);
      }
    }
  };

  return (
    <main className="container space-y-8 py-10">
      <header className="max-w-3xl space-y-3">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Adquisición oficial
        </p>
        <h1 className="font-black text-4xl tracking-tight">Tienda oficial</h1>
        <p className="text-muted-foreground">
          Compra de uno a diez Packs con Eteris. Cada oferta muestra su precio,
          disponibilidad, binding y la revisión publicada que se usará en tu
          próxima adquisición; no mostramos probabilidades numéricas.
        </p>
      </header>

      {offersQuery.isLoading ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          Cargando ofertas…
        </p>
      ) : offersQuery.error ? (
        <section
          className="rounded-2xl border border-destructive/40 bg-destructive/5 p-8 text-center text-destructive"
          aria-live="polite"
        >
          <p>No pudimos cargar la tienda. Intenta nuevamente.</p>
          <Button
            className="mt-4"
            onClick={() => offersQuery.refetch()}
            variant="outline"
          >
            Reintentar
          </Button>
        </section>
      ) : offers.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          No hay ofertas disponibles en este momento. Vuelve pronto.
        </p>
      ) : (
        <ul className="grid gap-5 lg:grid-cols-2">
          {offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              onPurchase={() => openConfirmation(offer)}
            />
          ))}
        </ul>
      )}

      {receipt ? <PurchaseReceipt receipt={receipt} /> : null}

      {selectedOffer ? (
        <section
          aria-labelledby="shop-confirmation-title"
          className="rounded-3xl border border-primary/40 bg-primary/5 p-6"
        >
          <h2 id="shop-confirmation-title" className="font-bold text-xl">
            Confirma tu compra
          </h2>
          <p className="mt-2 text-muted-foreground text-sm">
            {selectedOffer.name}: se descontarán exactamente{" "}
            {totalPrice(selectedOffer, quantity)} Eteris y recibirás {quantity}{" "}
            Pack{quantity === 1 ? "" : "s"}. La revisión publicada actual es la{" "}
            {selectedOffer.latestRevision.revision}.
          </p>
          <label
            className="mt-4 grid max-w-xs gap-2 font-medium text-sm"
            htmlFor="shop-quantity"
          >
            Cantidad (1–10)
            <select
              className="h-10 rounded-md border bg-background px-3"
              id="shop-quantity"
              onChange={(event) => setQuantity(Number(event.target.value))}
              value={quantity}
            >
              {Array.from(
                { length: maximumQuantity(selectedOffer) },
                (_, index) => index + 1
              ).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          {selectedOffer.perAccountLimit === null ? null : (
            <p className="mt-3 text-muted-foreground text-xs">
              Límite publicado por cuenta: {selectedOffer.perAccountLimit}{" "}
              Packs. El servidor volverá a verificarlo antes de cobrar.
            </p>
          )}
          {staleConsent || message ? (
            <p
              className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 text-sm dark:text-amber-200"
              aria-live="polite"
            >
              {message}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              disabled={purchaseMutation.isPending}
              onClick={confirmPurchase}
            >
              {purchaseMutation.isPending
                ? "Procesando…"
                : staleConsent
                  ? "Aceptar precio actualizado"
                  : "Confirmar compra"}
            </Button>
            <Button
              disabled={purchaseMutation.isPending}
              onClick={() => {
                setSelectedOffer(null);
                setMessage(null);
              }}
              variant="outline"
            >
              Cancelar
            </Button>
            {message && !staleConsent ? (
              <Button
                disabled={purchaseMutation.isPending}
                onClick={confirmPurchase}
                variant="ghost"
              >
                Reintentar
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      <p className="text-muted-foreground text-xs">
        El cobro, el cupo y la emisión se confirman juntos. Si una garantía o
        suministro no puede cumplirse, la compra completa se revierte.
      </p>
    </main>
  );
}

function OfferCard({
  offer,
  onPurchase,
}: {
  offer: Offer;
  onPurchase: () => void;
}) {
  const stock =
    offer.remainingSales === null
      ? "Stock ilimitado"
      : `${offer.remainingSales} Packs restantes`;
  return (
    <li className="space-y-4 rounded-3xl border bg-card/70 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-2xl">{offer.name}</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {offer.description || "Pack coleccionable oficial."}
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 font-bold text-primary">
          {offer.price} Eteris
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Info label="Disponibilidad" value={availabilityLabel(offer)} />
        <Info label="Stock" value={stock} />
        <Info label="Binding" value={bindingLabel(offer.binding)} />
        <Info
          label="Revisión futura"
          value={`v${offer.latestRevision.revision}`}
        />
        <Info label="Cartas por Pack" value={`${offer.cardCount}`} />
        <Info label="Versión de oferta" value={`v${offer.version}`} />
      </dl>
      <div>
        <h3 className="font-semibold text-sm">Pool público</h3>
        <p className="mt-1 text-muted-foreground text-sm">
          {offer.possiblePool.length === 0
            ? "Contenido en preparación."
            : offer.possiblePool
                .map(({ characterName }) => characterName)
                .join(", ")}
        </p>
        {offer.unavailableCards.length ? (
          <p className="mt-2 text-muted-foreground text-xs">
            {offer.unavailableCards.length} carta
            {offer.unavailableCards.length === 1
              ? " no disponible"
              : "s no disponibles"}{" "}
            se conserva{offer.unavailableCards.length === 1 ? "" : "n"} como
            referencia histórica.
          </p>
        ) : null}
      </div>
      <p className="rounded-xl bg-muted/50 p-3 text-muted-foreground text-xs">
        Garantías publicadas: {offer.guarantees.length ? "sí" : "ninguna"}. Las
        probabilidades exactas no se muestran.
      </p>
      <Button className="w-full" onClick={onPurchase}>
        Comprar Pack{offer.remainingSales === 1 ? "" : "s"}
      </Button>
    </li>
  );
}

function PurchaseReceipt({ receipt }: { receipt: PurchaseReceipt }) {
  return (
    <section
      className="rounded-3xl border border-emerald-500/40 bg-emerald-500/5 p-6"
      aria-live="polite"
    >
      <h2 className="font-bold text-xl">Compra confirmada</h2>
      <p className="mt-2 text-muted-foreground text-sm">
        Recibiste {receipt.quantity} Pack{receipt.quantity === 1 ? "" : "s"} por{" "}
        {receipt.totalPrice} Eteris.
      </p>
      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <Info label="Recibo" value={receipt.purchaseId} />
        <Info label="Transacción Eteris" value={receipt.transactionId} />
      </dl>
      <p className="mt-4 text-muted-foreground text-xs">
        Los Packs ya están en tu inventario. IDs emitidos:{" "}
        {receipt.packInstanceIds.join(", ")}.
      </p>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function maximumQuantity(offer: Offer) {
  return Math.max(1, Math.min(10, offer.remainingSales ?? 10));
}

function totalPrice(offer: Offer, quantity: number) {
  return (BigInt(offer.price) * BigInt(quantity)).toString();
}

function bindingLabel(binding: Offer["binding"]) {
  return collectibleBindingLabel(binding);
}

function availabilityLabel(offer: Offer) {
  const starts = offer.startsAt
    ? formatCollectibleDateTime(offer.startsAt)
    : "Ahora";
  const ends = offer.endsAt
    ? formatCollectibleDateTime(offer.endsAt)
    : "Sin fecha final";
  return `${starts} · ${ends}`;
}
