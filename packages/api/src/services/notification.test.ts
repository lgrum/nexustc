import {
  buildManualNewsDuplicateSignature,
  deriveContentUpdateEvent,
} from "./notification";

describe(deriveContentUpdateEvent, () => {
  it("creates a game update event only when the version changes on a published post", () => {
    const result = deriveContentUpdateEvent({
      next: {
        documentStatus: "publish",
        mediaCount: 1,
        title: "Chronos Nightfall",
        type: "post",
        version: "0.21",
      },
      previous: {
        id: "post-1",
        mediaCount: 1,
        status: "publish",
        title: "Chronos Nightfall",
        type: "post",
        version: "0.20",
      },
    });

    expect(result).toStrictEqual({
      contentId: "post-1",
      contentTitle: "Chronos Nightfall",
      contentType: "post",
      currentVersion: "0.21",
      dedupeKey: "game-version:post-1:0.21",
      metadata: {},
      previousVersion: "0.20",
      updateType: "game_version",
    });
  });

  it("does not create a game update event for non-version edits", () => {
    const result = deriveContentUpdateEvent({
      next: {
        documentStatus: "publish",
        mediaCount: 1,
        title: "Chronos Nightfall Remastered",
        type: "post",
        version: "0.20",
      },
      previous: {
        id: "post-1",
        mediaCount: 1,
        status: "publish",
        title: "Chronos Nightfall",
        type: "post",
        version: "0.20",
      },
    });

    expect(result).toBeNull();
  });

  it("creates a comic update event when new pages are added to a published comic", () => {
    const result = deriveContentUpdateEvent({
      next: {
        documentStatus: "publish",
        mediaCount: 4,
        title: "TheChronos: Eclipse",
        type: "comic",
      },
      previous: {
        id: "comic-1",
        mediaCount: 2,
        status: "publish",
        title: "TheChronos: Eclipse",
        type: "comic",
        version: null,
      },
    });

    expect(result).toStrictEqual({
      contentId: "comic-1",
      contentTitle: "TheChronos: Eclipse",
      contentType: "comic",
      currentPageCount: 4,
      dedupeKey: "comic-pages:comic-1:4",
      metadata: {},
      pagesAdded: 2,
      previousPageCount: 2,
      updateType: "comic_pages",
    });
  });

  it("does not create an update event when a draft becomes published", () => {
    const result = deriveContentUpdateEvent({
      next: {
        documentStatus: "publish",
        mediaCount: 2,
        title: "TheChronos: Prelude",
        type: "comic",
      },
      previous: {
        id: "comic-2",
        mediaCount: 0,
        status: "draft",
        title: "TheChronos: Prelude",
        type: "comic",
        version: null,
      },
    });

    expect(result).toBeNull();
  });
});

describe(buildManualNewsDuplicateSignature, () => {
  it("treats equivalent manual news articles as duplicates", () => {
    const firstSignature = buildManualNewsDuplicateSignature({
      bannerImageObjectKey: " banners/chronos.webp ",
      body: " Se agrego una nueva build al branch publico. ",
      contentId: "post-1",
      summary: " Build nueva disponible ",
      title: " Devlog 12 ",
    });
    const secondSignature = buildManualNewsDuplicateSignature({
      bannerImageObjectKey: "banners/chronos.webp",
      body: "Se agrego una nueva build al branch publico.",
      contentId: "post-1",
      summary: "Build nueva disponible",
      title: "Devlog 12",
    });

    expect(firstSignature).toBe(secondSignature);
  });

  it("changes when the actual article content changes", () => {
    const previousSignature = buildManualNewsDuplicateSignature({
      bannerImageObjectKey: "banners/chronos.webp",
      body: "Se agrego una nueva build al branch publico.",
      contentId: "post-1",
      summary: "Build nueva disponible",
      title: "Devlog 12",
    });
    const nextSignature = buildManualNewsDuplicateSignature({
      bannerImageObjectKey: "banners/chronos.webp",
      body: "Se agrego una nueva build al branch publico con hotfixes.",
      contentId: "post-1",
      summary: "Build nueva disponible",
      title: "Devlog 12",
    });

    expect(previousSignature).not.toBe(nextSignature);
  });
});
