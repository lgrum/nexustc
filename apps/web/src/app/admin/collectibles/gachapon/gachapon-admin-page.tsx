"use client";

import type { CollectibleBinding } from "@repo/shared/collectibles";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orpcClient } from "@/lib/orpc";

type InitialMachine = Awaited<
  ReturnType<typeof orpcClient.collectiblesAdmin.gacha.list>
>[number];

type MachineDraft = {
  binding: CollectibleBinding;
  cost: string;
  description: string;
  endsAt: string;
  entries: string;
  globalQuota: string;
  name: string;
  perAccountLimit: string;
  startsAt: string;
};

type TransitionRequest = {
  machineId: string;
  state: "active" | "paused" | "retired";
};

const emptyDraft: MachineDraft = {
  binding: "transferable",
  cost: "1",
  description: "",
  endsAt: "",
  entries: "[]",
  globalQuota: "",
  name: "",
  perAccountLimit: "",
  startsAt: "",
};

export function GachaponAdminPage({
  initialMachines,
}: {
  initialMachines: InitialMachine[];
}) {
  const [machines, setMachines] = useState(initialMachines);
  const [draft, setDraft] = useState<MachineDraft>(emptyDraft);
  const [editingMachineId, setEditingMachineId] = useState<string>();
  const [transitionReason, setTransitionReason] = useState("");
  const [transitionRequest, setTransitionRequest] =
    useState<TransitionRequest | null>(null);

  const reload = async () => {
    setMachines(await orpcClient.collectiblesAdmin.gacha.list({ limit: 100 }));
  };

  const saveMachine = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const current = machines.find(({ id }) => id === editingMachineId);
    let entries: { packTemplateId: string; weight: number }[];
    try {
      const parsed: unknown = JSON.parse(draft.entries);
      if (!Array.isArray(parsed)) {
        throw new TypeError("entries");
      }
      entries = parsed.map((entry) => {
        if (
          !entry ||
          typeof entry !== "object" ||
          typeof entry.packTemplateId !== "string" ||
          !Number.isInteger(entry.weight) ||
          entry.weight < 1
        ) {
          throw new Error("entries");
        }
        return {
          packTemplateId: entry.packTemplateId.trim(),
          weight: entry.weight,
        };
      });
    } catch {
      toast.error(
        'Las entradas deben ser un JSON como [{"packTemplateId":"pack-1","weight":10}].'
      );
      return;
    }
    const input = {
      binding: draft.binding,
      cost: draft.cost,
      description: draft.description,
      endsAt: toIsoOrNull(draft.endsAt),
      entries,
      globalQuota: positiveOrNull(draft.globalQuota),
      name: draft.name,
      perAccountLimit: positiveOrNull(draft.perAccountLimit),
      reason: editingMachineId
        ? "Actualización de configuración de máquina"
        : "Creación de máquina Gachapon",
      startsAt: toIsoOrNull(draft.startsAt),
    };
    try {
      if (editingMachineId && current) {
        await orpcClient.collectiblesAdmin.gacha.update({
          ...input,
          expectedVersion: current.version,
          machineId: editingMachineId,
        });
        toast.success("Máquina actualizada con versión esperada.");
      } else {
        await orpcClient.collectiblesAdmin.gacha.create(input);
        toast.success("Máquina creada como borrador.");
      }
      setEditingMachineId(undefined);
      setDraft(emptyDraft);
      await reload();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la máquina."
      );
    }
  };

  const requestTransition = (
    machine: InitialMachine,
    state: TransitionRequest["state"]
  ) => {
    setTransitionReason("");
    setTransitionRequest({ machineId: machine.id, state });
  };

  const transition = async (
    machine: InitialMachine,
    state: "active" | "paused" | "retired"
  ) => {
    const reason = transitionReason.trim();
    if (reason.length < 3) {
      toast.error("Indica un motivo de al menos 3 caracteres.");
      return;
    }
    try {
      await orpcClient.collectiblesAdmin.gacha.transition({
        expectedVersion: machine.version,
        idempotencyKey: `gacha-transition:${machine.id}:${machine.version}:${state}`,
        machineId: machine.id,
        reason,
        state,
      });
      await reload();
      setTransitionReason("");
      setTransitionRequest(null);
      toast.success("Transición de máquina registrada.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "La máquina cambió; recarga e intenta de nuevo."
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
          Máquinas Gachapon
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
          Configura máquinas que pesan Pack Templates, nunca cartas ni rarezas.
          El pool queda congelado al activar y cada transición exige versión
          esperada, motivo y auditoría.
        </p>
      </header>

      <section className="rounded-2xl border bg-card/70 p-5">
        <h2 className="font-bold text-xl">
          {editingMachineId ? "Editar máquina" : "Nueva máquina"}
        </h2>
        <form className="mt-4 grid gap-4" onSubmit={saveMachine}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Nombre en español"
              onChange={(name) => setDraft((current) => ({ ...current, name }))}
              required
              value={draft.name}
            />
            <Field
              label="Coste entero en Eteris"
              min="1"
              onChange={(cost) => setDraft((current) => ({ ...current, cost }))}
              required
              type="number"
              value={draft.cost}
            />
            <Field
              label="Binding"
              onChange={(binding) => {
                if (binding === "transferable" || binding === "account-bound") {
                  setDraft((current) => ({ ...current, binding }));
                }
              }}
              value={draft.binding}
            />
            <Field
              label="Cupo global (vacío = ilimitado)"
              min="1"
              onChange={(globalQuota) =>
                setDraft((current) => ({ ...current, globalQuota }))
              }
              type="number"
              value={draft.globalQuota}
            />
            <Field
              label="Límite por cuenta (vacío = ilimitado)"
              min="1"
              onChange={(perAccountLimit) =>
                setDraft((current) => ({ ...current, perAccountLimit }))
              }
              type="number"
              value={draft.perAccountLimit}
            />
            <Field
              label="Inicio"
              onChange={(startsAt) =>
                setDraft((current) => ({ ...current, startsAt }))
              }
              type="datetime-local"
              value={draft.startsAt}
            />
            <Field
              label="Fin (opcional)"
              onChange={(endsAt) =>
                setDraft((current) => ({ ...current, endsAt }))
              }
              type="datetime-local"
              value={draft.endsAt}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gachapon-description">Descripción en español</Label>
            <textarea
              className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm"
              id="gachapon-description"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              value={draft.description}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gachapon-entries">
              Pack Templates y pesos internos (JSON)
            </Label>
            <textarea
              className="min-h-28 rounded-md border bg-background px-3 py-2 font-mono text-sm"
              id="gachapon-entries"
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  entries: event.target.value,
                }))
              }
              value={draft.entries}
            />
            <p className="text-muted-foreground text-xs">
              Los pesos son positivos, enteros y solo se muestran a personal
              autorizado. La interfaz pública nunca muestra odds exactas.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit">
              {editingMachineId ? "Guardar cambios" : "Crear borrador"}
            </Button>
            {editingMachineId ? (
              <Button
                onClick={() => {
                  setEditingMachineId(undefined);
                  setDraft(emptyDraft);
                }}
                type="button"
                variant="outline"
              >
                Cancelar edición
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border bg-card/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-xl">Máquinas y estados</h2>
          <Button onClick={reload} type="button" variant="outline">
            Recargar
          </Button>
        </div>
        {machines.length === 0 ? (
          <p className="mt-4 text-muted-foreground text-sm">
            Todavía no hay máquinas configuradas.
          </p>
        ) : (
          <ul className="mt-4 divide-y">
            {machines.map((machine) => (
              <li className="space-y-3 py-4" key={machine.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{machine.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {machine.cost} Eteris · {machine.binding} · versión{" "}
                      {machine.version}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Estado: {machine.state} · {machine.entries.length} Pack
                      Templates ponderados
                    </p>
                  </div>
                  <span className="rounded-full border px-2 py-1 text-xs">
                    {machine.totalActivations} activaciones
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      setEditingMachineId(machine.id);
                      setDraft(fromMachine(machine));
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Editar
                  </Button>
                  {machine.state === "draft" || machine.state === "paused" ? (
                    <Button
                      onClick={() => requestTransition(machine, "active")}
                      size="sm"
                      type="button"
                    >
                      Activar / reanudar
                    </Button>
                  ) : null}
                  {machine.state === "active" ? (
                    <Button
                      onClick={() => requestTransition(machine, "paused")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Pausar
                    </Button>
                  ) : null}
                  {machine.state === "retired" ? null : (
                    <Button
                      onClick={() => requestTransition(machine, "retired")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Retirar
                    </Button>
                  )}
                </div>
                {transitionRequest?.machineId === machine.id ? (
                  <div className="grid gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <Label htmlFor={`gachapon-transition-reason-${machine.id}`}>
                      Motivo de la transición
                    </Label>
                    <Input
                      id={`gachapon-transition-reason-${machine.id}`}
                      onChange={(event) =>
                        setTransitionReason(event.target.value)
                      }
                      placeholder="Describe el cambio operativo"
                      value={transitionReason}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() =>
                          transition(
                            machine,
                            transitionRequest?.state ?? "active"
                          )
                        }
                        size="sm"
                        type="button"
                      >
                        Confirmar transición
                      </Button>
                      <Button
                        onClick={() => {
                          setTransitionReason("");
                          setTransitionRequest(null);
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Field({
  label,
  min,
  onChange,
  required,
  type = "text",
  value,
}: {
  label: string;
  min?: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  value: string;
}) {
  const id = `gachapon-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        value={value}
      />
    </div>
  );
}

function fromMachine(machine: InitialMachine): MachineDraft {
  return {
    binding: machine.binding,
    cost: machine.cost,
    description: machine.description,
    endsAt: toLocalDateTime(machine.endsAt),
    entries: JSON.stringify(machine.entries, null, 2),
    globalQuota: machine.globalQuota?.toString() ?? "",
    name: machine.name,
    perAccountLimit: machine.perAccountLimit?.toString() ?? "",
    startsAt: toLocalDateTime(machine.startsAt),
  };
}

function positiveOrNull(value: string) {
  return value ? Number(value) : null;
}

function toIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function toLocalDateTime(value: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
