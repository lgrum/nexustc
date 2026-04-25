import { createFileRoute } from "@tanstack/react-router";

import { Markdown } from "@/components/markdown";

import changelog from "../../../../../CHANGELOG.md?raw";

export const Route = createFileRoute("/admin/changelog")({
  component: ChangelogPage,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Changelog",
      },
    ],
  }),
});

function ChangelogPage() {
  return (
    <section className="mx-auto w-full max-w-4xl py-6">
      <Markdown>{changelog}</Markdown>
    </section>
  );
}
