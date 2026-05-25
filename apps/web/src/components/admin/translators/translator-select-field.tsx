import { useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import { TranslatorCreateDialog } from "@/components/admin/translators/translator-create-dialog";
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

type TranslatorListItem = Awaited<
  ReturnType<typeof orpcClient.translator.admin.list>
>[number];

type TranslatorFormValues = {
  translatorId: string | null;
};

export function TranslatorSelectField() {
  const form = useTypedAppFormContext({
    defaultValues: {} as TranslatorFormValues,
  });
  const { data: translators } = useSuspenseQuery(
    orpc.translator.admin.list.queryOptions()
  );
  const translatorId = useStore(
    form.store,
    (state) => state.values.translatorId
  );
  const [translatorDialogOpen, setTranslatorDialogOpen] = useState(false);
  const [translatorSearch, setTranslatorSearch] = useState("");
  const selectedTranslator =
    translators.find((item) => item.id === translatorId) ?? null;
  const deferredTranslatorSearch = useDeferredValue(translatorSearch);
  const normalizedTranslatorSearch = deferredTranslatorSearch
    .trim()
    .toLowerCase();
  const filteredTranslators = translators.filter((item) => {
    if (normalizedTranslatorSearch === "") {
      return true;
    }

    return (
      item.name.toLowerCase().includes(normalizedTranslatorSearch) ||
      item.url.toLowerCase().includes(normalizedTranslatorSearch)
    );
  });

  const handleTranslatorSelect = (translatorItem: TranslatorListItem) => {
    form.setFieldValue("translatorId", translatorItem.id);
    setTranslatorSearch("");
    setTranslatorDialogOpen(false);
  };

  const clearTranslatorSelection = () => {
    form.setFieldValue("translatorId", null);
  };

  return (
    <section className="col-span-2 space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-medium text-sm">Traductor</h3>
          <p className="text-muted-foreground text-sm">
            Selecciona un traductor existente o registra uno nuevo para este
            comic.
          </p>
        </div>
        {selectedTranslator ? (
          <Button
            onClick={clearTranslatorSelection}
            type="button"
            variant="ghost"
          >
            Quitar
          </Button>
        ) : null}
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/80 p-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-medium text-sm">
            {selectedTranslator?.name || "Ningun traductor seleccionado"}
          </div>
          <p className="truncate text-muted-foreground text-sm">
            {selectedTranslator?.url ||
              "Selecciona un traductor para vincular su URL."}
          </p>
        </div>
        <Dialog
          onOpenChange={(open) => {
            setTranslatorDialogOpen(open);

            if (!open) {
              setTranslatorSearch("");
            }
          }}
          open={translatorDialogOpen}
        >
          <DialogTrigger render={<Button type="button" variant="outline" />}>
            {selectedTranslator ? "Cambiar" : "Seleccionar"}
          </DialogTrigger>
          <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Seleccionar traductor</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex justify-end">
                <TranslatorCreateDialog
                  buttonLabel="Nuevo traductor"
                  key={translatorSearch}
                  onCreated={handleTranslatorSelect}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="translator-search">Buscar traductor</Label>
                <Input
                  id="translator-search"
                  onChange={(event) => {
                    setTranslatorSearch(event.target.value);
                  }}
                  placeholder="Busca por nombre o URL"
                  type="search"
                  value={translatorSearch}
                />
              </div>
              <div className="max-h-96 min-w-0 space-y-2 overflow-y-auto">
                {filteredTranslators.length > 0 ? (
                  filteredTranslators.map((translatorItem) => (
                    <button
                      className="flex w-full min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-background p-3 text-left transition-colors hover:bg-muted/60"
                      key={translatorItem.id}
                      onClick={() => handleTranslatorSelect(translatorItem)}
                      type="button"
                    >
                      <div className="w-0 flex-1 overflow-hidden">
                        <div className="truncate font-medium text-sm">
                          {translatorItem.name}
                        </div>
                        <div className="truncate text-muted-foreground text-sm">
                          {translatorItem.url}
                        </div>
                      </div>
                      <div className="shrink-0 text-muted-foreground text-xs">
                        {translatorItem.usageCount} comics
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground text-sm">
                    {translators.length === 0
                      ? "Aun no hay traductores cargados."
                      : "No hay traductores que coincidan con la busqueda."}
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
