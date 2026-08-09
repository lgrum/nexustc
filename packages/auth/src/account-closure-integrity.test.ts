import { readFile } from "node:fs/promises";

import { expect, test } from "vitest";

test("account closure removes every personal integrity evidence table", async () => {
  const source = await readFile(
    new URL("account-closure.ts", import.meta.url),
    "utf-8"
  );
  const compactSource = source.replaceAll(/\s+/g, "");

  for (const table of [
    "xpLikeDisqualification",
    "xpRiskSignal",
    "xpIntegrityCase",
  ]) {
    expect(compactSource).toContain(`tx.delete(${table})`);
  }
  expect(
    compactSource.indexOf("tx.delete(xpLikeDisqualification)")
  ).toBeLessThan(compactSource.indexOf("tx.delete(xpIntegrityCase)"));
  const reversalDelete = compactSource.indexOf(
    "not(isNull(xpEvent.reversesEventId))"
  );
  expect(reversalDelete).toBeGreaterThan(-1);
  expect(reversalDelete).toBeLessThan(
    compactSource.lastIndexOf("tx.delete(xpEvent)")
  );
});
