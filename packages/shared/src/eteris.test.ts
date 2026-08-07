import { expect, test } from "vitest";

import { ETERIS_MONTHLY_PATREON_STIPENDS, eterisAmountSchema } from "./eteris";

test("Eteris decimal strings preserve the complete signed 64-bit range", () => {
  expect(eterisAmountSchema.parse("9223372036854775807")).toBe(
    9_223_372_036_854_775_807n
  );
  expect(eterisAmountSchema.parse("-9223372036854775808")).toBe(
    BigInt("-9223372036854775808")
  );
  expect(() => eterisAmountSchema.parse("9223372036854775808")).toThrow();
  expect(() => eterisAmountSchema.parse("0")).toThrow();
  expect(() => eterisAmountSchema.parse("1.5")).toThrow();
});

test("every Patreon tier has the approved monthly Eteris stipend", () => {
  expect(ETERIS_MONTHLY_PATREON_STIPENDS).toEqual({
    level1: 50n,
    level3: 150n,
    level5: 250n,
    level8: 400n,
    level12: 600n,
    level69: 1500n,
    level100: 2500n,
    none: 0n,
  });
});
