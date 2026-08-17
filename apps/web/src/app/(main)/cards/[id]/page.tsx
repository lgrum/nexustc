import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

async function getCard(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("cards", `card:${id}`);
  return await orpcClient.cards.get({ id }, { context: { cache: true } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const card = await getCard(id);
  return {
    description: card
      ? `${card.characterName} · ${card.gameName} · ${card.seriesName}`
      : "Carta coleccionable de NeXusTC.",
    title: card ? `${card.characterName} | Cartas` : "Carta | NeXusTC",
  };
}

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const card = await getCard(id);
  if (!card) {
    notFound();
  }

  const artwork = card.renderedVariants.find(
    ({ variant }) => variant === "standard"
  );
  return (
    <main className="container py-10">
      <Link
        className="text-muted-foreground text-sm hover:text-foreground"
        href="/cards"
      >
        ← Volver al catálogo
      </Link>
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(16rem,28rem)_minmax(0,1fr)] lg:items-start">
        <div className="overflow-hidden rounded-3xl border bg-card">
          {artwork ? (
            <Image
              alt={`${card.characterName}, ${rarityLabel(card.rarity)}`}
              className="h-auto w-full"
              height={900}
              priority
              src={getBucketUrl(artwork.objectKey)}
              width={640}
            />
          ) : (
            <div className="flex aspect-[4/5.6] items-center justify-center p-8 text-center text-muted-foreground">
              Render pendiente
            </div>
          )}
        </div>
        <article className="space-y-6">
          <header className="space-y-3">
            <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
              {card.seriesName}
            </p>
            <h1 className="font-black text-4xl tracking-tight">
              {card.characterName}
            </h1>
            <p className="text-muted-foreground">{card.gameName}</p>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full border px-3 py-1 font-semibold">
                {rarityLabel(card.rarity)}
              </span>
              {card.edition ? (
                <span className="rounded-full border px-3 py-1">
                  {card.edition}
                </span>
              ) : null}
              {card.lifetimeSupplyCeiling ? (
                <span className="rounded-full border px-3 py-1">
                  Edición limitada · /{card.lifetimeSupplyCeiling}
                </span>
              ) : null}
            </div>
          </header>
          {card.description ? (
            <p className="max-w-prose whitespace-pre-wrap text-muted-foreground leading-7">
              {card.description}
            </p>
          ) : null}
          <dl className="grid gap-3 rounded-2xl border bg-card/60 p-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Rareza</dt>
              <dd className="font-semibold">{rarityLabel(card.rarity)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Variantes</dt>
              <dd className="font-semibold">{card.renderedVariants.length}</dd>
            </div>
          </dl>
        </article>
      </div>
    </main>
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
