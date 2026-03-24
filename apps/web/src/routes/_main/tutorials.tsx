import { createFileRoute } from "@tanstack/react-router";

import { TutorialCard } from "@/components/landing/tutorial-card";
import { orpcClient } from "@/lib/orpc";

export const Route = createFileRoute("/_main/tutorials")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Tutoriales",
      },
    ],
  }),
  loader: () => orpcClient.extras.getTutorials(),
});

function RouteComponent() {
  const tutorials = Route.useLoaderData();

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
