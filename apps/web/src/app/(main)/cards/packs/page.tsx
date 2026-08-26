import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import Image from "next/image";
import Link from "next/link";
import { connection } from "next/server";

import { orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

export const metadata: Metadata = {
  description: "Conoce los Packs publicados y sus posibles cartas.",
  title: "Packs | NeXusTC",
};

async function getPacks() {
  "use cache";
  cacheLife("hours");
  cacheTag("packs");
  return await orpcClient.packs.list(undefined, { context: { cache: true } });
}

export default async function PacksPage() {
  await connection();
  const packs = await getPacks();
  return (
    <main className="container space-y-8 py-10">
      <header className="max-w-2xl space-y-3">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Adquisición oficial
        </p>
        <h1 className="font-black text-4xl tracking-tight">Packs</h1>
        <p className="text-muted-foreground">
          Revisa el contenido posible y las garantías publicadas. Las
          probabilidades numéricas no se muestran, pero cada revisión queda
          congelada para representar las adquisiciones con honestidad.
        </p>
      </header>
      {packs.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          Todavía no hay Packs publicados.
        </p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {packs.map((pack) => (
            <li key={pack.id}>
              <Link
                className="group block overflow-hidden rounded-3xl border bg-card transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/cards/packs/${pack.id}`}
              >
                <Image
                  alt={`Arte del Pack ${pack.name}`}
                  className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  height={720}
                  src={getBucketUrl(pack.assetObjectKey)}
                  width={1280}
                />
                <div className="space-y-2 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-bold text-xl">{pack.name}</h2>
                    <span className="rounded-full border px-2 py-1 font-semibold text-xs">
                      Revisión {pack.revision.revision}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-muted-foreground text-sm">
                    {pack.description || "Pack coleccionable oficial."}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {pack.revision.cardCount} cartas ·{" "}
                    {pack.revision.possiblePool.length} posibles
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
