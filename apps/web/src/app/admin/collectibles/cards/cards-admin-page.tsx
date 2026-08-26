"use client";

import { useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAppForm } from "@/hooks/use-app-form";
import {
  createDeferredMediaSelectionFromExistingId,
  createEmptyDeferredMediaSelection,
  requiredSingleDeferredMediaSelectionSchema,
} from "@/lib/deferred-media";
import { orpc, orpcClient } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

import { OperationalActionDialog } from "../operational-action-dialog";
import type { OperationalActionValues } from "../operational-action-dialog";

type CardEffect =
  | "none"
  | "holographic-shimmer"
  | "starlight-drift"
  | "ember-pulse";
type CardFrame = "default" | "cosmic" | "disabled";
type CardRarity = (typeof RARITIES)[number][0];
type TemplateDraftState = {
  characterId: string;
  description: string;
  edition: string;
  effect: CardEffect;
  expectedVersion?: number;
  frameKey: CardFrame;
  id?: string;
  lifetimeSupplyCeiling: string;
  rarity: CardRarity;
  seriesId: string;
};

type InitialData = {
  characters: Awaited<
    ReturnType<typeof orpcClient.collectiblesAdmin.characters.list>
  >;
  series: Awaited<ReturnType<typeof orpcClient.collectiblesAdmin.series.list>>;
  templates: Awaited<
    ReturnType<typeof orpcClient.collectiblesAdmin.templates.list>
  >;
};

type Character = InitialData["characters"][number];
type Series = InitialData["series"][number];
type Template = InitialData["templates"][number];
type PendingAction =
  | { item: Character; type: "retire-character" }
  | { item: Series; type: "retire-series" }
  | {
      item: Template;
      type:
        | "correct-template"
        | "disable-template"
        | "restore-template"
        | "retire-template";
    };

const RARITIES = [
  ["common", "Común"],
  ["uncommon", "Poco común"],
  ["rare", "Raro"],
  ["epic", "Épico"],
  ["legendary", "Legendario"],
] as const;

const templatePortraitFormSchema = z.object({
  portraitSelection: requiredSingleDeferredMediaSelectionSchema,
});

function createEmptyTemplateDraft(data: InitialData): TemplateDraftState {
  return {
    characterId: data.characters[0]?.id ?? "",
    description: "",
    edition: "",
    effect: "none",
    frameKey: "default",
    lifetimeSupplyCeiling: "",
    rarity: "common",
    seriesId: data.series[0]?.id ?? "",
  };
}

