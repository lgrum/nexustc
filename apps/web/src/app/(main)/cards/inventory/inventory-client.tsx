"use client";

import {
  collectibleBindingLabel,
  collectibleRarityLabel,
} from "@repo/shared/collectibles";
import type { CollectibleRarity } from "@repo/shared/collectibles";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { orpc } from "@/lib/orpc";

const PAGE_SIZE = 20;

type InventorySort = "newest" | "rarity" | "game" | "mint";
type TransferabilityFilter = "transferable" | "account-bound" | "";

export default function InventoryClient() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<InventorySort>("newest");
  const [rarity, setRarity] = useState<CollectibleRarity | "">("");
  const [transferability, setTransferability] =
    useState<TransferabilityFilter>("");
  const [limited, setLimited] = useState(false);

  const trimmedSearch = search.trim();
  const cardInput = useMemo(
    () => ({
      limit: PAGE_SIZE,
      ...(trimmedSearch ? { search: trimmedSearch } : {}),
      ...(rarity ? { rarity } : {}),
      ...(transferability ? { transferability } : {}),
      ...(limited ? { limited: true } : {}),
      sort,
    }),
    [limited, rarity, sort, transferability, trimmedSearch]
  );
  const packInput = useMemo(
    () => ({
      limit: PAGE_SIZE,
      ...(trimmedSearch ? { search: trimmedSearch } : {}),
      ...(transferability ? { transferability } : {}),
      sort: "newest" as const,
    }),
    [transferability, trimmedSearch]
  );
  const cards = useInfiniteQuery(
    orpc.cards.inventory.infiniteOptions({
      // Wrapped input + pageParam threading: an unwrapped input would drop the
      // filters from the RPC call and a fixed input would never advance.
      input: (pageParam: string | undefined) => ({
        ...cardInput,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: undefined as string | undefined,
    })
  );
  const packs = useInfiniteQuery(
    orpc.packs.inventory.infiniteOptions({
      input: (pageParam: string | undefined) => ({
        ...packInput,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      initialPageParam: undefined as string | undefined,
    })
  );
  const cardItems = cards.data?.pages.flatMap((page) => page.items) ?? [];
  const packItems = packs.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <main className="container space-y-10 py-10">
      <header className="space-y-3">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Colección privada
        </p>
        <h1 className="font-black text-4xl tracking-tight">Mi inventario</h1>
        <p className="max-w-2xl text-muted-foreground">
          Tus cartas y Packs aparecen aquí mientras sigan bajo tu propiedad. Los
          resultados dentro de un Pack cerrado permanecen ocultos hasta abrirlo.
        </p>
      </header>

      <section
        aria-label="Filtros del inventario"
        className="grid gap-3 rounded-2xl border bg-card/60 p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label
          className="flex-1 space-y-1 font-medium text-sm"
          htmlFor="inventory-search"
        >
          Buscar
          <Input
            id="inventory-search"
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="Personaje, juego, Serie o edición"
            value={search}
          />
        </label>
        <label className="space-y-1 font-medium text-sm">
          Rareza
          <select
            aria-label="Filtrar por rareza"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            onChange={(event) => {
              setRarity(event.target.value as CollectibleRarity | "");
            }}
            value={rarity}
          >
            <option value="">Todas</option>
            <option value="common">Común</option>
            <option value="uncommon">Poco común</option>
            <option value="rare">Raro</option>
            <option value="epic">Épico</option>
            <option value="legendary">Legendario</option>
          </select>
        </label>
        <label className="space-y-1 font-medium text-sm">
          Transferencia
          <select
            aria-label="Filtrar por transferencia"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            onChange={(event) => {
              setTransferability(event.target.value as TransferabilityFilter);
            }}
            value={transferability}
          >
            <option value="">Todas</option>
            <option value="transferable">Transferibles</option>
            <option value="account-bound">Vinculadas a la cuenta</option>
          </select>
        </label>
        <label className="space-y-3 font-medium text-sm">
          Edición limitada
          <span className="flex h-10 items-center gap-2">
            <input
              checked={limited}
              id="inventory-limited"
              onChange={(event) => {
                setLimited(event.target.checked);
              }}
              type="checkbox"
            />
            <span className="text-muted-foreground">Solo limitadas</span>
          </span>
        </label>
        <label className="space-y-1 font-medium text-sm">
          Ordenar cartas
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            onChange={(event) => {
              setSort(event.target.value as InventorySort);
            }}
            value={sort}
          >
            <option value="newest">Más recientes</option>
            <option value="rarity">Rareza</option>
            <option value="game">Juego</option>
            <option value="mint">Número de Mint</option>
          </select>
        </label>
      </section>

      <InventorySection
        error={cards.error}
        isLoading={cards.isLoading}
        title="Cartas"
      >
        {cardItems.length ? (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cardItems.map((card) => (
                <li
                  className="space-y-3 rounded-3xl border bg-card/70 p-4"
                  key={card.id}
                >
                  <div className="flex aspect-[4/5] items-end rounded-2xl bg-gradient-to-br from-primary/25 via-card to-muted p-4">
                    <span className="rounded-full border bg-background/80 px-2 py-1 font-semibold text-xs">
                      {card.mintDisplay}
                      {card.limited ? " · Limitada" : ""}
                    </span>
                  </div>
                  <div>
                    <h2 className="font-bold">{card.characterName}</h2>
                    <p className="text-muted-foreground text-sm">
                      {card.gameName} · {card.seriesName}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {collectibleRarityLabel(card.rarity)}
                      {card.edition ? ` · ${card.edition}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {cards.hasNextPage ? (
              <Button
                disabled={cards.isFetchingNextPage}
                onClick={() => cards.fetchNextPage()}
                variant="outline"
              >
                {cards.isFetchingNextPage ? "Cargando…" : "Ver más cartas"}
              </Button>
            ) : null}
          </>
        ) : null}
      </InventorySection>

      <InventorySection
        error={packs.error}
        isLoading={packs.isLoading}
        title="Packs sin abrir"
      >
        {packItems.length ? (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {packItems.map((pack) => (
                <li
                  className="rounded-3xl border bg-card/70 transition-colors hover:border-primary/60 focus-within:border-primary/60"
                  key={pack.id}
                >
                  <Link
                    className="block space-y-3 rounded-3xl p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    href={`/cards/packs/${pack.id}/open`}
                  >
                    <div className="flex aspect-video items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/30 via-card to-primary/20 font-black text-2xl">
                      Pack
                    </div>
                    <div>
                      <h2 className="font-bold">{pack.templateName}</h2>
                      <p className="text-muted-foreground text-sm">
                        Revisión {pack.revision ?? "histórica"} ·{" "}
                        {collectibleBindingLabel(pack.binding)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        Resultado reservado hasta abrir el Pack.
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {packs.hasNextPage ? (
              <Button
                disabled={packs.isFetchingNextPage}
                onClick={() => packs.fetchNextPage()}
                variant="outline"
              >
                {packs.isFetchingNextPage ? "Cargando…" : "Ver más Packs"}
              </Button>
            ) : null}
          </>
        ) : null}
      </InventorySection>
    </main>
  );
}

function InventorySection({
  children,
  error,
  isLoading,
  title,
}: {
  children: React.ReactNode;
  error: Error | null;
  isLoading: boolean;
  title: string;
}) {
  return (
    <section aria-live="polite" className="space-y-4">
      <h2 className="font-bold text-2xl">{title}</h2>
      {isLoading ? (
        <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
          Cargando {title.toLocaleLowerCase()}…
        </p>
      ) : error ? (
        <p className="rounded-2xl border border-destructive/40 bg-destructive/5 p-8 text-center text-destructive">
          No pudimos cargar {title.toLocaleLowerCase()}. Intenta nuevamente.
        </p>
      ) : (
        children || (
          <p className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
            Todavía no tienes {title.toLocaleLowerCase()}.
          </p>
        )
      )}
    </section>
  );
}
