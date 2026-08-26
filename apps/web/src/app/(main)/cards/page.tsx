import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";

import { orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

export const metadata: Metadata = {
  description: "Explora las cartas coleccionables publicadas de NeXusTC.",
  title: "Cartas | NeXusTC",
};

async function getPublishedCards() {
  "use cache";
  cacheLife("hours");
  cacheTag("cards");
  return await orpcClient.cards.list(
    { limit: 60 },
    { context: { cache: true } }
  );
}

export default async function CardsPage() {
  // The catalog is cached once a request exists; avoid requiring the latest
  // collectible migration during a build that only produces the static shell.
  await connection();
  const cards = await getPublishedCards();

  return (
    <main className="container space-y-8 py-10">
      <header className="max-w-2xl space-y-3">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Catálogo oficial
        </p>
        <h1 className="font-black text-4xl tracking-tight">Cartas</h1>
        <p className="text-muted-foreground">
          Diseños publicados con arte administrado, rareza code-defined y
          variantes de presentación seguras.
        </p>
        <Link
          className="inline-flex rounded-full border px-4 py-2 font-semibold text-sm hover:border-primary/60"
          href="/cards/packs"
        >
          Explorar Packs
        </Link>
        <Link
          className="ml-2 inline-flex rounded-full border border-primary/40 px-4 py-2 font-semibold text-primary text-sm hover:border-primary"
          href="/cards/shop"
        >
          Tienda oficial
        </Link>
        <Link
          className="ml-2 inline-flex rounded-full border px-4 py-2 font-semibold text-sm hover:border-primary/60"
          href="/cards/gachapon"
        >
          Gachapon
        </Link>
        <Link
          className="ml-2 inline-flex rounded-full border px-4 py-2 font-semibold text-sm hover:border-primary/60"
          href="/cards/trades"
        >
          Intercambios
        </Link>
        <Link
          className="ml-2 inline-flex rounded-full border px-4 py-2 font-semibold text-sm hover:border-primary/60"
          href="/cards/gifts"
        >
          Regalos gratuitos
        </Link>
      </header>

      {cards.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          Todavía no hay cartas publicadas.
        </p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((card) => (
            <li key={card.id}>
              <Link
                className="group block overflow-hidden rounded-3xl border bg-card transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/cards/${card.id}`}
              >
                <CardArtwork card={card} />
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-bold leading-tight">
                        {card.characterName}
                      </h2>
                      <p className="text-muted-foreground text-sm">
                        {card.gameName}
                      </p>
                    </div>
                    <span className="rounded-full border px-2 py-1 font-semibold text-xs">
                      {rarityLabel(card.rarity)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {card.seriesName}
                    {card.edition ? ` · ${card.edition}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function CardArtwork({
  card,
}: {
  card: Awaited<ReturnType<typeof getPublishedCards>>[number];
}) {
  const variant = card.renderedVariants.find(
    ({ variant: key }) => key === "standard"
  );
  return variant ? (
    <Image
      alt={`${card.characterName}, ${rarityLabel(card.rarity)}`}
      className="aspect-[4/5.6] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      height={900}
      src={getBucketUrl(variant.objectKey)}
      width={640}
    />
  ) : (
    <div className="flex aspect-[4/5.6] items-center justify-center bg-muted p-6 text-center text-muted-foreground text-sm">
      Render pendiente
    </div>
  );
}

function rarityLabel(rarity: string) {
  return (
    {
      common: "Común",
      uncommon: "Poco común",
      rare: "Raro",
      epic: "Épico",
      legendary: "Legendario",
    }[rarity] ?? rarity
  );
}
