import { db } from "@repo/db";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";

import { createPageMetadata } from "@/app/seo";
import { TutorialCard } from "@/components/landing/tutorial-card";

type Tutorial = {
  description: string;
  embedUrl: string;
  id: string;
  title: string;
};

export const metadata: Metadata = createPageMetadata({
  description: "Tutoriales, guías y recursos para aprender a usar NeXusTC.",
  path: "/tutorials",
  title: "Tutoriales",
});

async function getTutorials() {
  "use cache";
  cacheLife("days");
  cacheTag("tutorials");

  return (await db.query.tutorials.findMany()) as Tutorial[];
}

export default async function Page() {
  const tutorials = await getTutorials();

  return (
    <main className="container w-full space-y-6 p-6 py-0">
      <h1 className="font-bold text-4xl">Tutoriales</h1>
      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3">
        {tutorials.map((tutorial) => (
          <TutorialCard key={tutorial.id} tutorial={tutorial} />
        ))}
      </div>
    </main>
  );
}
