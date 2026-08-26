"use client";

import {
  PackageIcon,
  Search01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
  PublicCardInstance,
  PublicPackInstance,
} from "@repo/shared/collectibles";
import {
  collectibleBindingLabel,
  collectibleRarityLabel,
} from "@repo/shared/collectibles";
import { useInfiniteQuery } from "@tanstack/react-query";
import Image from "next/image";
import { useMemo, useState } from "react";

import {
  ProfileCollectionState,
  ProfileLoadMore,
  ProfileSectionHeader,
} from "@/components/profile/profile-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCollectibleDate } from "@/lib/format-date";
import { orpcClient } from "@/lib/orpc";
import { cn, getBucketUrl } from "@/lib/utils";

type CardPage = Awaited<
  ReturnType<(typeof orpcClient.cards)["publicCollection"]>
>;
type PackPage = Awaited<
  ReturnType<(typeof orpcClient.packs)["publicCollection"]>
>;
type CardItem = PublicCardInstance;
type PackItem = PublicPackInstance;

const PAGE_SIZE = 24;

export function PublicCollectionSection({
  initialCards,
  initialPacks,
  userId,
}: {
  initialCards: CardPage | null;
  initialPacks: PackPage | null;
  userId: string;
}) {
  if (!initialCards && !initialPacks) {
    return (
      <section aria-label="Colección pública">
        <ProfileCollectionState
          description="No pudimos cargar la colección en este momento."
          kind="error"
          title="Colección no disponible"
        />
      </section>
    );
  }
  if (!(initialCards?.visible || initialPacks?.visible)) {
    return (
      <section aria-label="Colección pública">
        <PrivateCollectionNotice />
      </section>
    );
  }

  return (
    <VisibleCollection
      initialCards={initialCards}
      initialPacks={initialPacks}
      userId={userId}
    />
  );
}

