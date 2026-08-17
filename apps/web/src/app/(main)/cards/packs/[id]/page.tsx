import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

async function getPack(id: string) {
  "use cache";
  cacheLife("hours");
  cacheTag("packs", `pack:${id}`);
  return await orpcClient.packs.get({ id }, { context: { cache: true } });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  await connection();
  const { id } = await params;
  const pack = await getPack(id);
  return {
    description: pack?.description || "Pack coleccionable de NeXusTC.",
    title: pack ? `${pack.name} | Packs` : "Pack | NeXusTC",
  };
}

export default async function PackDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;
  const pack = await getPack(id);
  if (!pack) {
    notFound();
  }
  const { revision } = pack;
  return (
    <main className="container space-y-8 py-10">
      <Link
        className="text-muted-foreground text-sm hover:text-foreground"
        href="/cards/packs"
      >
        ← Volver a Packs
      </Link>
      <div className="grid gap-8 lg:grid-cols-[minmax(18rem,32rem)_minmax(0,1fr)] lg:items-start">
        <div className="overflow-hidden rounded-3xl border bg-card">
          <Image
            alt={`Arte del Pack ${pack.name}`}
            className="h-auto w-full"
            height={720}
            priority
            src={getBucketUrl(pack.assetObjectKey)}
            width={1280}
          />
        </div>
        <article className="space-y-7">
          <header className="space-y-3">
            <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
              Pack publicado · revisión {revision.revision}
            </p>
            <h1 className="font-black text-4xl tracking-tight">{pack.name}</h1>
            {pack.description ? (
              <p className="whitespace-pre-wrap text-muted-foreground leading-7">
                {pack.description}
              </p>
            ) : null}
          </header>
          <dl className="grid gap-3 rounded-2xl border bg-card/60 p-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Cartas por Pack</dt>
              <dd className="font-semibold">{revision.cardCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Política de duplicados</dt>
              <dd className="font-semibold">
                {revision.duplicatePolicy === "no-duplicates"
                  ? "Sin duplicados"
                  : "Duplicados permitidos"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fecha de publicación</dt>
              <dd className="font-semibold">
                {revision.publishedAt
                  ? new Intl.DateTimeFormat("es-AR", {
                      dateStyle: "medium",
                    }).format(new Date(revision.publishedAt))
                  : "No disponible"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Binding</dt>
              <dd className="font-semibold">
                {revision.bindingPolicy === "transferable"
                  ? "Transferible"
                  : revision.bindingPolicy === "account-bound"
                    ? "Vinculado a la cuenta"
                    : "Según la adquisición"}
              </dd>
            </div>
          </dl>
          <section className="space-y-3">
            <h2 className="font-bold text-xl">Garantías anunciadas</h2>
            {revision.guarantees.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Esta revisión no anuncia una garantía adicional.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {revision.guarantees.map((guarantee, index) => (
                  <li
                    className="rounded-xl border px-4 py-3"
                    key={`${guarantee.rarity}-${index}`}
                  >
                    Al menos {guarantee.minimumCount} carta(s) de rareza{" "}
                    {rarityLabel(guarantee.rarity)}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="space-y-3">
            <h2 className="font-bold text-xl">Pool posible</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {revision.possiblePool.map((card) => (
                <li
                  className="rounded-xl border px-4 py-3 text-sm"
                  key={card.id}
                >
                  <span className="font-semibold">{card.characterName}</span>
                  <span className="block text-muted-foreground">
                    {card.gameName} · {rarityLabel(card.rarity)}
                  </span>
                </li>
              ))}
            </ul>
            {revision.unavailableCards.length > 0 ? (
              <div className="space-y-3 rounded-xl border border-dashed p-4">
                <h3 className="font-semibold text-sm">Cartas no disponibles</h3>
                <p className="text-muted-foreground text-sm">
                  Estas cartas permanecen en la historia de la revisión, pero no
                  pueden aparecer en nuevas adquisiciones mientras estén
                  deshabilitadas.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {revision.unavailableCards.map((card) => (
                    <li
                      className="rounded-lg border px-3 py-2 text-sm"
                      key={card.id}
                    >
                      <span className="font-semibold">
                        {card.characterName}
                      </span>
                      <span className="block text-muted-foreground">
                        {card.gameName} · {rarityLabel(card.rarity)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
          <p className="text-muted-foreground text-xs">
            Esta página no muestra probabilidades exactas ni resultados de Packs
            individuales.
          </p>
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
