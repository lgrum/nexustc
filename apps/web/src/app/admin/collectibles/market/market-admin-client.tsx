"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";

export default function MarketAdminClient() {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const listingsQuery = orpc.blackMarket.search.queryOptions({
    input: { limit: 50, sort: "newest" },
  });
  const listings = useQuery(listingsQuery);
  const cancel = useMutation(
    orpc.blackMarket.adminCancel.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async () => {
        setMessage(
          "Publicación cancelada; la decisión y cualquier reversión conforme quedaron auditadas."
        );
        await queryClient.invalidateQueries({
          queryKey: listingsQuery.queryKey,
        });
      },
    })
  );

  return (
    <main className="grid gap-6">
      <header>
        <h1 className="font-bold text-2xl">Moderación del Mercado Negro</h1>
        <p className="text-muted-foreground text-sm">
          Revisa publicaciones activas sin ver identidades, billeteras ni texto
          privado. Una cancelación conforme puede revertir la tarifa una vez;
          una infracción de política nunca la revierte automáticamente.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Motivo obligatorio</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            aria-label="Motivo de cancelación"
            minLength={3}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explica la decisión de moderación"
            value={reason}
          />
        </CardContent>
      </Card>
      {listings.isError ? (
        <p className="text-destructive" role="alert">
          No se pudieron cargar las publicaciones.
        </p>
      ) : null}
      <div className="grid gap-4">
        {listings.data?.items.map((listing) => (
          <Card key={listing.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">
                  {listing.isBundle ? "Lote" : "Activo único"} ·{" "}
                  {listing.askingPrice} Eteris
                </p>
                <p className="text-muted-foreground text-sm">
                  {listing.id} · {listing.assetCount} activo
                  {listing.assetCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={reason.trim().length < 3 || cancel.isPending}
                  loading={cancel.isPending}
                  onClick={() =>
                    cancel.mutate({
                      compliant: true,
                      expectedVersion: listing.version,
                      idempotencyKey: `black-market-admin-${listing.id}-${reason.trim()}`,
                      listingId: listing.id,
                      reason: reason.trim(),
                    })
                  }
                  type="button"
                >
                  Cancelar conforme
                </Button>
                <Button
                  disabled={reason.trim().length < 3 || cancel.isPending}
                  onClick={() =>
                    cancel.mutate({
                      expectedVersion: listing.version,
                      idempotencyKey: `black-market-policy-${listing.id}-${reason.trim()}`,
                      listingId: listing.id,
                      policyViolation: true,
                      reason: reason.trim(),
                    })
                  }
                  type="button"
                  variant="destructive"
                >
                  Cancelar por política
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!listings.isLoading && !listings.data?.items.length ? (
        <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
          No hay publicaciones activas para revisar.
        </p>
      ) : null}
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