function VisibleCollection({
  initialCards,
  initialPacks,
  userId,
}: {
  initialCards: CardPage | null;
  initialPacks: PackPage | null;
  userId: string;
}) {
  const [kind, setKind] = useState<"cards" | "packs">("cards");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "rarity" | "mint" | "template">(
    "newest"
  );
  const [appliedSearch, setAppliedSearch] = useState("");
  const cardQuery = useInfiniteQuery({
    getNextPageParam: (lastPage: CardPage) => lastPage.nextCursor ?? undefined,
    initialData:
      appliedSearch === "" && sort === "newest" && initialCards
        ? { pageParams: [undefined], pages: [initialCards] }
        : undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      orpcClient.cards.publicCollection({
        limit: PAGE_SIZE,
        ...(appliedSearch ? { search: appliedSearch } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
        sort: sort === "template" ? "newest" : sort,
        userId,
      }),
    queryKey: ["public-collection", "cards", userId, appliedSearch, sort],
  });
  const packQuery = useInfiniteQuery({
    getNextPageParam: (lastPage: PackPage) => lastPage.nextCursor ?? undefined,
    initialData:
      appliedSearch === "" && sort === "newest" && initialPacks
        ? { pageParams: [undefined], pages: [initialPacks] }
        : undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      orpcClient.packs.publicCollection({
        limit: PAGE_SIZE,
        ...(appliedSearch ? { search: appliedSearch } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
        sort: sort === "rarity" || sort === "mint" ? "newest" : sort,
        userId,
      }),
    queryKey: ["public-collection", "packs", userId, appliedSearch, sort],
  });
  const query = kind === "cards" ? cardQuery : packQuery;
  const accessRevoked =
    query.data?.pages.some((page) => !page.visible) ?? false;
  const sortLabel =
    sort === "newest"
      ? "Más recientes"
      : sort === "rarity"
        ? "Rareza"
        : sort === "mint"
          ? "Número de Mint"
          : "Pack";
  const cardItems = useMemo(
    () =>
      cardQuery.data?.pages.flatMap((page) =>
        (page.items as readonly unknown[]).filter(
          (item): item is CardItem =>
            typeof item === "object" && item !== null && "template" in item
        )
      ) ?? [],
    [cardQuery.data?.pages]
  );
  const packItems = useMemo(
    () =>
      packQuery.data?.pages.flatMap((page) =>
        (page.items as readonly unknown[]).filter(
          (item): item is PackItem =>
            typeof item === "object" && item !== null && !("template" in item)
        )
      ) ?? [],
    [packQuery.data?.pages]
  );
  const itemCount = kind === "cards" ? cardItems.length : packItems.length;

  return (
    <section
      aria-labelledby="public-collection-title"
      className="rounded-[1.5rem] border border-border/70 bg-card/65 p-5 sm:p-6"
    >
      <ProfileSectionHeader
        description="Una vista acotada de los objetos que esta persona decidió compartir."
        icon={SparklesIcon}
        title="Colección pública"
        titleId="public-collection-title"
      />
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label
          className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm"
          htmlFor="public-collection-search"
        >
          <span className="font-medium">Buscar</span>
          <span className="relative">
            <HugeiconsIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              icon={Search01Icon}
            />
            <Input
              aria-label="Buscar en la colección pública"
              className="pl-9"
              id="public-collection-search"
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setAppliedSearch(search.trim());
                }
              }}
              placeholder="Personaje, juego o Series"
              value={search}
            />
          </span>
        </label>
        <label
          className="flex w-full flex-col gap-1.5 text-sm sm:w-48"
          htmlFor="public-collection-sort"
        >
          <span className="font-medium">Ordenar</span>
          <Select
            onValueChange={(value) =>
              setSort(value as "newest" | "rarity" | "mint" | "template")
            }
            value={sort}
          >
            <SelectTrigger
              aria-label="Ordenar colección pública"
              id="public-collection-sort"
            >
              <SelectValue>{sortLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Más recientes</SelectItem>
              <SelectItem value="rarity">Rareza</SelectItem>
              <SelectItem value="mint">Número de Mint</SelectItem>
              {kind === "packs" ? (
                <SelectItem value="template">Pack</SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </label>
        <Button
          className="min-h-10"
          onClick={() => setAppliedSearch(search.trim())}
          variant="outline"
        >
          Aplicar filtros
        </Button>
      </div>
      <div className="mt-5 flex gap-2 overflow-x-auto border-border/60 border-b pb-2">
        <Button
          aria-pressed={kind === "cards"}
          onClick={() => setKind("cards")}
          variant={kind === "cards" ? "secondary" : "ghost"}
        >
          <HugeiconsIcon aria-hidden icon={SparklesIcon} />
          Cartas
        </Button>
        <Button
          aria-pressed={kind === "packs"}
          onClick={() => setKind("packs")}
          variant={kind === "packs" ? "secondary" : "ghost"}
        >
          <HugeiconsIcon aria-hidden icon={PackageIcon} />
          Packs sin abrir
        </Button>
      </div>
      <div aria-live="polite" className="mt-5">
        {accessRevoked ? (
          <PrivateCollectionNotice />
        ) : query.isPending ? (
          <ProfileCollectionState
            description="Estamos preparando los objetos compartidos."
            kind="loading"
            title="Cargando colección"
          />
        ) : query.isError ? (
          <ProfileCollectionState
            description="No pudimos cargar esta página de la colección."
            kind="error"
            onAction={() => query.refetch()}
            title="Algo salió mal"
          />
        ) : itemCount === 0 ? (
          <ProfileCollectionState
            description="No hay objetos que coincidan con estos filtros."
            kind="empty"
            title="Colección vacía"
          />
        ) : kind === "cards" ? (
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-3">
            {cardItems.map((item) => {
              const thumbnail = item.template.renderedVariants.find(
                (variant) => variant.variant === "thumbnail"
              );
              return (
                <article
                  className="flex min-w-0 gap-3 rounded-2xl border border-border/70 bg-background/35 p-3"
                  key={item.id}
                >
                  {thumbnail ? (
                    <Image
                      alt=""
                      className="size-20 shrink-0 rounded-xl object-cover"
                      height={80}
                      src={getBucketUrl(thumbnail.objectKey)}
                      width={56}
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="size-20 shrink-0 rounded-xl bg-primary/10"
                    />
                  )}
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">
                      {item.characterName}
                    </h3>
                    <p className="truncate text-muted-foreground text-sm">
                      {item.gameName} · {item.seriesName}
                    </p>
                    <p className="mt-1 text-sm">
                      {collectibleRarityLabel(item.template.rarity)} ·{" "}
                      {item.mintDisplay}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {collectibleBindingLabel(item.binding)}
                    </p>
                    {item.forSale ? (
                      item.listingUrl ? (
                        <a
                          className="mt-1 inline-block font-medium text-emerald-500 text-xs underline-offset-2 hover:underline"
                          href={item.listingUrl}
                        >
                          En venta{item.listingIsBundle ? " · Lote" : ""}
                        </a>
                      ) : (
                        <span className="mt-1 inline-block font-medium text-emerald-500 text-xs">
                          En venta
                        </span>
                      )
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-3">
            {packItems.map((item, index) => (
              <article
                className={cn(
                  "rounded-2xl border border-border/70 bg-background/35 p-4",
                  item.availability === "frozen" && "opacity-75"
                )}
                key={`${item.templateId}:${new Date(item.issuedAt).toISOString()}:${index}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{item.templateName}</h3>
                    <p className="mt-1 text-muted-foreground text-sm">
                      Revisión {item.revision}
                    </p>
                  </div>
                  <HugeiconsIcon
                    aria-hidden
                    className="size-5 text-primary"
                    icon={PackageIcon}
                  />
                </div>
                <p className="mt-3 text-muted-foreground text-xs">
                  Emitido el {formatCollectibleDate(item.issuedAt)}
                </p>
                {item.forSale ? (
                  item.listingUrl ? (
                    <a
                      className="mt-2 inline-block font-medium text-emerald-500 text-xs underline-offset-2 hover:underline"
                      href={item.listingUrl}
                    >
                      En venta{item.listingIsBundle ? " · Lote" : ""}
                    </a>
                  ) : (
                    <span className="mt-2 inline-block font-medium text-emerald-500 text-xs">
                      En venta
                    </span>
                  )
                ) : null}
              </article>
            ))}
          </div>
        )}
        {query.hasNextPage ? (
          <div className="mt-5">
            <ProfileLoadMore
              isLoading={query.isFetchingNextPage}
              onClick={() => query.fetchNextPage()}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PrivateCollectionNotice() {
  return (
    <div
      aria-labelledby="public-collection-private-title"
      className="rounded-[1.5rem] border border-border/70 bg-card/65 p-5 sm:p-6"
    >
      <ProfileSectionHeader
        icon={SparklesIcon}
        title="Colección privada"
        titleId="public-collection-private-title"
      />
      <p className="mt-3 text-muted-foreground text-sm">
        Esta persona decidió mantener su colección fuera de su perfil público.
      </p>
    </div>
  );
}
