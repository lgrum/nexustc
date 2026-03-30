import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/demo/")({
  component: RouteComponent,
});

const demos = [
  "a",
  "b",
  "c",
  "d",
  "e",
  "f",
  "g",
  "h",
  "i",
  "j",
  "k",
  "l",
  "m",
  "n",
] as const;

function RouteComponent() {
  return (
    <div className="flex gap-5 flex-col items-center justify-center min-h-screen">
      <h1 className="font-bold text-xl">Demos</h1>
      <ul>
        {demos.map((demo) => (
          <li key={demo}>
            <Link to={`/demo/${demo}`}>
              <Button className="min-w-50">{demo.toLocaleUpperCase()}</Button>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
