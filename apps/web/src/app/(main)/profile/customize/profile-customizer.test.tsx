import { PROFILE_DEFAULT_SKIN_TOKENS } from "@repo/shared/profile-customization";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ProfileCustomizer } from "./profile-customizer";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(() => Promise.resolve(true)),
  getState: vi.fn(),
  purchase: vi.fn(),
  save: vi.fn(),
  search: vi.fn(),
  toast: { error: vi.fn() },
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => mocks.confirm,
}));
vi.mock("@/lib/orpc", () => ({
  orpcClient: {
    profile: {
      getCustomizationEditorState: mocks.getState,
      purchaseCatalogItem: mocks.purchase,
      saveCustomization: mocks.save,
      searchFavoriteGames: mocks.search,
    },
  },
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("../../user/[id]/public-profile-hero", () => ({
  PublicProfileHero: () => <div>Identidad y medios reales</div>,
}));
vi.mock("../../user/[id]/profile-showcase-layout", () => ({
  ProfileShowcaseLayout: ({
    children,
    rendererKey,
  }: {
    children: React.ReactNode;
    rendererKey: string;
  }) => (
    <div>
      Diseño: {rendererKey}
      {children}
    </div>
  ),
}));
vi.mock("../../user/[id]/user-client", () => ({
  UserClient: ({ showcases }: { showcases: { type: string }[] }) => (
    <div>Vista: {showcases.map(({ type }) => type).join(",")}</div>
  ),
}));

const configuration = {
  layoutKey: "stack" as const,
  showcases: [
    {
      enabled: true,
      instanceId: "library-1",
      order: 0,
      payload: {},
      payloadSchemaVersion: 1,
      type: "library" as const,
      variant: "standard" as const,
    },
    {
      enabled: true,
      instanceId: "reviews-1",
      order: 1,
      payload: {},
      payloadSchemaVersion: 1,
      type: "reviews" as const,
      variant: "standard" as const,
    },
  ],
  skinKey: "default",
};
const initialState = {
  configuration,
  defaultConfiguration: {
    ...configuration,
    showcases: configuration.showcases.map((showcase) => ({
      ...showcase,
      enabled: showcase.type === "library",
    })),
  },
  isVirtual: true,
  revision: 0,
  showcaseErrors: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({
    ...initialState,
    isVirtual: false,
    revision: 1,
  });
  mocks.purchase.mockResolvedValue({ transactionId: "transaction-1" });
  mocks.search.mockResolvedValue([]);
});

it("renders repeated Skin colors without duplicate React keys", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  try {
    render(
      <ProfileCustomizer
        initialState={{
          ...initialState,
          skins: [
            {
              backgroundAssetKey: null,
              description: "Apariencia protegida de NeXusTC.",
              entitled: true,
              eterisPrice: null,
              isFree: true,
              itemId: "profile-skin-default",
              key: "default",
              lifecycle: "active",
              name: "Predeterminado",
              permanentlyOwned: false,
              requiredTier: null,
              selectable: true,
              tokens: PROFILE_DEFAULT_SKIN_TOKENS,
            },
          ],
        }}
        profile={{ id: "user-1", name: "Ana" } as never}
      />
    );

    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
      "Encountered two children with the same key"
    );
  } finally {
    consoleError.mockRestore();
  }
});

it("lets decoration and showcase selects fill their available rows", () => {
  render(
    <ProfileCustomizer
      initialState={initialState}
      profile={{ id: "user-1", name: "Ana" } as never}
    />
  );

  expect(
    screen.getByRole("combobox", { name: "Marco de avatar" }).className
  ).toContain("w-full");
  expect(
    screen.getByRole("combobox", { name: "Variante de Biblioteca" }).className
  ).toContain("flex-1");
});

