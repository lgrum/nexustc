import { expect, test } from "vitest";

import { isPermanentPatronTier } from "./constants";

test("owns the permanent Patreon tier definition", () => {
  expect(isPermanentPatronTier("level69")).toBe(true);
  expect(isPermanentPatronTier("level100")).toBe(true);
  expect(isPermanentPatronTier("level12")).toBe(false);
});
