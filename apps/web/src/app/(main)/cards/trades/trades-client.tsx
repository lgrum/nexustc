"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRef, useState } from "react";
import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";

type AssetKind = "card" | "pack";
type DraftAsset = { assetId: string; kind: AssetKind };

function createTradeIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

const blankAsset = (): DraftAsset => ({ assetId: "", kind: "card" });

export default function TradesClient() {
  const [recipientUserId, setRecipientUserId] = useState("");
  const [proposerAssets, setProposerAssets] = useState<DraftAsset[]>([
    blankAsset(),
  ]);
  const [recipientAssets, setRecipientAssets] = useState<DraftAsset[]>([
    blankAsset(),
  ]);
  const [message, setMessage] = useState<string | null>(null);
  const sendKey = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const eligible = useQuery(orpc.trades.eligible.queryOptions());
  const inbox = useQuery(
    orpc.trades.inbox.queryOptions({ input: { limit: 8, state: "sent" } })
  );
  const sent = useQuery(
    orpc.trades.sent.queryOptions({ input: { limit: 8, state: "sent" } })
  );
  const send = useMutation(
    orpc.trades.send.mutationOptions({
      onError: (error) => setMessage(error.message),
      onSuccess: async (result) => {
        setMessage(
          result.replayed
            ? "La oferta ya estaba enviada; recuperamos el resultado."
            : "Oferta enviada. Todos tus activos quedaron en custodia privada."
        );
        await queryClient.invalidateQueries({ queryKey: ["trades"] });
      },
    })
  );
  const eligibleKeys = new Set(
    (eligible.data ?? []).map((asset) => `${asset.kind}:${asset.assetId}`)
  );

  function updateAsset(
    side: "proposer" | "recipient",
    index: number,
    patch: Partial<DraftAsset>
  ) {
    const update = (assets: DraftAsset[]) =>
      assets.map((asset, assetIndex) =>
        assetIndex === index ? { ...asset, ...patch } : asset
      );
    if (side === "proposer") {
      setProposerAssets(update);
    } else {
      setRecipientAssets(update);
    }
  }

  function addAsset(side: "proposer" | "recipient") {
    const update = (assets: DraftAsset[]) =>
      assets.length >= 50 ? assets : [...assets, blankAsset()];
    if (side === "proposer") {
      setProposerAssets(update);
    } else {
      setRecipientAssets(update);
    }
  }

  function removeAsset(side: "proposer" | "recipient", index: number) {
    const update = (assets: DraftAsset[]) =>
      assets.length <= 1
        ? assets
        : assets.filter((_, assetIndex) => assetIndex !== index);
    if (side === "proposer") {
      setProposerAssets(update);
    } else {
      setRecipientAssets(update);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const proposer = proposerAssets.map((asset) => ({
      assetId: asset.assetId.trim(),
      kind: asset.kind,
    }));
    const recipient = recipientAssets.map((asset) => ({
      assetId: asset.assetId.trim(),
      kind: asset.kind,
    }));
    const allIds = [...proposer, ...recipient].map((asset) => asset.assetId);
    if (!recipientUserId.trim() || allIds.some((assetId) => !assetId)) {
      setMessage("Completa la cuenta destinataria y todos los IDs exactos.");
      return;
    }
    if (proposer.length > 50 || recipient.length > 50) {
      setMessage("Cada lado puede incluir como máximo 50 activos.");
      return;
    }
    if (new Set(allIds).size !== allIds.length) {
      setMessage("No puedes repetir un activo dentro de la oferta.");
      return;
    }
    if (
      proposer.some(
        (asset) => !eligibleKeys.has(`${asset.kind}:${asset.assetId}`)
      )
    ) {
      setMessage("Una carta o Pack proponente ya no está disponible.");
      return;
    }
    sendKey.current ??= createTradeIdempotencyKey("trade-send");
    send.mutate({
      idempotencyKey: sendKey.current,
      proposerAssets: proposer,
      recipientAssets: recipient,
      recipientUserId: recipientUserId.trim(),
    });
  }

  return (
    <main className="container space-y-10 py-10">
      <header className="max-w-3xl space-y-3">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Intercambios privados
        </p>
        <h1 className="font-black text-4xl tracking-tight">
          Ofertas de 1 a 50 activos por lado
        </h1>
        <p className="text-muted-foreground">
          El borrador no reserva nada. Al enviar, los términos quedan fijados
          durante siete días y la persona destinataria decide si acepta.
        </p>
        <nav
          className="flex flex-wrap gap-2"
          aria-label="Secciones de intercambios"
        >
          <Link
            className="rounded-full border px-4 py-2 font-semibold text-sm"
            href="/cards/trades/inbox"
          >
            Bandeja de entrada
          </Link>
          <Link
            className="rounded-full border px-4 py-2 font-semibold text-sm"
            href="/cards/trades/sent"
          >
            Enviadas
          </Link>
        </nav>
      </header>

      <form
        className="grid gap-5 rounded-3xl border bg-card/70 p-6 lg:grid-cols-2"
        onSubmit={submit}
      >
        <div className="space-y-4 lg:col-span-2">
          <h2 className="font-bold text-2xl">Componer oferta</h2>
          <p className="text-muted-foreground text-sm">
            Selecciona entre 1 y 50 Cartas o Packs sin abrir por cada lado. Se
            rechazan duplicados, activos no transferibles y activos dentro de
            otro Pack.
          </p>
        </div>
        <label
          className="space-y-1 font-medium text-sm lg:col-span-2"
          htmlFor="trade-recipient-user-id"
        >
          ID de la cuenta destinataria
          <Input
            autoComplete="off"
            id="trade-recipient-user-id"
            onChange={(event) => setRecipientUserId(event.target.value)}
            placeholder="user_…"
            required
            value={recipientUserId}
          />
        </label>
        <AssetEditor
          assets={proposerAssets}
          label="Lo que ofreces"
          onAdd={() => addAsset("proposer")}
          onChange={(index, patch) => updateAsset("proposer", index, patch)}
          onRemove={(index) => removeAsset("proposer", index)}
        />
        <AssetEditor
          assets={recipientAssets}
          label="Lo que solicitas"
          onAdd={() => addAsset("recipient")}
          onChange={(index, patch) => updateAsset("recipient", index, patch)}
          onRemove={(index) => removeAsset("recipient", index)}
        />
        <div className="space-y-3 lg:col-span-2">
          {message ? (
            <p
              aria-live="polite"
              className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm"
            >
              {message}
            </p>
          ) : null}
          <Button
            disabled={send.isPending}
            loading={send.isPending}
            type="submit"
          >
            Enviar oferta inmutable
          </Button>
          {send.isError ? (
            <p className="text-muted-foreground text-xs">
              Puedes corregir el problema y reintentar: conservaremos la misma
              clave para evitar una oferta duplicada.
            </p>
          ) : null}
        </div>
      </form>

      <section
        className="grid gap-6 lg:grid-cols-2"
        aria-label="Ofertas pendientes"
      >
        <OfferList
          error={inbox.error}
          items={inbox.data?.items ?? []}
          loading={inbox.isLoading}
          title="Recibidas"
        />
        <OfferList
          error={sent.error}
          items={sent.data?.items ?? []}
          loading={sent.isLoading}
          title="Enviadas"
        />
      </section>
    </main>
  );
}

function AssetEditor({
  assets,
  label,
  onAdd,
  onChange,
  onRemove,
}: {
  assets: DraftAsset[];
  label: string;
  onAdd: () => void;
  onChange: (index: number, patch: Partial<DraftAsset>) => void;
  onRemove: (index: number) => void;
}) {
  const side = label === "Lo que ofreces" ? "proposer" : "recipient";
  return (
    <fieldset className="space-y-3 rounded-2xl border p-4">
      <legend className="px-1 font-bold">{label}</legend>
      <p className="text-muted-foreground text-sm">
        {assets.length}/50 activos seleccionados
      </p>
      <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
        {assets.map((asset, index) => {
          const id = `trade-${side}-asset-${index}`;
          return (
            <div className="rounded-xl border p-3" key={`${side}-${index}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-sm">
                  Activo {index + 1}
                </span>
                <Button
                  aria-label={`Quitar activo ${index + 1} de ${label}`}
                  disabled={assets.length <= 1}
                  onClick={() => onRemove(index)}
                  type="button"
                  variant="ghost"
                >
                  Quitar
                </Button>
              </div>
              <label className="mt-2 block space-y-1 font-medium text-sm">
                Tipo exacto
                <select
                  className="h-10 w-full rounded-lg border border-input bg-background px-3"
                  onChange={(event) =>
                    onChange(index, { kind: event.target.value as AssetKind })
                  }
                  value={asset.kind}
                >
                  <option value="card">Carta</option>
                  <option value="pack">Pack sin abrir</option>
                </select>
              </label>
              <label
                className="mt-2 block space-y-1 font-medium text-sm"
                htmlFor={id}
              >
                ID del activo
                <Input
                  autoComplete="off"
                  id={id}
                  onChange={(event) =>
                    onChange(index, { assetId: event.target.value })
                  }
                  placeholder="ID exacto del inventario"
                  required
                  value={asset.assetId}
                />
              </label>
            </div>
          );
        })}
      </div>
      <Button
        disabled={assets.length >= 50}
        onClick={onAdd}
        type="button"
        variant="outline"
      >
        Añadir activo
      </Button>
    </fieldset>
  );
}

function OfferList({
  error,
  items,
  loading,
  title,
}: {
  error: Error | null;
  items: {
    assetCount?: number;
    expiresAt: Date;
    id: string;
    proposerAssetCount?: number;
    recipientAssetCount?: number;
    state: string;
    version: number;
  }[];
  loading: boolean;
  title: string;
}) {
  return (
    <section className="space-y-3" aria-live="polite">
      <h2 className="font-bold text-2xl">{title}</h2>
      {loading ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">
          Cargando ofertas…
        </p>
      ) : error ? (
        <p className="rounded-2xl border border-destructive/40 p-6 text-destructive">
          No pudimos cargar las ofertas. Intenta nuevamente.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-muted-foreground">
          No hay ofertas pendientes.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li className="rounded-2xl border bg-card/60 p-4" key={item.id}>
              <Link
                className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/cards/trades/${item.id}`}
              >
                <span className="font-semibold">Oferta {item.id}</span>
                <span className="block text-muted-foreground text-sm">
                  {item.proposerAssetCount ?? item.assetCount ?? 1} +{" "}
                  {item.recipientAssetCount ?? item.assetCount ?? 1} activos ·
                  Estado: {item.state}
                </span>
                <span className="block text-muted-foreground text-sm">
                  Vence {new Date(item.expiresAt).toLocaleDateString("es-AR")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
