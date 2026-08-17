"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { orpc } from "@/lib/orpc";

function newRetryKey(prefix: string) {
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}`;
  return `collectibles-correction:${prefix}:${id}`;
}

export function CollectibleCorrectionsClient() {
  const [grantBinding, setGrantBinding] = useState<
    "transferable" | "account-bound"
  >("transferable");
  const [grantTemplateId, setGrantTemplateId] = useState("");
  const [grantTargetUserId, setGrantTargetUserId] = useState("");
  const [grantVersion, setGrantVersion] = useState("1");
  const [grantReason, setGrantReason] = useState("");
  const [transferKind, setTransferKind] = useState<"card" | "pack">("card");
  const [transferAssetId, setTransferAssetId] = useState("");
  const [transferFromUserId, setTransferFromUserId] = useState("");
  const [transferToUserId, setTransferToUserId] = useState("");
  const [transferVersion, setTransferVersion] = useState("1");
  const [transferReason, setTransferReason] = useState("");
  const [eterisTransactionId, setEterisTransactionId] = useState("");
  const [eterisSequence, setEterisSequence] = useState("");
  const [failureCode, setFailureCode] = useState<
    "platform-timeout" | "settlement-failure" | "duplicate-attempt"
  >("settlement-failure");
  const [verifiedFailure, setVerifiedFailure] = useState(false);
  const [eterisReason, setEterisReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const keys = useRef({
    grant: null as string | null,
    transfer: null as string | null,
    eteris: null as string | null,
  });
  const grant = useMutation(
    orpc.collectiblesAdmin.corrections.exceptionalGrant.mutationOptions()
  );
  const transfer = useMutation(
    orpc.collectiblesAdmin.corrections.exceptionalTransfer.mutationOptions()
  );
  const reverseEteris = useMutation(
    orpc.collectiblesAdmin.corrections.reverseEteris.mutationOptions()
  );
  const pending =
    grant.isPending || transfer.isPending || reverseEteris.isPending;

  async function submitGrant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = grantReason.trim();
    const expectedVersion = Number(grantVersion);
    if (
      !grantTemplateId.trim() ||
      !grantTargetUserId.trim() ||
      reason.length < 3 ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 1
    ) {
      setMessage("Completa plantilla, destinatario, versión y motivo.");
      return;
    }
    keys.current.grant ??= newRetryKey("grant");
    try {
      await grant.mutateAsync({
        binding: grantBinding,
        expectedVersion,
        idempotencyKey: keys.current.grant,
        reason,
        targetUserId: grantTargetUserId.trim(),
        templateId: grantTemplateId.trim(),
      });
      keys.current.grant = null;
      setMessage("Emisión excepcional registrada respetando el suministro.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo emitir; reintenta con la misma clave."
      );
    }
  }

  async function submitTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = transferReason.trim();
    const expectedVersion = Number(transferVersion);
    if (
      !transferAssetId.trim() ||
      !transferFromUserId.trim() ||
      !transferToUserId.trim() ||
      reason.length < 3 ||
      !Number.isInteger(expectedVersion) ||
      expectedVersion < 1
    ) {
      setMessage("Completa activo, cuentas, versión y motivo.");
      return;
    }
    keys.current.transfer ??= newRetryKey("transfer");
    try {
      await transfer.mutateAsync({
        assetId: transferAssetId.trim(),
        expectedVersion,
        fromUserId: transferFromUserId.trim(),
        idempotencyKey: keys.current.transfer,
        kind: transferKind,
        reason,
        toUserId: transferToUserId.trim(),
      });
      keys.current.transfer = null;
      setMessage(
        "Transferencia de propiedad registrada sin movimiento Eteris."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo transferir; reintenta con la misma clave."
      );
    }
  }

  async function submitEteris(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = eterisReason.trim();
    if (
      !eterisTransactionId.trim() ||
      !eterisSequence.trim() ||
      reason.length < 3 ||
      !verifiedFailure
    ) {
      setMessage(
        "Confirma una falla verificada y completa transacción, secuencia y motivo."
      );
      return;
    }
    keys.current.eteris ??= newRetryKey("eteris-reversal");
    try {
      await reverseEteris.mutateAsync({
        expectedSequence: eterisSequence.trim(),
        failureCode,
        idempotencyKey: keys.current.eteris,
        reason,
        transactionId: eterisTransactionId.trim(),
        verifiedFailure: true,
      });
      keys.current.eteris = null;
      setMessage("Reversión Eteris registrada como comando separado.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo revertir; reintenta con la misma clave."
      );
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Emisión excepcional</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submitGrant}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="correction-grant-template">
                  ID de plantilla
                </Label>
                <Input
                  id="correction-grant-template"
                  onChange={(event) => setGrantTemplateId(event.target.value)}
                  required
                  value={grantTemplateId}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="correction-grant-user">ID destinatario</Label>
                <Input
                  id="correction-grant-user"
                  onChange={(event) => setGrantTargetUserId(event.target.value)}
                  required
                  value={grantTargetUserId}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="correction-grant-binding">Binding</Label>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  id="correction-grant-binding"
                  onChange={(event) =>
                    setGrantBinding(
                      event.target.value as "transferable" | "account-bound"
                    )
                  }
                  value={grantBinding}
                >
                  <option value="transferable">Transferible</option>
                  <option value="account-bound">Ligado a cuenta</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="correction-grant-version">
                  Versión esperada de plantilla
                </Label>
                <Input
                  id="correction-grant-version"
                  min={1}
                  onChange={(event) => setGrantVersion(event.target.value)}
                  required
                  type="number"
                  value={grantVersion}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="correction-grant-reason">Motivo de emisión</Label>
              <Textarea
                id="correction-grant-reason"
                minLength={3}
                onChange={(event) => setGrantReason(event.target.value)}
                required
                value={grantReason}
              />
            </div>
            <Button disabled={pending} loading={grant.isPending} type="submit">
              Emitir corrección
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transferencia excepcional de propiedad</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submitTransfer}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="correction-transfer-kind">Tipo</Label>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  id="correction-transfer-kind"
                  onChange={(event) =>
                    setTransferKind(event.target.value as "card" | "pack")
                  }
                  value={transferKind}
                >
                  <option value="card">Carta</option>
                  <option value="pack">Pack</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="correction-transfer-asset">ID del activo</Label>
                <Input
                  id="correction-transfer-asset"
                  onChange={(event) => setTransferAssetId(event.target.value)}
                  required
                  value={transferAssetId}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="correction-transfer-from">
                  Propietario actual
                </Label>
                <Input
                  id="correction-transfer-from"
                  onChange={(event) =>
                    setTransferFromUserId(event.target.value)
                  }
                  required
                  value={transferFromUserId}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="correction-transfer-to">
                  Nuevo propietario
                </Label>
                <Input
                  id="correction-transfer-to"
                  onChange={(event) => setTransferToUserId(event.target.value)}
                  required
                  value={transferToUserId}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="correction-transfer-version">
                  Versión esperada de activo
                </Label>
                <Input
                  id="correction-transfer-version"
                  min={1}
                  onChange={(event) => setTransferVersion(event.target.value)}
                  required
                  type="number"
                  value={transferVersion}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="correction-transfer-reason">
                Motivo de transferencia
              </Label>
              <Textarea
                id="correction-transfer-reason"
                minLength={3}
                onChange={(event) => setTransferReason(event.target.value)}
                required
                value={transferReason}
              />
            </div>
            <Button
              disabled={pending}
              loading={transfer.isPending}
              type="submit"
            >
              Transferir propiedad
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reversión Eteris verificada</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submitEteris}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="correction-eteris-transaction">
                  ID de transacción
                </Label>
                <Input
                  id="correction-eteris-transaction"
                  onChange={(event) =>
                    setEterisTransactionId(event.target.value)
                  }
                  required
                  value={eterisTransactionId}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="correction-eteris-sequence">
                  Secuencia esperada
                </Label>
                <Input
                  id="correction-eteris-sequence"
                  min={1}
                  onChange={(event) => setEterisSequence(event.target.value)}
                  required
                  type="number"
                  value={eterisSequence}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="correction-eteris-failure">
                  Falla verificada
                </Label>
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  id="correction-eteris-failure"
                  onChange={(event) =>
                    setFailureCode(
                      event.target.value as
                        | "platform-timeout"
                        | "settlement-failure"
                        | "duplicate-attempt"
                    )
                  }
                  value={failureCode}
                >
                  <option value="platform-timeout">
                    Timeout de plataforma
                  </option>
                  <option value="settlement-failure">
                    Falla de liquidación
                  </option>
                  <option value="duplicate-attempt">Intento duplicado</option>
                </select>
              </div>
            </div>
            <label
              className="flex items-start gap-2 text-sm"
              htmlFor="correction-eteris-verified"
            >
              <input
                checked={verifiedFailure}
                id="correction-eteris-verified"
                onChange={(event) => setVerifiedFailure(event.target.checked)}
                type="checkbox"
              />
              Confirmo que la falla fue verificada por la plataforma.
            </label>
            <div className="grid gap-2">
              <Label htmlFor="correction-eteris-reason">
                Motivo de reversión
              </Label>
              <Textarea
                id="correction-eteris-reason"
                minLength={3}
                onChange={(event) => setEterisReason(event.target.value)}
                required
                value={eterisReason}
              />
            </div>
            <Button
              disabled={pending || !verifiedFailure}
              loading={reverseEteris.isPending}
              type="submit"
              variant="destructive"
            >
              Revertir Eteris
            </Button>
          </form>
        </CardContent>
      </Card>
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {message ??
          "Las transferencias no modifican Eteris; las reversiones no modifican propiedad."}
      </p>
    </div>
  );
}
