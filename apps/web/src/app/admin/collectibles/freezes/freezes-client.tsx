"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";

type AssetKind = "card" | "pack";
type Action = "freeze" | "restore";

function retryKey(prefix: string) {
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}`;
  return `collectibles-admin:${prefix}:${id}`;
}

export function CollectibleFreezesClient() {
  const [assetId, setAssetId] = useState("");
  const [assetKind, setAssetKind] = useState<AssetKind>("card");
  const [custody, setCustody] = useState<"retain" | "release">("retain");
  const [expectedVersion, setExpectedVersion] = useState("1");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const keys = useRef<Record<Action, string | null>>({
    freeze: null,
    restore: null,
  });
  const freezeCard = useMutation(
    orpc.collectiblesAdmin.freezes.cardInstances.freeze.mutationOptions()
  );
  const restoreCard = useMutation(
    orpc.collectiblesAdmin.freezes.cardInstances.restore.mutationOptions()
  );
  const freezePack = useMutation(
    orpc.collectiblesAdmin.freezes.packInstances.freeze.mutationOptions()
  );
  const restorePack = useMutation(
    orpc.collectiblesAdmin.freezes.packInstances.restore.mutationOptions()
  );
  const pending =
    freezeCard.isPending ||
    restoreCard.isPending ||
    freezePack.isPending ||
    restorePack.isPending;

  async function submit(action: Action) {
    const normalizedReason = reason.trim();
    const version = Number(expectedVersion);
    if (
      !assetId.trim() ||
      normalizedReason.length < 3 ||
      !Number.isInteger(version) ||
      version < 1
    ) {
      setMessage(
        "Completa activo, versión positiva y un motivo de al menos 3 caracteres."
      );
      return;
    }
    keys.current[action] ??= retryKey(`${assetKind}-${action}`);
    const input = {
      assetId: assetId.trim(),
      custody,
      expectedVersion: version,
      idempotencyKey: keys.current[action]!,
      reason: normalizedReason,
    };
    try {
      const mutation =
        assetKind === "card"
          ? action === "freeze"
            ? freezeCard
            : restoreCard
          : action === "freeze"
            ? freezePack
            : restorePack;
      await mutation.mutateAsync(input);
      keys.current[action] = null;
      setMessage(
        action === "freeze"
          ? "Activo congelado y auditado."
          : "Activo restaurado y auditado."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo completar la operación; puedes reintentar con la misma clave."
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Congelar o restaurar un activo</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit("freeze");
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="collectible-freeze-kind">Tipo de activo</Label>
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                id="collectible-freeze-kind"
                onChange={(event) =>
                  setAssetKind(event.target.value as AssetKind)
                }
                value={assetKind}
              >
                <option value="card">Carta</option>
                <option value="pack">Pack</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="collectible-freeze-asset">ID del activo</Label>
              <Input
                id="collectible-freeze-asset"
                onChange={(event) => setAssetId(event.target.value)}
                required
                value={assetId}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="collectible-freeze-version">
                Versión esperada
              </Label>
              <Input
                id="collectible-freeze-version"
                min={1}
                onChange={(event) => setExpectedVersion(event.target.value)}
                required
                type="number"
                value={expectedVersion}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="collectible-freeze-custody">
                Custodia al congelar
              </Label>
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                id="collectible-freeze-custody"
                onChange={(event) =>
                  setCustody(event.target.value as "retain" | "release")
                }
                value={custody}
              >
                <option value="retain">Conservar custodia</option>
                <option value="release">
                  Liberar y cerrar la operación padre
                </option>
              </select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="collectible-freeze-reason">Motivo</Label>
            <Textarea
              id="collectible-freeze-reason"
              minLength={3}
              onChange={(event) => setReason(event.target.value)}
              required
              value={reason}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} loading={pending} type="submit">
              Congelar
            </Button>
            <Button
              disabled={pending}
              onClick={() => void submit("restore")}
              type="button"
              variant="outline"
            >
              Restaurar
            </Button>
          </div>
          <p aria-live="polite" className="text-muted-foreground text-sm">
            {message ??
              "Cada acción usa una clave de reintento estable hasta confirmarse."}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
