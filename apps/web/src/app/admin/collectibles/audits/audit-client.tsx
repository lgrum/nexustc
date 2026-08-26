"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCollectibleDateTime } from "@/lib/format-date";
import { orpc } from "@/lib/orpc";
import type { orpcClient } from "@/lib/orpc";

type Audit = Awaited<
  ReturnType<typeof orpcClient.collectiblesAdmin.audit.list>
>;
type Action =
  | "cancel"
  | "correct"
  | "disable"
  | "exceptional-grant"
  | "exceptional-transfer"
  | "freeze"
  | "publish-impact"
  | "release-custody"
  | "restore"
  | "retain-custody"
  | "retire"
  | "reverse-eteris";
type TargetKind =
  | "card-instance"
  | "card-template"
  | "eteris-transaction"
  | "gachapon-machine"
  | "gift-offer"
  | "grant-campaign"
  | "market-listing"
  | "pack-instance"
  | "pack-revision"
  | "pack-template"
  | "shop-offer"
  | "trade-offer";

const PAGE_SIZE = 25;

export function CollectibleAuditClient({
  initialAudit,
}: {
  initialAudit: Audit;
}) {
  const [draftAction, setDraftAction] = useState<Action | "">("");
  const [draftTargetKind, setDraftTargetKind] = useState<TargetKind | "">("");
  const [draftTargetId, setDraftTargetId] = useState("");
  const [action, setAction] = useState<Action | "">("");
  const [targetKind, setTargetKind] = useState<TargetKind | "">("");
  const [targetId, setTargetId] = useState("");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors.at(-1);
  const input = {
    cursor,
    limit: PAGE_SIZE,
    ...(action ? { action } : {}),
    ...(targetId.trim() ? { targetId: targetId.trim() } : {}),
    ...(targetKind ? { targetKind } : {}),
  };
  const audit = useQuery({
    ...orpc.collectiblesAdmin.audit.list.queryOptions({ input }),
    initialData:
      !action && !targetKind && !targetId.trim() && cursors.length === 1
        ? initialAudit
        : undefined,
  });
  const data = audit.data ?? { items: [], nextCursor: null };

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAction(draftAction);
    setTargetKind(draftTargetKind);
    setTargetId(draftTargetId.trim());
    setCursors([undefined]);
  }

  return (
    <div className="grid gap-4">
      <form
        aria-label="Filtros de auditoría"
        className="grid gap-4 rounded-lg border p-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
        onSubmit={applyFilters}
      >
        <div className="grid gap-2">
          <Label htmlFor="collectible-audit-action">Acción</Label>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            id="collectible-audit-action"
            onChange={(event) =>
              setDraftAction(event.target.value as Action | "")
            }
            value={draftAction}
          >
            <option value="">Todas</option>
            <option value="freeze">Congelar</option>
            <option value="restore">Restaurar</option>
            <option value="disable">Deshabilitar</option>
            <option value="cancel">Cancelar</option>
            <option value="correct">Corregir</option>
            <option value="exceptional-grant">Emisión excepcional</option>
            <option value="exceptional-transfer">
              Transferencia excepcional
            </option>
            <option value="reverse-eteris">Reversión Eteris</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="collectible-audit-target-kind">Objetivo</Label>
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            id="collectible-audit-target-kind"
            onChange={(event) =>
              setDraftTargetKind(event.target.value as TargetKind | "")
            }
            value={draftTargetKind}
          >
            <option value="">Todos</option>
            <option value="card-instance">Carta</option>
            <option value="pack-instance">Pack</option>
            <option value="card-template">Plantilla de carta</option>
            <option value="pack-revision">Revisión de Pack</option>
            <option value="shop-offer">Oferta de tienda</option>
            <option value="gachapon-machine">Máquina Gachapon</option>
            <option value="market-listing">Publicación de mercado</option>
            <option value="trade-offer">Intercambio</option>
            <option value="gift-offer">Regalo</option>
            <option value="eteris-transaction">Transacción Eteris</option>
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="collectible-audit-target-id">ID objetivo</Label>
          <Input
            id="collectible-audit-target-id"
            onChange={(event) => setDraftTargetId(event.target.value)}
            value={draftTargetId}
          />
        </div>
        <Button type="submit">Aplicar filtros</Button>
      </form>
      {audit.isError ? (
        <p className="text-destructive" role="alert">
          No se pudo cargar la auditoría.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">
            Acciones administrativas sin resultados de Packs no abiertos
          </caption>
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="p-3 font-medium">Fecha</th>
              <th className="p-3 font-medium">Acción</th>
              <th className="p-3 font-medium">Objetivo</th>
              <th className="p-3 font-medium">Motivo</th>
              <th className="p-3 font-medium">Versión</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item) => (
              <tr className="border-b last:border-0" key={item.actionId}>
                <td className="p-3">
                  {formatCollectibleDateTime(item.createdAt)}
                </td>
                <td className="p-3">{item.action}</td>
                <td className="p-3">{item.targetKind}</td>
                <td className="max-w-sm p-3">{item.reason}</td>
                <td className="p-3">{item.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.items.length && !audit.isLoading ? (
          <p className="p-6 text-center text-muted-foreground">
            No hay acciones para estos filtros.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-muted-foreground text-sm">
          Página {cursors.length} · {data.items.length} acciones
        </p>
        <div className="flex gap-2">
          <Button
            disabled={cursors.length === 1 || audit.isFetching}
            onClick={() => setCursors((current) => current.slice(0, -1))}
            type="button"
            variant="outline"
          >
            Más recientes
          </Button>
          <Button
            disabled={!data.nextCursor || audit.isFetching}
            onClick={() => {
              if (data.nextCursor) {
                setCursors((current) => [
                  ...current,
                  data.nextCursor ?? undefined,
                ]);
              }
            }}
            type="button"
            variant="outline"
          >
            Más antiguos
          </Button>
        </div>
      </div>
    </div>
  );
}
