import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { APP_THEME_IDS } from "@repo/shared/app-theme";
import { expect, test } from "vitest";

const styles = readFileSync(
  resolve(import.meta.dirname, "styles.css"),
  "utf-8"
);

test("every App Theme has a production selector and a valid page background", () => {
  for (const themeId of APP_THEME_IDS) {
    expect(styles).toContain(`[data-app-theme="${themeId}"]`);
  }
  expect(styles).toContain("background: var(--page-background);");
  expect(styles).not.toContain("background-image: var(--page-background);");
});
