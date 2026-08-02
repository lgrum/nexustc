import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "vitest";

const source = readFileSync(
  resolve(import.meta.dirname, "comic-page.tsx"),
  "utf-8"
);

test("comic readers keep a black canvas and theme their controls", () => {
  expect(source).toContain(
    'className="fixed inset-0 z-50 flex flex-col bg-black"'
  );
  expect(source).toContain('className="min-h-dvh bg-black"');
  expect(source).toContain("from-card/95");
  expect(source).toContain("bg-card/90");
  expect(source).toContain("text-card-foreground");
  expect(source).toContain("READER_CONTROL_CLASS_NAME");
  expect(source).toContain("focus-visible:opacity-100");
  expect(source).toContain("focus-visible:ring-ring");
  expect(source).not.toContain("bg-zinc-950");
});
