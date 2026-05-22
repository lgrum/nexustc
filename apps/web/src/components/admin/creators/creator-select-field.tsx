import { useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import { CreatorCreateDialog } from "@/components/admin/creators/creator-create-dialog";
import { HasPermissions } from "@/components/auth/has-role";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTypedAppFormContext } from "@/hooks/use-app-form";
import type { orpcClient } from "@/lib/orpc";
import { orpc } from "@/lib/orpc";
import { getBucketUrl } from "@/lib/utils";

type CreatorListItem = Awaited<
  ReturnType<typeof orpcClient.creator.admin.list>
>[number];

type CreatorFormValues = {
  creatorId: string | null;
  creatorLink: string;
  creatorName: string;
};

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (words.length === 0) {
    return "CR";
  }

  return words.map((word) => word[0]?.toUpperCase() ?? "").join("");
}

export function CreatorSelectField() {
  const form = useTypedAppFormContext({
    defaultValues: {} as CreatorFormValues,
  });
  const { data: creators } = useSuspenseQuery(
    orpc.creator.admin.list.queryOptions()
  );
  const creatorId = useStore(form.store, (state) => state.values.creatorId);
  const creatorLink = useStore(form.store, (state) => state.values.creatorLink);
  const creatorName = useStore(form.store, (state) => state.values.creatorName);
  const [creatorDialogOpen, setCreatorDialogOpen] = useState(false);
  const [creatorSearch, setCreatorSearch] = useState("");
  const selectedCreator =
    creators.find((item) => item.id === creatorId) ?? null;
  const deferredCreatorSearch = useDeferredValue(creatorSearch);
  const normalizedCreatorSearch = deferredCreatorSearch.trim().toLowerCase();
  const filteredCreators = creators.filter((item) => {
    if (normalizedCreatorSearch === "") {
      return true;
    }

    return (
      item.name.toLowerCase().includes(normalizedCreatorSearch) ||
      item.url.toLowerCase().includes(normalizedCreatorSearch)
    );
  });

  const handleCreatorSelect = (creatorItem: CreatorListItem) => {
    form.setFieldValue("creatorId", creatorItem.id);
    form.setFieldValue("creatorLink", creatorItem.url);
    form.setFieldValue("creatorName", creatorItem.name);
    setCreatorSearch("");
    setCreatorDialogOpen(false);
  };

  const clearCreatorSelection = () => {
    form.setFieldValue("creatorId", null);
    form.setFieldValue("creatorLink", "");
    form.setFieldValue("creatorName", "");
  };

  return (
    <section className="col-span-2 space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-medium text-sm">Creador</h3>
          <p className="text-muted-foreground text-sm">
            Selecciona un creador existente o registra uno nuevo sin salir del
            contenido.
          </p>
        </div>
        {selectedCreator ? (
          <Button onClick={clearCreatorSelection} type="button" variant="ghost">
            Quitar
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/80 p-3">
        <Avatar className="size-14" size="lg">
          {selectedCreator?.media?.objectKey ? (
            <AvatarImage
              alt={selectedCreator.name}
              src={getBucketUrl(selectedCreator.media.objectKey)}
            />
          ) : null}
          <AvatarFallback>{getInitials(creatorName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-medium text-sm">
            {creatorName || "Ningun creador seleccionado"}
          </div>
          <p className="truncate text-muted-foreground text-sm">
            {creatorLink ||
              "Selecciona un creador para vincular soporte y avatar."}
          </p>
          {creatorId === null && creatorName.trim() !== "" ? (
            <p className="text-amber-600 text-xs">
              Este contenido tiene datos de creador cargados, pero todavia no
              esta vinculado a un registro reusable.
            </p>
          ) : null}
        </div>
        <Dialog
          onOpenChange={(open) => {
            setCreatorDialogOpen(open);

            if (!open) {
              setCreatorSearch("");
            }
          }}
          open={creatorDialogOpen}
        >
          <DialogTrigger render={<Button type="button" variant="outline" />}>
            {selectedCreator ? "Cambiar" : "Seleccionar"}
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Seleccionar creador</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex justify-end">
                <HasPermissions permissions={{ creators: ["create"] }}>
                  <CreatorCreateDialog
                    buttonLabel="Nuevo creador"
                    initialName={creatorName}
                    initialUrl={creatorLink}
                    key={`${creatorName}:${creatorLink}`}
                    onCreated={handleCreatorSelect}
                  />
                </HasPermissions>
              </div>
              <div className="space-y-2">
                <Label htmlFor="creator-search">Buscar creador</Label>
                <Input
                  id="creator-search"
                  onChange={(event) => {
                    setCreatorSearch(event.target.value);
                  }}
                  placeholder="Busca por nombre o URL"
                  type="search"
                  value={creatorSearch}
                />
              </div>
              <div className="max-h-96 min-w-0 space-y-2 overflow-y-auto">
                {filteredCreators.length > 0 ? (
                  filteredCreators.map((creatorItem) => (
                    <button
                      className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-background p-3 text-left transition-colors hover:bg-muted/60"
                      key={creatorItem.id}
                      onClick={() => handleCreatorSelect(creatorItem)}
                      type="button"
                    >
                      <Avatar className="size-12" size="lg">
                        {creatorItem.media?.objectKey ? (
                          <AvatarImage
                            alt={creatorItem.name}
                            src={getBucketUrl(creatorItem.media.objectKey)}
                          />
                        ) : null}
                        <AvatarFallback>
                          {getInitials(creatorItem.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="w-0 flex-1 overflow-hidden">
                        <div className="truncate font-medium text-sm">
                          {creatorItem.name}
                        </div>
                        <div className="truncate text-muted-foreground text-sm">
                          {creatorItem.url}
                        </div>
                      </div>
                      <div className="shrink-0 text-muted-foreground text-xs">
                        {creatorItem.usageCount} contenido
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground text-sm">
                    {creators.length === 0
                      ? "Aun no hay creadores cargados."
                      : "No hay creadores que coincidan con la busqueda."}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
