"use client";

import type { PackDrawGroupDraft } from "@repo/shared/collectibles";
import { useState } from "react";
import { toast } from "sonner";

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
import { orpcClient } from "@/lib/orpc";

import { OperationalActionDialog } from "../operational-action-dialog";

type InitialData = {
  templates: Awaited<
    ReturnType<typeof orpcClient.collectiblesAdmin.packs.templates.list>
  >;
};

const DEFAULT_GROUPS = JSON.stringify(
  [
    {
      order: 1,
      drawCount: 1,
      rarityWeights: [{ rarity: "common", weight: 1 }],
      cardWeights: [],
      guarantees: [],
    },
  ],
  null,
  2
);

export function PacksAdminPage({ initialData }: { initialData: InitialData }) {
  const [data, setData] = useState(initialData);
  const [template, setTemplate] = useState({
    assetMediaId: "",
    description: "",
    name: "",
  });
  const [templateEditId, setTemplateEditId] = useState<string>();
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    initialData.templates[0]?.id ?? ""
  );
  const [revisionId, setRevisionId] = useState("");
  const [revisionVersion, setRevisionVersion] = useState<number>();
  const [groupsJson, setGroupsJson] = useState(DEFAULT_GROUPS);
  const [cardCount, setCardCount] = useState("1");
  const [duplicatePolicy, setDuplicatePolicy] = useState<
    "allow" | "no-duplicates"
  >("allow");
  const [bindingPolicy, setBindingPolicy] = useState<
    "transferable" | "account-bound" | "either"
  >("either");
  const [impact, setImpact] = useState<unknown>(null);
  const [probabilities, setProbabilities] = useState<unknown>(null);
  const [simulation, setSimulation] = useState<unknown>(null);
  const [templateToRetire, setTemplateToRetire] =
    useState<InitialData["templates"][number]>();

  const reload = async () => {
    const templates = await orpcClient.collectiblesAdmin.packs.templates.list();
    setData({ templates });
    if (!selectedTemplateId && templates[0]) {
      setSelectedTemplateId(templates[0].id);
    }
  };

  const saveTemplate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      if (templateEditId) {
        const current = data.templates.find(({ id }) => id === templateEditId);
        if (!current) {
          return;
        }
        await orpcClient.collectiblesAdmin.packs.templates.saveDraft({
          draft: { ...template, id: templateEditId },
          expectedVersion: current.version,
        });
      } else {
        await orpcClient.collectiblesAdmin.packs.templates.create(template);
      }
      setTemplateEditId(undefined);
      setTemplate({ assetMediaId: "", description: "", name: "" });
      await reload();
      toast.success(templateEditId ? "Pack actualizado" : "Pack guardado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar el Pack."
      );
    }
  };

  const saveRevision = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTemplateId) {
      return;
    }
    try {
      const drawGroups = JSON.parse(groupsJson) as PackDrawGroupDraft[];
      const saved =
        await orpcClient.collectiblesAdmin.packs.revisions.saveDraft({
          templateId: selectedTemplateId,
          draft: {
            cardCount: Number(cardCount),
            duplicatePolicy,
            drawGroups,
            bindingPolicy,
            ...(revisionId ? { id: revisionId } : {}),
          },
          ...(revisionVersion ? { expectedVersion: revisionVersion } : {}),
        });
      setRevisionId(saved.id);
      setRevisionVersion(saved.version);
      toast.success("Borrador de revisión guardado");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Revisa la configuración del borrador."
      );
    }
  };

  const previewRevision = async () => {
    if (!selectedTemplateId || !revisionId) {
      return;
    }
    try {
      setImpact(
        await orpcClient.collectiblesAdmin.packs.revisions.preview({
          revisionId,
          templateId: selectedTemplateId,
        })
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo preparar el impacto."
      );
    }
  };

  const simulateRevision = async () => {
    if (!revisionId) {
      return;
    }
    try {
      setSimulation(
        await orpcClient.collectiblesAdmin.packs.revisions.simulate({
          iterations: 1000,
          revisionId,
        })
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo simular la revisión."
      );
    }
  };

  const retireTemplate = async (
    item: InitialData["templates"][number],
    reason: string
  ) => {
    await orpcClient.collectiblesAdmin.packs.templates.retire({
      expectedVersion: item.version,
      reason,
      templateId: item.id,
    });
    await reload();
    toast.success("Pack retirado; las adquisiciones existentes no cambian.");
  };

  const inspectProbabilities = async () => {
    if (!revisionId) {
      return;
    }
    try {
      setProbabilities(
        await orpcClient.collectiblesAdmin.packs.revisions.probabilities({
          revisionId,
        })
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudieron inspeccionar las probabilidades."
      );
    }
  };

  const publishRevision = async () => {
    const currentTemplate = data.templates.find(
      ({ id }) => id === selectedTemplateId
    );
    if (!currentTemplate || !revisionId || revisionVersion === undefined) {
      return;
    }
    try {
      await orpcClient.collectiblesAdmin.packs.revisions.publish({
        confirm: true,
        expectedRevisionVersion: revisionVersion,
        expectedTemplateVersion: currentTemplate.version,
        revisionId,
        templateId: selectedTemplateId,
      });
      await reload();
      toast.success(
        "Revisión publicada; las futuras adquisiciones usarán esta versión."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo publicar la revisión."
      );
    }
  };

  return (
    <main className="space-y-6">
      <header className="rounded-[2rem] border bg-card/80 p-6">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Ecosistema de cartas
        </p>
        <h1 className="mt-2 font-black text-3xl tracking-tight">
          Packs y revisiones
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
          Edita borradores, valida grupos ordenados, inspecciona agregados y
          publica una revisión inmutable. El arte usa una imagen 2D
          administrada.
        </p>
      </header>

      <section className="rounded-2xl border bg-card/70 p-5">
        <h2 className="font-bold text-xl">
          {templateEditId ? "Editar Pack Template" : "Nuevo Pack Template"}
        </h2>
        <form className="mt-4 grid gap-4" onSubmit={saveTemplate}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Nombre"
              onChange={(name) =>
                setTemplate((current) => ({ ...current, name }))
              }
              value={template.name}
            />
            <Field
              label="ID de imagen 2D administrada"
              onChange={(assetMediaId) =>
                setTemplate((current) => ({ ...current, assetMediaId }))
              }
              required
              value={template.assetMediaId}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pack-description">Descripción</Label>
            <Textarea
              id="pack-description"
              onChange={(event) =>
                setTemplate((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              value={template.description}
            />
          </div>
          <Button type="submit">Guardar Pack Template</Button>
        </form>
      </section>

      <section className="rounded-2xl border bg-card/70 p-5">
        <h2 className="font-bold text-xl">Borrador de Pack Revision</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>Pack Template</Label>
            <Select
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setSelectedTemplateId(value);
                  setRevisionId("");
                  setRevisionVersion(undefined);
                }
              }}
              value={selectedTemplateId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un Pack" />
              </SelectTrigger>
              <SelectContent>
                {data.templates.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} · v{item.version}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            label="Cantidad total de cartas (máximo 20)"
            onChange={setCardCount}
            value={cardCount}
          />
          <div className="grid gap-2">
            <Label>Duplicados</Label>
            <Select
              onValueChange={(value) => {
                if (value === "allow" || value === "no-duplicates") {
                  setDuplicatePolicy(value);
                }
              }}
              value={duplicatePolicy}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allow">Duplicados permitidos</SelectItem>
                <SelectItem value="no-duplicates">Sin duplicados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 md:max-w-md">
            <Label>Binding de la revisión</Label>
            <Select
              onValueChange={(value) => {
                if (
                  value === "transferable" ||
                  value === "account-bound" ||
                  value === "either"
                ) {
                  setBindingPolicy(value);
                }
              }}
              value={bindingPolicy}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="either">Según la adquisición</SelectItem>
                <SelectItem value="transferable">Transferible</SelectItem>
                <SelectItem value="account-bound">
                  Vinculado a la cuenta
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <form className="mt-4 grid gap-4" onSubmit={saveRevision}>
          <div className="grid gap-2">
            <Label htmlFor="pack-draw-groups">
              Draw Groups normalizados (JSON)
            </Label>
            <Textarea
              className="min-h-56 font-mono text-xs"
              id="pack-draw-groups"
              onChange={(event) => setGroupsJson(event.target.value)}
              value={groupsJson}
            />
            <p className="text-muted-foreground text-xs">
              Usa order, drawCount, rarityWeights, cardWeights y guarantees. Los
              pesos son enteros positivos; no uses porcentajes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!selectedTemplateId} type="submit">
              Guardar borrador
            </Button>
            <Button
              disabled={!revisionId}
              onClick={previewRevision}
              type="button"
              variant="outline"
            >
              Previsualizar impacto
            </Button>
            <Button
              disabled={!revisionId}
              onClick={simulateRevision}
              type="button"
              variant="outline"
            >
              Simular agregados
            </Button>
            <Button
              disabled={!revisionId}
              onClick={inspectProbabilities}
              type="button"
              variant="outline"
            >
              Inspeccionar probabilidades internas
            </Button>
            <Button
              disabled={!revisionId || revisionVersion === undefined}
              onClick={publishRevision}
              type="button"
            >
              Confirmar publicación
            </Button>
          </div>
        </form>
        {impact ? (
          <pre className="mt-4 overflow-auto rounded-xl border bg-muted/30 p-4 text-xs">
            {JSON.stringify(impact, null, 2)}
          </pre>
        ) : null}
        {simulation ? (
          <pre className="mt-4 overflow-auto rounded-xl border bg-muted/30 p-4 text-xs">
            {JSON.stringify(simulation, null, 2)}
          </pre>
        ) : null}
        {probabilities ? (
          <pre className="mt-4 overflow-auto rounded-xl border bg-muted/30 p-4 text-xs">
            {JSON.stringify(probabilities, null, 2)}
          </pre>
        ) : null}
      </section>

      <section className="rounded-2xl border bg-card/70 p-5">
        <h2 className="font-bold text-xl">
          Pack Templates publicados y en borrador
        </h2>
        <ul className="mt-4 divide-y text-sm">
          {data.templates.map((item) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 py-3"
              key={item.id}
            >
              <span>
                <strong>{item.name}</strong>
                <span className="ml-2 text-muted-foreground">
                  {item.lifecycle} · v{item.version}
                </span>
              </span>
              <Button
                onClick={() => {
                  setSelectedTemplateId(item.id);
                  setRevisionId("");
                  setRevisionVersion(undefined);
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Editar revisiones
              </Button>
              {item.lifecycle === "retired" ? null : (
                <>
                  <Button
                    onClick={() => {
                      setTemplateEditId(item.id);
                      setTemplate({
                        assetMediaId: item.assetMediaId,
                        description: item.description,
                        name: item.name,
                      });
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Editar datos
                  </Button>
                  <Button
                    onClick={() => setTemplateToRetire(item)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Retirar
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
      {templateToRetire ? (
        <OperationalActionDialog
          description="Retirar el Pack impide nuevas adquisiciones, pero no cambia las instancias existentes."
          key={templateToRetire.id}
          onClose={() => setTemplateToRetire(undefined)}
          onSubmit={({ reason }) => retireTemplate(templateToRetire, reason)}
          submitLabel="Retirar Pack"
          title={`Retirar ${templateToRetire.name}`}
        />
      ) : null}
    </main>
  );
}

function Field({
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
  const id = `pack-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
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