it("offers only variants supported by each showcase type", async () => {
  const scalarConfiguration = {
    ...configuration,
    showcases: [
      ...configuration.showcases,
      {
        enabled: true,
        instanceId: "xp-1",
        order: 2,
        payload: {},
        payloadSchemaVersion: 1,
        type: "xp" as const,
        variant: "standard" as const,
      },
    ],
  };
  render(
    <ProfileCustomizer
      initialState={{
        ...initialState,
        configuration: scalarConfiguration,
        defaultConfiguration: scalarConfiguration,
      }}
      profile={{ id: "user-1", name: "Ana" } as never}
    />
  );

  fireEvent.click(
    screen.getByRole("combobox", { name: "Variante de Experiencia" })
  );
  expect(await screen.findByRole("option", { name: "Compacta" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "Estándar" })).toBeTruthy();
  expect(screen.queryByRole("option", { name: "Destacada" })).toBeNull();
});

it("configures exact Card selections and Pack Template filters in Spanish", () => {
  const collectibleConfiguration = {
    ...configuration,
    showcases: [
      ...configuration.showcases,
      {
        enabled: true,
        instanceId: "card-1",
        order: 2,
        payload: {
          cardInstanceIds: ["card-instance-1"],
          filters: {
            edition: null,
            game: null,
            seriesId: null,
          },
        },
        payloadSchemaVersion: 1,
        type: "card" as const,
        variant: "standard" as const,
      },
      {
        enabled: true,
        instanceId: "pack-1",
        order: 3,
        payload: { packTemplateId: null },
        payloadSchemaVersion: 1,
        type: "unopened-pack" as const,
        variant: "compact" as const,
      },
    ],
  };

  render(
    <ProfileCustomizer
      collectibleInventory={{
        cards: [
          {
            characterName: "Samus",
            edition: "Primera",
            gameName: "Metroid",
            id: "card-instance-1",
            mintNumber: 7,
            rarity: "rare",
            seriesId: "series-1",
            seriesName: "Cazarrecompensas",
          } as never,
        ],
        packs: [
          {
            id: "pack-1",
            templateId: "pack-template-1",
            templateName: "Pack Galáctico",
          } as never,
        ],
      }}
      initialState={{
        ...initialState,
        configuration: collectibleConfiguration,
        defaultConfiguration: collectibleConfiguration,
      }}
      profile={{ id: "user-1", name: "Ana" } as never}
    />
  );

  expect(screen.getByRole("button", { name: /Samus/ })).toBeTruthy();
  expect(screen.getByRole("option", { name: "Pack Galáctico" })).toBeTruthy();
  expect(screen.getByText(/propiedad actual al renderizar/i)).toBeTruthy();
});

it("previews scalar source data before the newly enabled Showcase is saved", () => {
  const scalarConfiguration = {
    ...configuration,
    showcases: [
      ...configuration.showcases,
      {
        enabled: false,
        instanceId: "xp-1",
        order: 2,
        payload: {},
        payloadSchemaVersion: 1,
        type: "xp" as const,
        variant: "standard" as const,
      },
    ],
  };
  render(
    <ProfileCustomizer
      initialState={{
        ...initialState,
        configuration: scalarConfiguration,
        defaultConfiguration: scalarConfiguration,
      }}
      profile={{ id: "user-1", name: "Ana" } as never}
      scalarShowcases={[
        {
          accountLevel: 3,
          currentLevelXp: 10,
          nextLevelRequirement: 50,
          order: 2,
          progress: 0.2,
          rendererKey: "xp",
          type: "xp",
          variant: "standard",
          xpRemaining: 40,
        },
      ]}
    />
  );

  expect(screen.getByText("Vista: library,reviews")).toBeTruthy();
  fireEvent.click(screen.getByRole("switch", { name: "Experiencia" }));
  expect(screen.getByText("Vista: library,reviews,xp")).toBeTruthy();
});

