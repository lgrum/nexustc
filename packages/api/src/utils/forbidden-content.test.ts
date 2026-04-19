import {
  findForbiddenContentMatch,
  normalizeForbiddenContentValue,
} from "./forbidden-content";

describe(findForbiddenContentMatch, () => {
  it("matches forbidden terms case-insensitively", () => {
    expect(
      findForbiddenContentMatch("Esto tiene SPAM raro", [
        { kind: "term", normalizedValue: "spam", value: "spam" },
      ])
    ).toStrictEqual({ values: ["spam"] });
  });

  it("matches words only on word boundaries", () => {
    expect(
      findForbiddenContentMatch("La classica forma no cuenta", [
        { kind: "word", normalizedValue: "ass", value: "ass" },
      ])
    ).toBeNull();

    expect(
      findForbiddenContentMatch("No publiques ass aqui", [
        { kind: "word", normalizedValue: "ass", value: "ass" },
      ])
    ).toStrictEqual({ values: ["ass"] });
  });

  it("matches urls without requiring protocol or www", () => {
    expect(
      findForbiddenContentMatch("Mira https://www.example.com/path", [
        {
          kind: "url",
          normalizedValue: normalizeForbiddenContentValue(
            "https://example.com/",
            "url"
          ),
          value: "https://example.com/",
        },
      ])
    ).toStrictEqual({ values: ["https://example.com/"] });
  });
});