export function CardsAdminPage({ initialData }: { initialData: InitialData }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState(initialData);
  const [characterName, setCharacterName] = useState("");
  const [gameName, setGameName] = useState("");
  const [seriesName, setSeriesName] = useState("");
  const [seriesDescription, setSeriesDescription] = useState("");
  const [template, setTemplate] = useState<TemplateDraftState>(() =>
    createEmptyTemplateDraft(initialData)
  );
  const [pendingAction, setPendingAction] = useState<PendingAction>();

  const reload = async () => {
    const [characters, series, templates] = await Promise.all([
      orpcClient.collectiblesAdmin.characters.list(),
      orpcClient.collectiblesAdmin.series.list(),
      orpcClient.collectiblesAdmin.templates.list(),
    ]);
    setData({ characters, series, templates });
  };

  const templateForm = useAppForm({
    defaultValues: {
      portraitSelection: createEmptyDeferredMediaSelection(),
    },
    onSubmit: async ({ formApi, value }) => {
      try {
        await orpcClient.collectiblesAdmin.templates.saveDraft({
          draft: {
            characterId: template.characterId,
            description: template.description,
            edition: template.edition.trim() || null,
            effect: { effect: template.effect, intensity: "low" },
            id: template.id,
            lifetimeSupplyCeiling: template.lifetimeSupplyCeiling
              ? Number(template.lifetimeSupplyCeiling)
              : null,
            presentation: {
              accentColor: "#7c3aed",
              frameKey: template.frameKey,
              watermarkText: "NeXusTC",
            },
            rarity: template.rarity,
            seriesId: template.seriesId,
          },
          expectedVersion: template.expectedVersion,
          portraitSelection: value.portraitSelection,
        });
        await reload();
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.media.admin.browse.queryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: orpc.media.admin.list.queryKey(),
          }),
        ]);
        const wasEditing = !!template.id;
        setTemplate(createEmptyTemplateDraft(data));
        formApi.reset();
        toast.success(
          wasEditing
            ? "Borrador de carta actualizado"
            : "Borrador de carta guardado"
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo guardar el borrador."
        );
      }
    },
    validators: { onSubmit: templatePortraitFormSchema },
  });
  const portraitSelection = useStore(
    templateForm.store,
    (state) => state.values.portraitSelection
  );

  const createCharacter = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await orpcClient.collectiblesAdmin.characters.create({
        characterName,
        gameName,
      });
      setCharacterName("");
      setGameName("");
      await reload();
      toast.success("Personaje guardado");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el personaje."
      );
    }
  };

  const createSeries = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await orpcClient.collectiblesAdmin.series.create({
        description: seriesDescription,
        name: seriesName,
      });
      setSeriesName("");
      setSeriesDescription("");
      await reload();
      toast.success("Serie guardada");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar la Serie."
      );
    }
  };

  const retireCharacter = async (item: Character, reason: string) => {
    await orpcClient.collectiblesAdmin.characters.retire({
      characterId: item.id,
      expectedVersion: new Date(item.updatedAt),
      reason,
    });
    await reload();
    toast.success("Personaje retirado");
  };

  const retireSeries = async (item: Series, reason: string) => {
    await orpcClient.collectiblesAdmin.series.retire({
      expectedVersion: new Date(item.updatedAt),
      reason,
      seriesId: item.id,
    });
    await reload();
    toast.success("Serie retirada");
  };

  const editTemplate = (item: Template) => {
    const existingSelection = createDeferredMediaSelectionFromExistingId(
      item.portraitMediaId
    ).map((selection) => ({
      ...selection,
      objectKey: item.portraitObjectKey,
    }));
    templateForm.reset({ portraitSelection: existingSelection });
    setTemplate({
      characterId: item.characterId,
      description: item.description,
      edition: item.edition ?? "",
      effect: item.effectConfig.effect,
      expectedVersion: item.version,
      frameKey: item.presentationMetadata.frameKey as CardFrame,
      id: item.id,
      lifetimeSupplyCeiling: item.lifetimeSupplyCeiling?.toString() ?? "",
      rarity: item.rarity,
      seriesId: item.seriesId,
    });
  };

  const cancelTemplateEdit = () => {
    setTemplate(createEmptyTemplateDraft(data));
    templateForm.reset();
  };

  const publishTemplate = async (item: InitialData["templates"][number]) => {
    try {
      await orpcClient.collectiblesAdmin.templates.publish({
        expectedVersion: item.version,
        templateId: item.id,
      });
      await reload();
      toast.success("Carta publicada");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo publicar la carta."
      );
    }
  };

  const disableTemplate = async (item: Template, reason: string) => {
    await orpcClient.collectiblesAdmin.templates.disable({
      expectedVersion: item.version,
      idempotencyKey: `card-template-disable:${item.id}:${item.version}`,
      reason,
      templateId: item.id,
    });
    await reload();
    toast.success("Carta deshabilitada");
  };

  const restoreTemplate = async (item: Template, reason: string) => {
    await orpcClient.collectiblesAdmin.templates.restore({
      expectedVersion: item.version,
      idempotencyKey: `card-template-restore:${item.id}:${item.version}`,
      reason,
      templateId: item.id,
    });
    await reload();
    toast.success("Carta restaurada");
  };

  const retireTemplate = async (item: Template, reason: string) => {
    await orpcClient.collectiblesAdmin.templates.retire({
      expectedVersion: item.version,
      reason,
      templateId: item.id,
    });
    await reload();
    toast.success("Carta retirada");
  };

  const correctTemplate = async (
    item: Template,
    { details, reason }: OperationalActionValues
  ) => {
    await orpcClient.collectiblesAdmin.templates.correct({
      description: details ?? item.description,
      effect: item.effectConfig,
      expectedVersion: item.version,
      portraitMediaId: item.portraitMediaId,
      presentation: item.presentationMetadata,
      reason,
      templateId: item.id,
    });
    await reload();
    toast.success("Corrección aplicada a las instancias");
  };

  const submitPendingAction = async (values: OperationalActionValues) => {
    if (!pendingAction) {
      return;
    }
    switch (pendingAction.type) {
      case "correct-template": {
        await correctTemplate(pendingAction.item, values);
        break;
      }
      case "disable-template": {
        await disableTemplate(pendingAction.item, values.reason);
        break;
      }
      case "restore-template": {
        await restoreTemplate(pendingAction.item, values.reason);
        break;
      }
      case "retire-character": {
        await retireCharacter(pendingAction.item, values.reason);
        break;
      }
      case "retire-series": {
        await retireSeries(pendingAction.item, values.reason);
        break;
      }
      case "retire-template": {
        await retireTemplate(pendingAction.item, values.reason);
        break;
      }
      default: {
        const exhaustive: never = pendingAction;
        throw new Error(`Acción no soportada: ${String(exhaustive)}`);
      }
    }
  };

  const actionDialog = pendingAction
    ? getActionDialogCopy(pendingAction)
    : undefined;

  return (
    <main className="space-y-6">
      <header className="rounded-[2rem] border bg-card/80 p-6">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Ecosistema de cartas
        </p>
        <h1 className="mt-2 font-black text-3xl tracking-tight">
          Autoría y gobernanza
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
          Crea personajes y Series reutilizables, prepara plantillas con arte
          administrado y publica solo cuando las variantes renderizadas estén
          completas.
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border bg-card/70 p-5">
          <h2 className="font-bold text-xl">Nuevo personaje</h2>
          <form className="mt-4 grid gap-4" onSubmit={createCharacter}>
            <div className="grid gap-2">
              <Label htmlFor="card-character-name">Nombre curado</Label>
              <Input
                id="card-character-name"
                onChange={(event) => setCharacterName(event.target.value)}
                required
                value={characterName}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="card-game-name">Juego</Label>
              <Input
                id="card-game-name"
                onChange={(event) => setGameName(event.target.value)}
                required
                value={gameName}
              />
            </div>
            <Button type="submit">Guardar personaje</Button>
          </form>
          <ul className="mt-5 space-y-2 border-t pt-4 text-sm">
            {data.characters.map((item) => (
              <li
                className="flex items-center justify-between gap-3"
                key={item.id}
              >
                <span>
                  {item.characterName} · {item.gameName}
                </span>
                {item.lifecycle === "retired" ? (
                  <span className="text-muted-foreground text-xs">
                    Retirado
                  </span>
                ) : (
                  <Button
                    onClick={() =>
                      setPendingAction({ item, type: "retire-character" })
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Retirar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border bg-card/70 p-5">
          <h2 className="font-bold text-xl">Nueva Serie</h2>
          <form className="mt-4 grid gap-4" onSubmit={createSeries}>
            <div className="grid gap-2">
              <Label htmlFor="card-series-name">Nombre</Label>
              <Input
                id="card-series-name"
                onChange={(event) => setSeriesName(event.target.value)}
                required
                value={seriesName}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="card-series-description">Descripción</Label>
              <Textarea
                id="card-series-description"
                onChange={(event) => setSeriesDescription(event.target.value)}
                value={seriesDescription}
              />
            </div>
            <Button type="submit">Guardar Serie</Button>
          </form>
          <ul className="mt-5 space-y-2 border-t pt-4 text-sm">
            {data.series.map((item) => (
              <li
                className="flex items-center justify-between gap-3"
                key={item.id}
              >
                <span>{item.name}</span>
                {item.lifecycle === "retired" ? (
                  <span className="text-muted-foreground text-xs">
                    Retirada
                  </span>
                ) : (
                  <Button
                    onClick={() =>
                      setPendingAction({ item, type: "retire-series" })
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Retirar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border bg-card/70 p-5">
        <h2 className="font-bold text-xl">
          {template.id
            ? "Editar borrador de plantilla"
            : "Borrador de plantilla"}
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Selecciona el retrato aquí. La imagen se subirá al guardar el
          borrador, no antes.
        </p>
        <form
          className="mt-4 grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            templateForm.handleSubmit();
          }}
        >
          <templateForm.AppForm>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Personaje"
                options={data.characters.map((item) => ({
                  label: `${item.characterName} · ${item.gameName}`,
                  value: item.id,
                }))}
                value={template.characterId}
                onChange={(value) =>
                  setTemplate((current) => ({ ...current, characterId: value }))
                }
              />
              <SelectField
                label="Serie"
                options={data.series.map((item) => ({
                  label: item.name,
                  value: item.id,
                }))}
                value={template.seriesId}
                onChange={(value) =>
                  setTemplate((current) => ({ ...current, seriesId: value }))
                }
              />
              <SelectField
                label="Rareza"
                options={RARITIES.map(([value, label]) => ({ label, value }))}
                value={template.rarity}
                onChange={(value) =>
                  setTemplate((current) => ({
                    ...current,
                    rarity: value as CardRarity,
                  }))
                }
              />
              <SelectField
                label="Efecto registrado"
                options={[
                  { label: "Sin efecto", value: "none" },
                  { label: "Brillo holográfico", value: "holographic-shimmer" },
                  { label: "Estrellas suaves", value: "starlight-drift" },
                  { label: "Pulso de brasas", value: "ember-pulse" },
                ]}
                value={template.effect}
                onChange={(value) =>
                  setTemplate((current) => ({
                    ...current,
                    effect: value as CardEffect,
                  }))
                }
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="Edición (opcional)"
                onChange={(value) =>
                  setTemplate((current) => ({ ...current, edition: value }))
                }
                value={template.edition}
              />
              <TextField
                label="Techo vitalicio (opcional)"
                onChange={(value) =>
                  setTemplate((current) => ({
                    ...current,
                    lifetimeSupplyCeiling: value,
                  }))
                }
                value={template.lifetimeSupplyCeiling}
              />
              <templateForm.AppField name="portraitSelection">
                {(field) => (
                  <field.MediaField
                    allowAnimated={false}
                    className="col-span-1"
                    description="Selecciona o prepara el retrato. Los archivos nuevos se suben únicamente al guardar el borrador."
                    label="Imagen de retrato"
                    maxItems={1}
                    ownerKind="Carta"
                    required
                  />
                )}
              </templateForm.AppField>
              <SelectField
                label="Marco code-defined"
                options={[
                  { label: "Predeterminado", value: "default" },
                  { label: "Cósmico", value: "cosmic" },
                  { label: "Deshabilitado", value: "disabled" },
                ]}
                value={template.frameKey}
                onChange={(value) =>
                  setTemplate((current) => ({
                    ...current,
                    frameKey: value as CardFrame,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="card-template-description">Descripción</Label>
              <Textarea
                id="card-template-description"
                onChange={(event) =>
                  setTemplate((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                value={template.description}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  !template.characterId ||
                  !template.seriesId ||
                  portraitSelection.length === 0
                }
                type="submit"
              >
                {template.id ? "Guardar cambios" : "Guardar borrador"}
              </Button>
              {template.id ? (
                <Button
                  onClick={cancelTemplateEdit}
                  type="button"
                  variant="outline"
                >
                  Cancelar edición
                </Button>
              ) : null}
            </div>
          </templateForm.AppForm>
        </form>
      </section>

      <section className="rounded-2xl border bg-card/70 p-5">
        <h2 className="font-bold text-xl">Plantillas</h2>
        {data.templates.length === 0 ? (
          <p className="mt-4 text-muted-foreground text-sm">
            No hay plantillas todavía.
          </p>
        ) : (
          <ul className="mt-4 divide-y">
            {data.templates.map((item) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                key={item.id}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Image
                    alt={`Retrato de ${item.characterName}`}
                    className="h-16 w-12 shrink-0 rounded object-cover"
                    height={64}
                    src={getBucketUrl(item.portraitObjectKey)}
                    width={48}
                  />
                  <span className="min-w-0">
                    <strong className="block truncate">
                      {item.characterName} · {item.seriesName}
                    </strong>
                    <span className="text-muted-foreground text-sm">
                      {item.edition ? `${item.edition} · ` : ""}
                      {item.rarity} · {item.lifecycle} · v{item.version}
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.lifecycle === "draft" ? (
                    <>
                      <Button
                        onClick={() => editTemplate(item)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Editar borrador
                      </Button>
                      <Button
                        onClick={() => publishTemplate(item)}
                        size="sm"
                        type="button"
                      >
                        Publicar
                      </Button>
                    </>
                  ) : null}
                  {item.availability === "active" &&
                  item.lifecycle === "active" ? (
                    <Button
                      onClick={() =>
                        setPendingAction({ item, type: "disable-template" })
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Deshabilitar
                    </Button>
                  ) : null}
                  {item.availability === "disabled" ? (
                    <Button
                      onClick={() =>
                        setPendingAction({ item, type: "restore-template" })
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Restaurar
                    </Button>
                  ) : null}
                  {item.lifecycle === "active" || item.lifecycle === "draft" ? (
                    <Button
                      onClick={() =>
                        setPendingAction({ item, type: "retire-template" })
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {item.lifecycle === "draft" ? "Descartar" : "Retirar"}
                    </Button>
                  ) : null}
                  {item.mintedSupply > 0 ? (
                    <Button
                      onClick={() =>
                        setPendingAction({ item, type: "correct-template" })
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Corregir presentación
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {pendingAction && actionDialog ? (
        <OperationalActionDialog
          description={actionDialog.description}
          details={actionDialog.details}
          key={`${pendingAction.type}:${pendingAction.item.id}`}
          onClose={() => setPendingAction(undefined)}
          onSubmit={submitPendingAction}
          submitLabel={actionDialog.submitLabel}
          title={actionDialog.title}
        />
      ) : null}
    </main>
  );
}

function getActionDialogCopy(action: PendingAction): {
  description: string;
  details?: { defaultValue: string; label: string };
  submitLabel: string;
  title: string;
} {
  switch (action.type) {
    case "correct-template": {
      return {
        description:
          "La corrección actualizará la presentación de las instancias existentes y quedará registrada en la auditoría.",
        details: {
          defaultValue: action.item.description,
          label: "Descripción corregida",
        },
        submitLabel: "Aplicar corrección",
        title: "Corregir presentación de carta",
      };
    }
    case "disable-template": {
      return {
        description:
          "La carta dejará de estar disponible para nuevas adquisiciones sin alterar la custodia existente.",
        submitLabel: "Deshabilitar carta",
        title: "Deshabilitar carta",
      };
    }
    case "restore-template": {
      return {
        description:
          "La carta volverá a estar disponible para las fuentes de adquisición habilitadas.",
        submitLabel: "Restaurar carta",
        title: "Restaurar carta",
      };
    }
    case "retire-character": {
      return {
        description: `El personaje ${action.item.characterName} dejará de estar disponible para nuevas plantillas.`,
        submitLabel: "Retirar personaje",
        title: "Retirar personaje",
      };
    }
    case "retire-series": {
      return {
        description: `La Serie ${action.item.name} dejará de estar disponible para nuevas plantillas.`,
        submitLabel: "Retirar Serie",
        title: "Retirar Serie",
      };
    }
    case "retire-template": {
      if (action.item.lifecycle === "draft") {
        return {
          description:
            "El borrador quedará archivado y conservará su auditoría; no podrá publicarse ni editarse.",
          submitLabel: "Descartar borrador",
          title: "Descartar borrador de carta",
        };
      }
      return {
        description:
          "La carta quedará retirada para nuevas adquisiciones; las instancias existentes conservarán su historial.",
        submitLabel: "Retirar carta",
        title: "Retirar carta",
      };
    }
    default: {
      const exhaustive: never = action;
      throw new Error(`Acción no soportada: ${String(exhaustive)}`);
    }
  }
}

function TextField({
  label,
  onChange,
  required,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  const id = `card-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        value={value}
      />
    </div>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select
        items={options}
        onValueChange={(next) => {
          if (typeof next === "string") {
            onChange(next);
          }
        }}
        value={value}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
