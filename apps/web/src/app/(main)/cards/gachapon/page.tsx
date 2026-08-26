import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";

import { orpcClient } from "@/lib/orpc";

import { GachaponClient } from "./gachapon-client";

export const metadata: Metadata = {
  description:
    "Activa máquinas Gachapon con Eteris y conoce sus Packs posibles sin revelar odds exactas.",
  title: "Gachapon | NeXusTC",
};

// eslint-disable-next-line require-await -- Next's use cache directive requires an async function.
async function getMachines() {
  "use cache";
  cacheLife("minutes");
  cacheTag("gachapon");
  return orpcClient.gacha.list(undefined, { context: { cache: true } });
}

export default async function GachaponPage() {
  await connection();
  const machines = await getMachines();
  return <GachaponClient initialMachines={machines} />;
}
