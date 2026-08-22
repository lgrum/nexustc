import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const adminRoot = resolve(import.meta.dirname);

function read(relativePath: string) {
  return readFileSync(resolve(adminRoot, relativePath), "utf-8");
}

describe("admin-managed image fields", () => {
  it.each([
    {
      fieldName: "assetSelection",
      formName: "templateForm",
      path: "collectibles/packs/packs-admin-page.tsx",
      rawLabel: "ID de imagen 2D administrada",
    },
    {
      fieldName: "backgroundSelection",
      formName: "form",
      path: "profile/skins/profile-skins-admin-page.tsx",
      rawLabel: "ID de fondo administrado",
    },
    {
      fieldName: "mediaSelection",
      formName: "form",
      path: "profile/decorations/profile-decorations-admin-page.tsx",
      rawLabel: "ID de recurso administrado",
    },
  ])("uses MediaField instead of a raw ID in $path", (entry) => {
    const source = read(entry.path);

    expect(source).toContain(
      `<${entry.formName}.AppField name="${entry.fieldName}">`
    );
    expect(source).toContain("<field.MediaField");
    expect(source).not.toContain(entry.rawLabel);
  });
});
