"use client";

import type { CollectibleBinding } from "@repo/shared/collectibles";
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
import { formatCollectibleDateTime } from "@/lib/format-date";
import { orpcClient } from "@/lib/orpc";

import { OperationalActionDialog } from "../operational-action-dialog";
import type { OperationalActionValues } from "../operational-action-dialog";

type InitialData = {
  offers: Awaited<ReturnType<typeof orpcClient.collectiblesAdmin.shop.list>>;
  packTemplates: Awaited<
    ReturnType<typeof orpcClient.collectiblesAdmin.packs.templates.list>
  >;
};

type OfferDraft = {
  binding: CollectibleBinding;
  endsAt: string;
  packTemplateId: string;
  perAccountLimit: string;
  price: string;
  remainingSales: string;
  startsAt: string;
};

type Offer = InitialData["offers"][number];
type PendingAction =
  | { action: "disable" | "enable"; offer: Offer; type: "transition" }
  | {
      action: "reduceQuota" | "restock";
      offer: Offer;
      type: "quota";
    };

const emptyDraft: OfferDraft = {
  binding: "transferable",
  endsAt: "",
  packTemplateId: "",
  perAccountLimit: "",
  price: "1",
  remainingSales: "",
  startsAt: "",
};

export function CardShopAdminPage({
  initialData,
}: {
  initialData: InitialData;
}) {
  const [offers, setOffers] = useState(initialData.offers);
  const [draft, setDraft] = useState<OfferDraft>(emptyDraft);
  const [editingOfferId, setEditingOfferId] = useState<string>();
  const [impact, setImpact] = useState<unknown>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>();

  const reload = async () => {
    setOffers(await orpcClient.collectiblesAdmin.shop.list({ limit: 100 }));
  };

  const saveOffer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const current = offers.find(({ id }) => id === editingOfferId);
    const input = {
      ...draft,
      endsAt: toIsoOrNull(draft.endsAt),
      perAccountLimit: optionalNumber(draft.perAccountLimit),
      remainingSales: optionalNumber(draft.remainingSales),
      startsAt: toIsoOrNull(draft.startsAt),
      reason: editingOfferId
        ? "Actualización de configuración de oferta"
        : "Creación de oferta oficial",
    };
    try {
      if (editingOfferId && current) {
        await orpcClient.collectiblesAdmin.shop.update({
          ...input,
          expectedVersion: current.version,
          offerId: editingOfferId,
        });
        toast.success("Oferta actualizada con versión esperada");
      } else {
        await orpcClient.collectiblesAdmin.shop.create(input);
        toast.success("Oferta creada como borrador");
      }
      setEditingOfferId(undefined);
      setDraft(emptyDraft);
      await reload();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar la oferta."
      );
    }
  };

  const transition = async (
    offer: Offer,
    action: "disable" | "enable",
    reason: string
  ) => {
    await orpcClient.collectiblesAdmin.shop[action]({
      expectedVersion: offer.version,
      offerId: offer.id,
      reason,
    });
    await reload();
    toast.success(
      action === "enable" ? "Oferta habilitada" : "Oferta deshabilitada"
    );
  };

  const changeQuota = async (
    offer: Offer,
    action: "reduceQuota" | "restock",
    { amount, reason }: OperationalActionValues
  ) => {
    if (amount === undefined) {
      throw new Error("La cantidad es obligatoria.");
    }
    await orpcClient.collectiblesAdmin.shop[action]({
      amount,
      expectedVersion: offer.version,
      offerId: offer.id,
      reason,
    });
    await reload();
    toast.success(action === "restock" ? "Cupo repuesto" : "Cupo reducido");
  };

  const inspectImpact = async (offerId: string) => {
    try {
      setImpact(await orpcClient.collectiblesAdmin.shop.impact({ offerId }));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo cargar el impacto."
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
          Tienda oficial
        </h1>
        <p className="mt-2 max-w-3xl text-muted-foreground text-sm">
          Configura ofertas por Pack Template. Cada compra resuelve la última
          Pack Revision publicada; el precio, los cupos, las transiciones y los
          motivos quedan versionados y auditados.
        </p>
      </header>

      <section className="rounded-2xl border bg-card/70 p-5">
        <h2 className="font-bold text-xl">
          {editingOfferId ? "Editar oferta" : "Nueva oferta"}
        </h2>
        <form className="mt-4 grid gap-4" onSubmit={saveOffer}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="shop-pack-template">Tipo de pack</Label>
              <select
                className="h-10 rounded-lg border border-input bg-background px-3"
                id="shop-pack-template"
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    packTemplateId: event.target.value,
                  }))
                }
                required
                value={draft.packTemplateId}
              >
                <option value="">Selecciona un pack</option>
                {initialData.packTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="Precio entero en Eteris"
              min="1"
              onChange={(price) =>
                setDraft((current) => ({ ...current, price }))
              }
              required
              type="number"
              value={draft.price}
            />
            <div className="grid gap-2">
              <Label>Binding de la oferta</Label>
              <Select
                onValueChange={(value) => {
                  if (value === "transferable" || value === "account-bound") {
                    setDraft((current) => ({ ...current, binding: value }));
                  }
                }}
                value={draft.binding}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferable">Transferible</SelectItem>
                  <SelectItem value="account-bound">
                    Vinculado a cuenta
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field
              label="Stock restante (vacío = ilimitado)"
              min="0"
              onChange={(remainingSales) =>
                setDraft((current) => ({ ...current, remainingSales }))
              }
              type="number"
              value={draft.remainingSales}
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
          <div className="flex flex-wrap gap-3">
            <Button type="submit">
              {editingOfferId ? "Guardar cambios" : "Crear borrador"}
            </Button>
            {editingOfferId ? (
              <Button
                onClick={() => {
                  setEditingOfferId(undefined);
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
          <h2 className="font-bold text-xl">Ofertas y auditoría operativa</h2>
          <Button onClick={reload} type="button" variant="outline">
            Recargar
          </Button>
        </div>
        {offers.length === 0 ? (
          <p className="mt-4 text-muted-foreground text-sm">
            Todavía no hay ofertas.
          </p>
        ) : (
          <ul className="mt-4 divide-y">
            {offers.map((offer) => (
              <li className="space-y-3 py-4" key={offer.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{offer.packTemplateId}</p>
                    <p className="text-muted-foreground text-sm">
                      {offer.price} Eteris · {offer.binding} · versión{" "}
                      {offer.version}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {offer.enabled ? "Habilitada" : "Deshabilitada"} ·{" "}
                      {offer.remainingSales === null
                        ? "stock ilimitado"
                        : `${offer.remainingSales} restantes`}{" "}
                      ·{" "}
                      {offer.startsAt
                        ? formatCollectibleDateTime(offer.startsAt)
                        : "sin inicio"}
                    </p>
                  </div>
                  <span className="rounded-full border px-2 py-1 text-xs">
                    {offer.totalSold} vendidos
                  </span>
                </div>
                <p className="rounded-xl bg-amber-500/10 p-3 text-amber-900 text-xs dark:text-amber-200">
                  Advertencia: publicar una nueva Pack Revision cambia la
                  revisión usada por las compras futuras de esta oferta.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => inspectImpact(offer.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Ver impacto
                  </Button>
                  <Button
                    onClick={() => {
                      setEditingOfferId(offer.id);
                      setDraft(fromOffer(offer));
                    }}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Editar
                  </Button>
                  <Button
                    onClick={() =>
                      setPendingAction({
                        action: offer.enabled ? "disable" : "enable",
                        offer,
                        type: "transition",
                      })
                    }
                    size="sm"
                    type="button"
                  >
                    {offer.enabled ? "Deshabilitar" : "Habilitar"}
                  </Button>
                  {offer.remainingSales === null ? null : (
                    <>
                      <Button
                        onClick={() =>
                          setPendingAction({
                            action: "restock",
                            offer,
                            type: "quota",
                          })
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Reponer
                      </Button>
                      <Button
                        onClick={() =>
                          setPendingAction({
                            action: "reduceQuota",
                            offer,
                            type: "quota",
                          })
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Reducir cupo
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {impact ? (
          <pre className="mt-4 overflow-auto rounded-xl border bg-muted/30 p-4 text-xs">
            {JSON.stringify(impact, null, 2)}
          </pre>
        ) : null}
      </section>
      {pendingAction ? (
        <OperationalActionDialog
          amountLabel={
            pendingAction.type === "quota" ? "Cantidad de Packs" : undefined
          }
          description={
            pendingAction.type === "quota"
              ? "La operación modifica el cupo disponible y quedará registrada en la auditoría."
              : "La transición cambia si esta oferta puede vender Packs y requiere una justificación auditable."
          }
          key={`${pendingAction.type}:${pendingAction.action}:${pendingAction.offer.id}`}
          onClose={() => setPendingAction(undefined)}
          onSubmit={(values) =>
            pendingAction.type === "quota"
              ? changeQuota(pendingAction.offer, pendingAction.action, values)
              : transition(
                  pendingAction.offer,
                  pendingAction.action,
                  values.reason
                )
          }
          submitLabel={
            pendingAction.action === "enable"
              ? "Habilitar oferta"
              : pendingAction.action === "disable"
                ? "Deshabilitar oferta"
                : pendingAction.action === "restock"
                  ? "Reponer cupo"
                  : "Reducir cupo"
          }
          title="Confirmar operación de tienda"
        />
      ) : null}
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
  const id = `shop-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
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

function toIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}

// Only an empty field means "unlimited". A typed 0 is a real value: zero
// remaining stock (sold out) and a per-account limit of exactly one pack.
function optionalNumber(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

function fromOffer(offer: InitialData["offers"][number]): OfferDraft {
  return {
    binding: offer.binding,
    endsAt: toLocalDateTime(offer.endsAt),
    packTemplateId: offer.packTemplateId,
    perAccountLimit: offer.perAccountLimit?.toString() ?? "",
    price: offer.price,
    remainingSales: offer.remainingSales?.toString() ?? "",
    startsAt: toLocalDateTime(offer.startsAt),
  };
}

function toLocalDateTime(value: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
