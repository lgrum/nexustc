import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NeXusTC - Changelog",
};

export default function Page() {
  return (
    <section className="mx-auto w-full max-w-4xl py-6">
      <a className="text-primary underline" href="/CHANGELOG.md">
        Ver changelog
      </a>
    </section>
  );
}
