import { describe, expect, it } from "vitest";

import { assertTextIsNotSpammy, detectSpammyText } from "./spam-detection";

describe("detectSpammyText", () => {
  it("allows normal comments with some emphasis and emoji", () => {
    expect(
      detectSpammyText(
        "Me encanto esta version, el final estuvo buenisimo :party: :heart:"
      )
    ).toEqual({ ok: true });
  });

  it("allows long normal comments without treating natural language as low variety", () => {
    expect(
      detectSpammyText(
        "La escena final me parecio muy buena porque cierra el conflicto con calma, deja claro lo que queria el personaje y ademas conecta bien con los detalles que fueron apareciendo antes."
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

  it("blocks links", () => {
    expect(detectSpammyText("Mira esto https://example.com")).toMatchObject({
      ok: false,
      reason: "url",
    });
  });

  it("blocks blank-only messages", () => {
    expect(detectSpammyText("\n\n\n\n\n\n\n\n\n\n")).toMatchObject({
      ok: false,
      reason: "blank_lines",
    });
  });

  it("blocks excessive blank line runs", () => {
    expect(detectSpammyText("Me gusto\n\n\npero esto sobra")).toMatchObject({
      ok: false,
      reason: "blank_lines",
    });
  });

  it("allows ordinary paragraph breaks", () => {
    expect(detectSpammyText("Me gusto\n\nBuen trabajo")).toEqual({ ok: true });
  });

  it("blocks domain-like text without a protocol", () => {
    expect(detectSpammyText("Mira example.com cuando puedas")).toMatchObject({
      ok: false,
      reason: "url",
    });
  });

  it("blocks known download hosts even without a URL", () => {
    expect(detectSpammyText("Subido a mediafire")).toMatchObject({
      ok: false,
      reason: "url",
    });
    expect(detectSpammyText("Tambien esta en g o f i l e")).toMatchObject({
      ok: false,
      reason: "url",
    });
  });

  it("lets administration roles bypass spam detection", () => {
    expect(() =>
      assertTextIsNotSpammy(
        "spam spam spam spam spam spam spam spam\n\n\n",
        {
          BAD_REQUEST: ({ message } = {}) => new Error(message),
        },
        "admin"
      )
    ).not.toThrow();
  });

  it("does not let moderators bypass spam detection", () => {
    expect(() =>
      assertTextIsNotSpammy(
        "spam spam spam spam spam spam spam spam",
        {
          BAD_REQUEST: ({ message } = {}) => new Error(message),
        },
        "moderator"
      )
    ).toThrow();
  });
});
