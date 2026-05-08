import { describe, expect, it } from "vitest";

import { detectSpammyText } from "./spam-detection";

describe("detectSpammyText", () => {
  it("allows normal comments with some emphasis and emoji", () => {
    expect(
      detectSpammyText(
        "Me encanto esta version, el final estuvo buenisimo :party: :heart:"
      )
    ).toEqual({ ok: true });
  });

  it("blocks long repeated character runs", () => {
    expect(detectSpammyText("Esto es buenoooooooooooo")).toMatchObject({
      ok: false,
      reason: "repeated_characters",
    });
  });

  it("blocks repeated unicode emoji runs", () => {
    expect(detectSpammyText("Buenisimo 😂😂😂😂😂😂😂😂")).toMatchObject({
      ok: false,
      reason: "repeated_emoji",
    });
  });

  it("blocks repeated custom emoji runs", () => {
    expect(
      detectSpammyText(":party::party::party::party::party::party:")
    ).toMatchObject({
      ok: false,
      reason: "repeated_tokens",
    });
  });

  it("blocks repeated sticker runs", () => {
    expect(
      detectSpammyText(
        "[sticker:boom][sticker:boom][sticker:boom][sticker:boom][sticker:boom][sticker:boom]"
      )
    ).toMatchObject({
      ok: false,
      reason: "repeated_tokens",
    });
  });

  it("blocks dominant repeated words", () => {
    expect(
      detectSpammyText("juego juego juego juego juego juego juego increible")
    ).toMatchObject({
      ok: false,
      reason: "repeated_words",
    });
  });

  it("blocks repeated substrings", () => {
    expect(detectSpammyText("abcabcabcabcabcabc")).toMatchObject({
      ok: false,
      reason: "repeated_substring",
    });
  });

  it("blocks low diversity long text", () => {
    expect(
      detectSpammyText("aabbccaabbddccbbaabbccaabbddccbbaabbcczz")
    ).toMatchObject({
      ok: false,
      reason: "low_diversity",
    });
  });

  it("blocks too many links", () => {
    expect(
      detectSpammyText("https://a.test https://b.test www.c.test")
    ).toMatchObject({
      ok: false,
      reason: "too_many_links",
    });
  });
});
