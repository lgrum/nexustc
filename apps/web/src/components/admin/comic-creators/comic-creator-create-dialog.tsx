import { NameUrlCreateDialog } from "@/components/admin/name-url-create-dialog";
import type { orpcClient } from "@/lib/orpc";
import { orpc } from "@/lib/orpc";

type ComicCreatorListItem = Awaited<
  ReturnType<typeof orpcClient.comicCreator.admin.list>
>[number];

type ComicCreatorCreateDialogProps = {
  buttonLabel?: string;
  initialName?: string;
  initialUrl?: string;
  onCreated?: (creator: ComicCreatorListItem) => void;
};

export function ComicCreatorCreateDialog({
  buttonLabel = "Crear creador",
  initialName = "",
  initialUrl = "",
  onCreated,
}: ComicCreatorCreateDialogProps) {
  return (
    <NameUrlCreateDialog
      buttonLabel={buttonLabel}
      dialogTitle="Nuevo creador de comic"
      errorLabel="Error al crear creador"
      initialName={initialName}
      initialUrl={initialUrl}
      loadingMessage="Creando creador..."
      mutationOptions={orpc.comicCreator.admin.create.mutationOptions()}
      namePlaceholder="Nombre del creador"
      onCreated={onCreated}
      queryOptions={orpc.comicCreator.admin.list.queryOptions()}
      requireUrl={false}
      saveLabel="Guardar creador"
      successMessage="Creador creado."
    />
  );
}
