import { NameUrlCreateDialog } from "@/components/admin/name-url-create-dialog";
import type { orpcClient } from "@/lib/orpc";
import { orpc } from "@/lib/orpc";

type TranslatorListItem = Awaited<
  ReturnType<typeof orpcClient.translator.admin.list>
>[number];

type TranslatorCreateDialogProps = {
  buttonLabel?: string;
  initialName?: string;
  initialUrl?: string;
  onCreated?: (translator: TranslatorListItem) => void;
};

export function TranslatorCreateDialog({
  buttonLabel = "Crear traductor",
  initialName = "",
  initialUrl = "",
  onCreated,
}: TranslatorCreateDialogProps) {
  return (
    <NameUrlCreateDialog
      buttonLabel={buttonLabel}
      dialogTitle="Nuevo traductor"
      errorLabel="Error al crear traductor"
      initialName={initialName}
      initialUrl={initialUrl}
      loadingMessage="Creando traductor..."
      mutationOptions={orpc.translator.admin.create.mutationOptions()}
      namePlaceholder="Nombre del traductor"
      onCreated={onCreated}
      queryOptions={orpc.translator.admin.list.queryOptions()}
      saveLabel="Guardar traductor"
      successMessage="Traductor creado."
    />
  );
}