it("confirms the exact price and purchases without publishing the draft", async () => {
  const purchasableState = {
    ...initialState,
    layouts: [
      {
        description: "Dos columnas",
        entitled: true,
        eterisPrice: 75n,
        isFree: false,
        itemId: "item-grid",
        key: "grid" as const,
        lifecycle: "active" as const,
        name: "Cuadrícula",
        permanentlyOwned: false,
        requiredTier: "level1" as const,
        revision: 3,
        selectable: true,
      },
    ],
  };
  mocks.getState.mockResolvedValue({
    ...purchasableState,
    layouts: purchasableState.layouts.map((layout) => ({
      ...layout,
      permanentlyOwned: true,
    })),
  });
  render(
    <ProfileCustomizer
      initialState={purchasableState}
      profile={{ id: "user-1", name: "Ana" } as never}
    />
  );

  fireEvent.click(screen.getByRole("radio", { name: /Cuadrícula/i }));
  fireEvent.click(
    screen.getByRole("button", { name: /Conservar permanentemente/ })
  );

  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
  expect(mocks.confirm).toHaveBeenCalledWith(
    expect.objectContaining({
      confirmText: "Conservar permanentemente",
      description: expect.stringContaining("75 Eteris"),
    })
  );
  await waitFor(() => expect(mocks.purchase).toHaveBeenCalledOnce());
  expect(mocks.purchase).toHaveBeenCalledWith({
    expectedPrice: "75",
    expectedRevision: 3,
    idempotencyKey: expect.any(String),
    itemId: "item-grid",
  });
  expect(mocks.getState).toHaveBeenCalledOnce();
  expect(mocks.save).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("radio", { name: /Cuadrícula/i }) as HTMLInputElement)
      .checked
  ).toBe(true);
});

it("does not offer purchases while Eteris spending is disabled", () => {
  const purchasableState = {
    ...initialState,
    layouts: [
      {
        description: "Dos columnas",
        entitled: true,
        eterisPrice: 75n,
        isFree: false,
        itemId: "item-grid",
        key: "grid" as const,
        lifecycle: "active" as const,
        name: "Cuadrícula",
        permanentlyOwned: false,
        requiredTier: "level1" as const,
        revision: 3,
        selectable: true,
      },
    ],
    spendingEnabled: false,
  };
  render(
    <ProfileCustomizer
      initialState={purchasableState}
      profile={{ id: "user-1", name: "Ana" } as never}
    />
  );

  fireEvent.click(screen.getByRole("radio", { name: /Cuadrícula/i }));

  expect(
    screen.queryByRole("button", { name: /Conservar permanentemente/ })
  ).toBeNull();
  expect(
    screen.getByText(
      "Las compras con Eteris no están disponibles en este momento."
    )
  ).toBeTruthy();
});

