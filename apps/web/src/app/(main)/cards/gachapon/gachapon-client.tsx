"use client";

import type {
  GachaponActivationResult,
  GachaponPublicMachine,
} from "@repo/shared/collectibles";
import { collectibleBindingLabel } from "@repo/shared/collectibles";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCollectibleDateTime } from "@/lib/format-date";
import { orpc } from "@/lib/orpc";

export function GachaponClient({
  initialMachines,
}: {
  initialMachines: GachaponPublicMachine[];
}) {
  const queryClient = useQueryClient();
  const machinesQuery = useQuery({
    ...orpc.gacha.list.queryOptions(),
    initialData: initialMachines,
    staleTime: 30_000,
  });
  const activationMutation = useMutation(orpc.gacha.activate.mutationOptions());
  const [selectedMachine, setSelectedMachine] =
    useState<GachaponPublicMachine | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<GachaponActivationResult | null>(null);
  const idempotencyKeys = useRef(new Map<string, string>());
  const machines = machinesQuery.data ?? [];

  const activate = async () => {
    if (!selectedMachine) {
      return;
    }
    const machine = selectedMachine;
    const key = `${machine.id}:${machine.version}:${machine.cost}`;
    const idempotencyKey =
      idempotencyKeys.current.get(key) ?? `gachapon-${crypto.randomUUID()}`;
    idempotencyKeys.current.set(key, idempotencyKey);
    setMessage(null);
    try {
      const result = await activationMutation.mutateAsync({
        expectedCost: machine.cost,
        expectedMachineVersion: machine.version,
        idempotencyKey,
        machineId: machine.id,
      });
      setReceipt(result);
      setSelectedMachine(null);
      idempotencyKeys.current.delete(key);
      await queryClient.invalidateQueries(orpc.gacha.list.queryOptions());
    } catch (error) {
      const candidate = error as { code?: string; message?: string };
      setMessage(
        candidate.message ??
          "No se pudo activar la máquina. Actualiza la disponibilidad e inténtalo nuevamente."
      );
      if (
        candidate.code === "CONFLICT" ||
        /versión|coste|clave de activación/i.test(candidate.message ?? "")
      ) {
        const refreshed = await machinesQuery.refetch();
        const current = refreshed.data?.find(({ id }) => id === machine.id);
        if (current) {
          setSelectedMachine(current);
        }
      }
    }
  };

  return (
    <main className="container space-y-8 py-10">
      <header className="max-w-3xl space-y-3">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Adquisición oficial
        </p>
        <h1 className="font-black text-4xl tracking-tight">Gachapon</h1>
        <p className="text-muted-foreground">
          Cada activación selecciona un Pack Template de la máquina y emite un
          único Pack sin abrir. Mostramos los Packs posibles y su última
          revisión publicada, pero no odds exactas, pesos numéricos ni cartas
          ocultas.
        </p>
      </header>

      {machinesQuery.isLoading ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          Cargando máquinas…
        </p>
      ) : machinesQuery.error ? (
        <section
          aria-live="polite"
          className="rounded-2xl border border-destructive/40 bg-destructive/5 p-8 text-center text-destructive"
        >
          <p>No pudimos cargar las máquinas.</p>
          <Button className="mt-4" onClick={() => machinesQuery.refetch()}>
            Reintentar
          </Button>
        </section>
      ) : machines.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          No hay máquinas disponibles en este momento. Vuelve pronto.
        </p>
      ) : (
        <ul className="grid gap-5 lg:grid-cols-2">
          {machines.map((machine) => (
            <MachineCard
              key={machine.id}
              machine={machine}
              onActivate={() => {
                setMessage(null);
                setReceipt(null);
                setSelectedMachine(machine);
              }}
            />
          ))}
        </ul>
      )}

      {selectedMachine ? (
        <section
          aria-labelledby="gachapon-confirmation-title"
          className="rounded-3xl border border-primary/40 bg-primary/5 p-6"
        >
          <h2 className="font-bold text-xl" id="gachapon-confirmation-title">
            Confirma tu activación
          </h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Se descontarán exactamente {selectedMachine.cost} Eteris y recibirás
            un Pack sin abrir. La máquina se encuentra en la versión{" "}
            {selectedMachine.version}; el servidor comprobará de nuevo el coste,
            cupo y disponibilidad antes de cobrar.
          </p>
          {message ? (
            <p
              aria-live="polite"
              className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-amber-900 text-sm dark:text-amber-200"
            >
              {message}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-3">
            <Button disabled={activationMutation.isPending} onClick={activate}>
              {activationMutation.isPending
                ? "Procesando…"
                : "Confirmar activación"}
            </Button>
            <Button
              disabled={activationMutation.isPending}
              onClick={() => setSelectedMachine(null)}
              variant="outline"
            >
              Cancelar
            </Button>
          </div>
        </section>
      ) : null}

      {receipt ? <ActivationReceipt receipt={receipt} /> : null}
    </main>
  );
}

