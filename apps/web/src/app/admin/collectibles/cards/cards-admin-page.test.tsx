import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CardsAdminPage } from "./cards-admin-page";

const api = vi.hoisted(() => ({
  charactersList: vi.fn(),
  invalidateQueries: vi.fn(),
  saveDraft: vi.fn(),
  seriesList: vi.fn(),
  templatesList: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal()),
  useQueryClient: () => ({ invalidateQueries: api.invalidateQueries }),
}));

vi.mock("@/components/forms/media-field", async () => {
  const { useFieldContext } = await import("@/components/forms/form-context");

  return {
    MediaField: ({ label }: { label: string }) => {
      const field = useFieldContext<
        {
          file?: File;
          kind: "existing" | "pending";
          mediaId?: string;
          previewUrl?: string;
          selectionId: string;
        }[]
      >();
      const hasSelection = field.state.value.length > 0;

      return (
        <div>
          <label htmlFor={field.name}>{label}</label>
          <input
            id={field.name}
            onChange={(event) => {
              const file = event.target.files?.[0];
              field.handleChange(
                file
                  ? [
                      {
                        file,
                        kind: "pending",
                        previewUrl: "blob:test-portrait",
                        selectionId: "pending:test-portrait",
                      },
                    ]
                  : []
              );
            }}
            type="file"
          />
          {hasSelection ? (
            <button onClick={() => field.handleChange([])} type="button">
              Quitar imagen
            </button>
          ) : null}
        </div>
      );
    },
  };
});

vi.mock("@/lib/orpc", () => ({
  orpc: {
    media: {
      admin: {
        browse: { queryKey: vi.fn(() => ["media", "browse"]) },
        list: { queryKey: vi.fn(() => ["media", "list"]) },
      },
    },
  },
  orpcClient: {
    collectiblesAdmin: {
      characters: {
        create: vi.fn(),
        list: api.charactersList,
        retire: vi.fn(),
      },
      series: {
        create: vi.fn(),
        list: api.seriesList,
        retire: vi.fn(),
      },
      templates: {
        correct: vi.fn(),
        disable: vi.fn(),
        list: api.templatesList,
        publish: vi.fn(),
        restore: vi.fn(),
        retire: vi.fn(),
        saveDraft: api.saveDraft,
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const characters = [
  {
    characterName: "Samus Aran",
    gameName: "Metroid",
    id: "character-1",
    lifecycle: "active",
    updatedAt: new Date("2026-08-17T00:00:00.000Z"),
  },
];
const series = [
  {
    id: "series-1",
    lifecycle: "active",
    name: "Clásicos",
    updatedAt: new Date("2026-08-17T00:00:00.000Z"),
  },
];

describe("CardsAdminPage portrait authoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.charactersList.mockResolvedValue(characters);
    api.seriesList.mockResolvedValue(series);
    api.templatesList.mockResolvedValue([]);
    api.saveDraft.mockResolvedValue({ id: "template-1" });
    api.invalidateQueries.mockResolvedValue();
  });

  it("uploads a selected portrait only when the draft is submitted", async () => {
    render(
      <CardsAdminPage
        initialData={{ characters, series, templates: [] } as never}
      />
    );

    expect(screen.queryByLabelText("ID de retrato administrado")).toBeNull();

    const portrait = new File(["portrait"], "samus.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText("Imagen de retrato"), {
      target: { files: [portrait] },
    });

    expect(api.saveDraft).not.toHaveBeenCalled();
    const saveButton = screen.getByRole("button", { name: "Guardar borrador" });
    fireEvent.submit(saveButton.closest("form")!);

    await waitFor(() => {
      expect(api.saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: expect.not.objectContaining({
            portraitMediaId: expect.anything(),
          }),
          portraitSelection: [
            expect.objectContaining({ file: portrait, kind: "pending" }),
          ],
        })
      );
    });
  });

  it("can remove a pending portrait without uploading it", () => {
    render(
      <CardsAdminPage
        initialData={{ characters, series, templates: [] } as never}
      />
    );

    const portrait = new File(["portrait"], "samus.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText("Imagen de retrato"), {
      target: { files: [portrait] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Quitar imagen" }));

    expect(
      screen
        .getByRole("button", { name: "Guardar borrador" })
        .hasAttribute("disabled")
    ).toBe(true);
    expect(api.saveDraft).not.toHaveBeenCalled();
  });

  it("replaces the portrait of an existing draft without exposing its media ID", async () => {
    const existingTemplate = {
      availability: "active",
      characterId: "character-1",
      characterName: "Samus Aran",
      description: "Cazadora espacial",
      edition: null,
      effectConfig: { effect: "none", intensity: "low" },
      gameName: "Metroid",
      id: "template-1",
      lifetimeSupplyCeiling: null,
      lifecycle: "draft",
      mintedSupply: 0,
      portraitMediaId: "media-private-1",
      portraitObjectKey: "media/carta/template-1/old.webp",
      presentationMetadata: {
        accentColor: "#7c3aed",
        frameKey: "default",
        watermarkText: "NeXusTC",
      },
      rarity: "rare",
      seriesId: "series-1",
      seriesName: "Clásicos",
      updatedAt: new Date("2026-08-17T00:00:00.000Z"),
      version: 3,
    };
    api.templatesList.mockResolvedValue([existingTemplate]);
    render(
      <CardsAdminPage
        initialData={
          {
            characters,
            series,
            templates: [existingTemplate],
          } as never
        }
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Editar borrador" }));
    expect(screen.queryByDisplayValue("media-private-1")).toBeNull();
    expect(screen.getByRole("button", { name: "Descartar" })).toBeTruthy();

    const replacement = new File(["replacement"], "samus-new.webp", {
      type: "image/webp",
    });
    fireEvent.change(screen.getByLabelText("Imagen de retrato"), {
      target: { files: [replacement] },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Guardar cambios" }).closest("form")!
    );

    await waitFor(() => {
      expect(api.saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          draft: expect.objectContaining({ id: "template-1" }),
          expectedVersion: 3,
          portraitSelection: [
            expect.objectContaining({ file: replacement, kind: "pending" }),
          ],
        })
      );
    });
  });
});