it("curates games independently and preserves inactive downgrade overflow", async () => {
  const favoriteConfiguration = {
    ...configuration,
    showcases: [
      ...configuration.showcases,
      {
        enabled: true,
        instanceId: "favorite-games-1",
        order: 2,
        payload: { gameIds: ["game-1", "game-2"] },
        payloadSchemaVersion: 1,
        type: "favorite-games" as const,
        variant: "standard" as const,
      },
    ],
  };
  render(
    <ProfileCustomizer
      favoriteGames={{
        capacity: 1,
        selected: [
          {
            active: true,
            game: {
              coverImageObjectKey: null,
              id: "game-1",
              slug: "uno",
              title: "Uno",
            },
            id: "game-1",
          },
          { active: false, game: null, id: "game-2" },
        ],
        suggestions: [
          {
            coverImageObjectKey: null,
            id: "game-3",
            slug: "tres",
            title: "Tres",
          },
        ],
      }}
      initialState={{
        ...initialState,
        configuration: favoriteConfiguration,
        defaultConfiguration: favoriteConfiguration,
      }}
      profile={
        {
          id: "user-1",
          name: "Ana",
          visibility: { favorites: true, reviews: true },
        } as never
      }
    />
  );

  expect(screen.getByText("Inactivo")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Agregar Tres" })).toBeNull();
  mocks.search.mockResolvedValueOnce([
    {
      coverImageObjectKey: null,
      id: "game-3",
      slug: "tres",
      title: "Tres",
    },
  ]);
  fireEvent.change(
    screen.getByRole("textbox", { name: "Buscar juegos públicos" }),
    {
      target: { value: "Tres" },
    }
  );
  fireEvent.click(screen.getByRole("button", { name: "Buscar juegos" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Agregar Tres" })).toBeTruthy()
  );
  expect(
    (screen.getByRole("button", { name: "Agregar Tres" }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Quitar juego" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save).toHaveBeenCalledWith({
    draft: expect.objectContaining({
      showcases: expect.arrayContaining([
        expect.objectContaining({
          payload: { gameIds: ["game-1"] },
          type: "favorite-games",
        }),
      ]),
    }),
    expectedRevision: 0,
  });
});

it("reports favorite-game search failures and clears stale results", async () => {
  mocks.search.mockRejectedValueOnce(new Error("search unavailable"));
  const favoriteConfiguration = {
    ...configuration,
    showcases: [
      ...configuration.showcases,
      {
        enabled: true,
        instanceId: "favorite-games-1",
        order: 2,
        payload: { gameIds: [] },
        payloadSchemaVersion: 1,
        type: "favorite-games" as const,
        variant: "standard" as const,
      },
    ],
  };
  render(
    <ProfileCustomizer
      favoriteGames={{ capacity: 1, selected: [], suggestions: [] }}
      initialState={{
        ...initialState,
        configuration: favoriteConfiguration,
        defaultConfiguration: favoriteConfiguration,
      }}
      profile={
        {
          id: "user-1",
          name: "Ana",
          visibility: { favorites: true, reviews: true },
        } as never
      }
    />
  );

  fireEvent.change(
    screen.getByRole("textbox", { name: "Buscar juegos públicos" }),
    { target: { value: "Tres" } }
  );
  fireEvent.click(screen.getByRole("button", { name: "Buscar juegos" }));

  await waitFor(() =>
    expect(mocks.toast.error).toHaveBeenCalledWith(
      "No se pudieron buscar los juegos. Inténtalo de nuevo."
    )
  );
  expect(screen.queryByRole("button", { name: "Agregar Tres" })).toBeNull();
});

it("restores the editor URL when canceling dirty browser-back navigation", async () => {
  window.history.replaceState({ editor: true }, "", "/profile/customize");
  mocks.confirm.mockResolvedValueOnce(false);
  render(
    <ProfileCustomizer
      initialState={initialState}
      profile={
        {
          id: "user-1",
          name: "Ana",
          visibility: { favorites: true, reviews: true },
        } as never
      }
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Mover Biblioteca abajo" })
  );
  window.history.pushState({ destination: true }, "", "/profile");
  window.dispatchEvent(
    new PopStateEvent("popstate", { state: { destination: true } })
  );

  await waitFor(() => {
    expect(window.location.pathname).toBe("/profile/customize");
  });
  expect(window.history.state).toEqual({ editor: true });
  window.history.replaceState(null, "", "/");
});

it("requires confirmation and changes only the local draft when resetting", async () => {
  render(
    <ProfileCustomizer
      initialState={initialState}
      profile={
        {
          id: "user-1",
          name: "Ana",
          visibility: { favorites: true, reviews: true },
        } as never
      }
    />
  );

  fireEvent.click(screen.getByRole("button", { name: "Restablecer perfil" }));
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce());
  await waitFor(() => expect(screen.getByText("Vista: library")).toBeTruthy());
  expect(mocks.save).not.toHaveBeenCalled();
});

it("keeps ordering local, warns while dirty, and publishes one complete draft", async () => {
  render(
    <ProfileCustomizer
      initialState={initialState}
      profile={
        {
          id: "user-1",
          name: "Ana",
          visibility: { favorites: true, reviews: true },
        } as never
      }
    />
  );

  fireEvent.click(
    screen.getByRole("button", { name: "Mover Biblioteca abajo" })
  );
  expect(mocks.save).not.toHaveBeenCalled();
  expect(screen.getByText("Vista: reviews,library")).toBeTruthy();

  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save).toHaveBeenCalledWith({
    draft: expect.objectContaining({
      showcases: [
        expect.objectContaining({ order: 0, type: "reviews" }),
        expect.objectContaining({ order: 1, type: "library" }),
      ],
    }),
    expectedRevision: 0,
  });
});

it("previews and saves a curated layout without changing Showcase order", async () => {
  render(
    <ProfileCustomizer
      initialState={initialState}
      profile={
        {
          id: "user-1",
          name: "Ana",
          visibility: { favorites: true, reviews: true },
        } as never
      }
    />
  );

  fireEvent.click(screen.getByRole("radio", { name: /Foco/i }));
  expect(screen.getByText(/Diseño: spotlight/)).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
  expect(mocks.save).toHaveBeenCalledWith({
    draft: expect.objectContaining({
      layoutKey: "spotlight",
      showcases: configuration.showcases,
    }),
    expectedRevision: 0,
  });
});

it("keeps keyboard focus and semantic order when using non-drag reorder controls", () => {
  const { container } = render(
    <ProfileCustomizer
      initialState={initialState}
      profile={
        {
          id: "user-1",
          name: "Ana",
          visibility: { favorites: true, reviews: true },
        } as never
      }
    />
  );

  const moveButton = screen.getByRole("button", {
    name: "Mover Biblioteca abajo",
  });
  moveButton.focus();
  fireEvent.click(moveButton);

  expect(
    [...container.querySelectorAll("ol > li label")].map(
      (label) => label.textContent
    )
  ).toEqual(["Rese\u00F1as", "Biblioteca"]);
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Mover Biblioteca arriba" })
  );
});

it("uses a compact drag image instead of the full showcase card", () => {
  render(
    <ProfileCustomizer
      initialState={initialState}
      profile={{ id: "user-1", name: "Ana" } as never}
    />
  );

  const card = screen.getByRole("switch", { name: "Biblioteca" }).closest("li");
  const setDragImage = vi.fn();
  expect(card).toBeTruthy();

  fireEvent.dragStart(card!, {
    dataTransfer: { setDragImage },
  });

  expect(setDragImage).toHaveBeenCalledOnce();
  const [dragImage] = setDragImage.mock.calls[0] as [HTMLElement];
  expect(dragImage).not.toBe(card);
  expect(dragImage.textContent).toContain("Biblioteca");
  expect(dragImage.style.height).toBe("56px");
  fireEvent.dragEnd(card!);
  expect(dragImage.isConnected).toBe(false);
});

it("associates structured errors with the invalid editor control", async () => {
  mocks.save.mockRejectedValueOnce({
    code: "PROFILE_CUSTOMIZATION_INVALID",
    data: {
      fieldErrors: {
        layoutKey: "El dise\u00F1o ya no est\u00E1 disponible.",
      },
    },
  });
  render(
    <ProfileCustomizer
      initialState={initialState}
      profile={
        {
          id: "user-1",
          name: "Ana",
          visibility: { favorites: true, reviews: true },
        } as never
      }
    />
  );

  fireEvent.click(screen.getByRole("radio", { name: /Foco/i }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

  const layout = screen.getByRole("radio", { name: /Foco/i });
  await waitFor(() =>
    expect(layout.getAttribute("aria-describedby")).toBeTruthy()
  );
  const errorId = layout.getAttribute("aria-describedby");
  expect(errorId).toBeTruthy();
  expect(document.querySelector(`#${errorId}`)?.textContent).toBe(
    "El dise\u00F1o ya no est\u00E1 disponible."
  );
});

it("moves focus to the next favorite after removing one", async () => {
  const favoriteConfiguration = {
    ...configuration,
    showcases: [
      ...configuration.showcases,
      {
        enabled: true,
        instanceId: "favorite-games-1",
        order: 2,
        payload: { gameIds: ["game-1", "game-2"] },
        payloadSchemaVersion: 1,
        type: "favorite-games" as const,
        variant: "standard" as const,
      },
    ],
  };
  render(
    <ProfileCustomizer
      favoriteGames={{
        capacity: 3,
        selected: [
          {
            active: true,
            game: {
              coverImageObjectKey: null,
              id: "game-1",
              slug: "uno",
              title: "Uno",
            },
            id: "game-1",
          },
          {
            active: true,
            game: {
              coverImageObjectKey: null,
              id: "game-2",
              slug: "dos",
              title: "Dos",
            },
            id: "game-2",
          },
        ],
        suggestions: [],
      }}
      initialState={{
        ...initialState,
        configuration: favoriteConfiguration,
        defaultConfiguration: favoriteConfiguration,
      }}
      profile={{ id: "user-1", name: "Ana" } as never}
    />
  );

  const remove = screen.getByRole("button", { name: "Quitar Uno" });
  remove.focus();
  fireEvent.click(remove);

  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Quitar Dos" })
    )
  );
});