function MachineCard({
  machine,
  onActivate,
}: {
  machine: GachaponPublicMachine;
  onActivate: () => void;
}) {
  const canActivate = machine.availability === "available";
  return (
    <li className="space-y-4 rounded-3xl border bg-card/70 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-2xl">{machine.name}</h2>
          <p className="mt-1 text-muted-foreground text-sm">
            {machine.description || "Máquina Gachapon oficial."}
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 font-bold text-primary">
          {machine.cost} Eteris
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Info label="Disponibilidad" value={availabilityLabel(machine)} />
        <Info label="Binding" value={bindingLabel(machine.binding)} />
        <Info
          label="Cupo global"
          value={
            machine.remainingGlobalActivations === null
              ? "Ilimitado"
              : `${machine.remainingGlobalActivations} activaciones restantes`
          }
        />
        <Info
          label="Límite por cuenta"
          value={machine.perAccountLimit?.toString() ?? "Ilimitado"}
        />
      </dl>
      <div>
        <h3 className="font-semibold text-sm">Packs posibles</h3>
        <ul className="mt-2 grid gap-2">
          {machine.entries.map((entry) => (
            <li
              className="rounded-xl bg-muted/50 p-3 text-sm"
              key={entry.packTemplateId}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{entry.name}</span>
                <span className="text-muted-foreground text-xs">
                  {entry.latestRevision
                    ? `Revisión ${entry.latestRevision.revision}`
                    : "Sin revisión pública"}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                {entry.description || "Pack coleccionable oficial."}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <p className="rounded-xl bg-muted/50 p-3 text-muted-foreground text-xs">
        La selección y el resultado se generan exclusivamente en el servidor. No
        se muestran pesos, odds ni cartas ocultas.
      </p>
      <Button className="w-full" disabled={!canActivate} onClick={onActivate}>
        {canActivate ? "Activar máquina" : availabilityLabel(machine)}
      </Button>
    </li>
  );
}

function ActivationReceipt({ receipt }: { receipt: GachaponActivationResult }) {
  return (
    <section
      aria-live="polite"
      className="rounded-3xl border border-emerald-500/40 bg-emerald-500/5 p-6"
    >
      <h2 className="font-bold text-xl">Activación confirmada</h2>
      <p className="mt-2 text-muted-foreground text-sm">
        Recibiste un Pack sin abrir por {receipt.chargedCost} Eteris.
      </p>
      <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <Info label="Activación" value={receipt.activationId} />
        <Info label="Pack emitido" value={receipt.packInstanceId} />
        <Info label="Transacción Eteris" value={receipt.transactionId} />
      </dl>
      <p className="mt-4 text-muted-foreground text-xs">
        El resultado oculto permanece dentro del Pack hasta que decidas abrirlo.
      </p>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function bindingLabel(binding: GachaponPublicMachine["binding"]) {
  return collectibleBindingLabel(binding);
}

function availabilityLabel(machine: GachaponPublicMachine) {
  if (machine.availability === "paused") {
    return "Pausada";
  }
  if (machine.availability === "scheduled") {
    return machine.startsAt
      ? `Comienza ${formatCollectibleDateTime(machine.startsAt)}`
      : "Programada";
  }
  if (machine.availability === "exhausted") {
    return "Agotada";
  }
  if (machine.availability === "unavailable") {
    return "No disponible";
  }
  return "Disponible ahora";
}
