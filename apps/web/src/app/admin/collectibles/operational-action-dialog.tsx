"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type OperationalActionValues = {
  amount?: number;
  details?: string;
  reason: string;
};

export function OperationalActionDialog({
  amountLabel,
  description,
  details,
  onClose,
  onSubmit,
  submitLabel,
  title,
}: {
  amountLabel?: string;
  description: string;
  details?: { defaultValue: string; label: string };
  onClose: () => void;
  onSubmit: (values: OperationalActionValues) => Promise<void>;
  submitLabel: string;
  title: string;
}) {
  const [amount, setAmount] = useState("1");
  const [detailsValue, setDetailsValue] = useState(details?.defaultValue ?? "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedReason = reason.trim();
    const normalizedAmount = amountLabel ? Number(amount) : undefined;
    if (!normalizedReason) {
      return;
    }
    if (
      normalizedAmount !== undefined &&
      (!Number.isInteger(normalizedAmount) || normalizedAmount <= 0)
    ) {
      toast.error("La cantidad debe ser un número entero mayor que cero.");
      return;
    }

    setSubmitting(true);
    let completed = false;
    try {
      await onSubmit({
        ...(normalizedAmount === undefined ? {} : { amount: normalizedAmount }),
        ...(details ? { details: detailsValue } : {}),
        reason: normalizedReason,
      });
      completed = true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo completar la operación."
      );
    } finally {
      setSubmitting(false);
    }
    if (completed) {
      onClose();
    }
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          return;
        }
        onClose();
      }}
      open
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          {amountLabel ? (
            <div className="grid gap-2">
              <Label htmlFor="collectible-action-amount">{amountLabel}</Label>
              <Input
                id="collectible-action-amount"
                inputMode="numeric"
                min="1"
                onChange={(event) => setAmount(event.target.value)}
                required
                type="number"
                value={amount}
              />
            </div>
          ) : null}
          {details ? (
            <div className="grid gap-2">
              <Label htmlFor="collectible-action-details">
                {details.label}
              </Label>
              <Textarea
                id="collectible-action-details"
                onChange={(event) => setDetailsValue(event.target.value)}
                value={detailsValue}
              />
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="collectible-action-reason">Motivo</Label>
            <Textarea
              autoFocus
              id="collectible-action-reason"
              onChange={(event) => setReason(event.target.value)}
              required
              value={reason}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={submitting}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              Cancelar
            </Button>
            <Button disabled={submitting} type="submit">
              {submitting ? "Procesando…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
