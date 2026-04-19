import { parseTemplate } from "./post-template";

describe(parseTemplate, () => {
  it("extracts creator data, tags, premium links, and content from the post template", () => {
    const template = [
      "**CREADOR: Creator**",
      "Apoya a El CREADOR: [APOYA!](https://www.patreon.com/c/creator/home)",
      "",
      "**G\u00C9NEROS / TAGS:**",
      "``` Lorem, Ipsum, Dolor, Sit, Amet ```",
      "",
      "**Los LINKS Son Los** (Azules)",
      "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
      "",
      "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550**[JUEGOS PC]**\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
      "",
      "**\uD83D\uDCBB JUEGO PC:** [PC](https://example.com/aHWwwf)",
      "",
      "**\uD83D\uDCBB PARCHE ESPA\u00D1OL PC:** [PC](https://example.com/lsTpJGGgc)",
      "",
      "",
      "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550**[JUEGOS ANDROID]**\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
      "",
      "**\uD83D\uDCF1Link Android:** [ANDROID](https://example.com/IVubHkNCs)",
      "",
      "",
      "- **ESTE JUEGO YA VIENEN EN ESPA\u00D1OL PARA ANDROID**",
      "",
      "",
      "**SINOPSIS / RESUMEN / LORE: **",
      "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
      "",
      "Praesent ultricies mattis velit, ac ultrices tortor porta quis.",
      "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
      "- **Soluci\u00F3n de Problemas:**",
      "https://discord.com/channels/1/2",
      "- **Pide Ayuda En:**",
      "https://discord.com/channels/1/3",
      "",
      "**S\u00EDguenos en:**",
      "<:kofi:1383202798463619252>  [Ko-Fi](https://ko-fi.com/nexustc2)",
    ].join("\n");

    expect(parseTemplate(template)).toStrictEqual({
      content: [
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
        "",
        "Praesent ultricies mattis velit, ac ultrices tortor porta quis.",
      ].join("\n"),
      creatorName: "Creator",
      creatorUrl: "https://www.patreon.com/c/creator/home",
      premiumLinks: [
        "**[JUEGOS PC]**",
        "",
        "**\uD83D\uDCBB JUEGO PC:** [PC](https://example.com/aHWwwf)",
        "",
        "**\uD83D\uDCBB PARCHE ESPA\u00D1OL PC:** [PC](https://example.com/lsTpJGGgc)",
        "",
        "**[JUEGOS ANDROID]**",
        "",
        "**\uD83D\uDCF1Link Android:** [ANDROID](https://example.com/IVubHkNCs)",
        "",
        "- **ESTE JUEGO YA VIENEN EN ESPA\u00D1OL PARA ANDROID**",
      ].join("\n"),
      tags: ["Lorem", "Ipsum", "Dolor", "Sit", "Amet"],
    });
  });

  it("handles outer code fences and keeps multi-paragraph content intact", () => {
    const template = [
      "```",
      "**CREADOR: Dev Team**",
      "Apoya a El CREADOR: [APOYA!](https://example.com/dev-team)",
      "",
      "**GENEROS / TAGS:**",
      "Tag One, Tag Two",
      "",
      "**Los LINKS Son Los** (Azules)",
      "",
      "**[JUEGOS PC]**",
      "**PC:** [Link](https://example.com/game)",
      "",
      "**SINOPSIS / RESUMEN / LORE: **",
      "",
      "Primer p\u00E1rrafo.",
      "",
      "Segundo p\u00E1rrafo con otra l\u00EDnea.",
      "```",
    ].join("\n");

    expect(parseTemplate(template)).toStrictEqual({
      content: [
        "Primer p\u00E1rrafo.",
        "",
        "Segundo p\u00E1rrafo con otra l\u00EDnea.",
      ].join("\n"),
      creatorName: "Dev Team",
      creatorUrl: "https://example.com/dev-team",
      premiumLinks: [
        "**[JUEGOS PC]**",
        "**PC:** [Link](https://example.com/game)",
      ].join("\n"),
      tags: ["Tag One", "Tag Two"],
    });
  });

  it("extracts links and lore from the updated post template", () => {
    const template = [
      "**CREADOR:  New Creator  **",
      "*Apoya a El CREADOR:* [Provider](https://example.com/provider)",
      "",
      "**G\u00C9NEROS / TAGS:**",
      "```Action, Story Rich```",
      "",
      "**Los LINKS Son (Azules)** \uD83D\uDD35",
      "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
      "",
      "**\uD83D\uDCBB JUEGO PC:** [PC](https://example.com/pc)",
      "",
      "**\uD83D\uDCF1Link Android:** [ANDROID](https://example.com/android)",
      "",
      "**SINOPSIS / RESUMEN / LORE <:NexuraRisa:1383204054829633557> : **",
      "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
      "First lore paragraph.",
      "",
      "Second lore paragraph.",
      "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
      "- **Soluci\u00F3n de Problemas:** \u2060",
      "https://discord.com/channels/1341543718187958272/1354553658993283297",
      "https://discord.com/channels/1341543718187958272/1354553672419512451",
      "- **Pide Ayuda En:**",
      "https://discord.com/channels/1341543718187958272/1374529836911034398",
      "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
      "",
      "**S\u00EDguenos en:**",
      "\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550",
      "<:kofi:1383202798463619252>  [Ko-Fi](https://ko-fi.com/nexustc2)",
    ].join("\n");

    expect(parseTemplate(template)).toStrictEqual({
      content: ["First lore paragraph.", "", "Second lore paragraph."].join(
        "\n"
      ),
      creatorName: "New Creator",
      creatorUrl: "https://example.com/provider",
      premiumLinks: [
        "**\uD83D\uDCBB JUEGO PC:** [PC](https://example.com/pc)",
        "",
        "**\uD83D\uDCF1Link Android:** [ANDROID](https://example.com/android)",
      ].join("\n"),
      tags: ["Action", "Story Rich"],
    });
  });
});
