"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { orpcClient } from "@/lib/orpc";

type Props = {
  currentPublishedRevisionId: string | null;
  isProtectedDefault: boolean;
  itemId: string;
  lifecycle: "active" | "archived" | "disabled" | "draft";
  onChanged: () => Promise<unknown>;
  revisionId: string;
  state: "draft" | "published";
};

export function CatalogLifecycleActions(props: Props) {
  const [pending, setPending] = useState<{
    action: (reason: string) => Promise<unknown>;
    confirmMessage: string;
    destructive?: boolean;
    label: string;
    title: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const isCurrent = props.currentPublishedRevisionId === props.revisionId;

  const run = async () => {
    if (!(pending && reason.trim())) {
      return;
    }
    setWorking(true);
    try {
      await pending.action(reason.trim());
      await props.onChanged();
      toast.success(pending.label);
      setPending(null);
      setReason("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "La acción no pudo completarse."
      );
    } finally {
      setWorking(false);
    }
  };

  if (props.isProtectedDefault) {
    return null;
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {isCurrent && props.lifecycle === "active" ? (
        <Button
          disabled={working}
          onClick={() =>
            setPending({
              action: (actionReason) =>
                orpcClient.profileCatalogAdmin.lifecycle.archive({
                  itemId: props.itemId,
                  reason: actionReason,
                }),
              confirmMessage:
                "Se impedirán nuevas selecciones y adquisiciones.",
              label: "Elemento archivado",
              title: "Archivar elemento",
            })
          }
          size="sm"
          variant="outline"
        >
          Archivar
        </Button>
      ) : null}
      {isCurrent && ["active", "archived"].includes(props.lifecycle) ? (
        <Button
          disabled={working}
          onClick={() =>
            setPending({
              action: (actionReason) =>
                orpcClient.profileCatalogAdmin.lifecycle.disable({
                  itemId: props.itemId,
                  reason: actionReason,
                }),
              confirmMessage:
                "Dejará de renderizar para todas las cuentas de inmediato.",
              destructive: true,
              label: "Elemento deshabilitado globalmente",
              title: "Deshabilitar globalmente",
            })
          }
          size="sm"
          variant="destructive"
        >
          Deshabilitar
        </Button>
      ) : null}
      {isCurrent && ["archived", "disabled"].includes(props.lifecycle) ? (
        <Button
          disabled={working}
          onClick={() =>
            setPending({
              action: (actionReason) =>
                orpcClient.profileCatalogAdmin.lifecycle.restore({
                  itemId: props.itemId,
                  reason: actionReason,
                }),
              confirmMessage: "Volverá a estar activo inmediatamente.",
              label: "Elemento restaurado",
              title: "Restaurar elemento",
            })
          }
          size="sm"
          variant="outline"
        >
          Restaurar
        </Button>
      ) : null}
      {props.state === "published" && !isCurrent ? (
        <Button
          disabled={working}
          onClick={() =>
            setPending({
              action: (actionReason) =>
                orpcClient.profileCatalogAdmin.lifecycle.rollback({
                  itemId: props.itemId,
                  reason: actionReason,
                  revisionId: props.revisionId,
                }),
              confirmMessage:
                "Se copiará esta revisión como una nueva versión publicada.",
              label: "Revisión recuperada y publicada",
              title: "Recuperar revisión",
            })
          }
          size="sm"
          variant="outline"
        >
          Recuperar revisión
        </Button>
      ) : null}
      {props.lifecycle === "draft" && props.state === "draft" ? (
        <Button
          disabled={working}
          onClick={() =>
            setPending({
              action: (actionReason) =>
                orpcClient.profileCatalogAdmin.lifecycle.deleteDraft({
                  itemId: props.itemId,
                  reason: actionReason,
                }),
              confirmMessage:
                "Solo se eliminará si nunca fue publicado y no tiene dependencias.",
              destructive: true,
              label: "Borrador eliminado",
              title: "Eliminar borrador",
            })
          }
          size="sm"
          variant="destructive"
        >
          Eliminar borrador
        </Button>
      ) : null}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !working) {
            setPending(null);
            setReason("");
          }
        }}
        open={pending !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.confirmMessage} El motivo quedará registrado en la
              auditoría.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`catalog-reason-${props.revisionId}`}>Motivo</Label>
            <Textarea
              id={`catalog-reason-${props.revisionId}`}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Describe por qué se realiza esta acción"
              value={reason}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={working || reason.trim().length < 3}
              onClick={run}
              variant={pending?.destructive ? "destructive" : "default"}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
