import { describe, expect, it } from "vitest";

import { ianaTimezoneSchema } from "./schemas";

describe("ianaTimezoneSchema", () => {
  it("accepts canonical timezone input and rejects unknown zones", () => {
    expect(ianaTimezoneSchema.parse(" America/Argentina/Buenos_Aires ")).toBe(
      "America/Argentina/Buenos_Aires"
    );
    expect(ianaTimezoneSchema.safeParse("Invalid/Timezone").success).toBe(
      false
    );
  });
});
