import {
  Cancel01Icon,
  PlusSignIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useStore } from "@tanstack/react-form";
import { useDeferredValue, useMemo, useState } from "react";

import { ErrorField } from "@/components/forms/error-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTypedAppFormContext } from "@/hooks/use-app-form";

type SeriesOption = {
  id: string;
  title: string;
  type: "post" | "comic";
};

type SeriesFormValues = {
  seriesId: string | null;
  seriesOrder: number;
  seriesTitle: string;
};

type SeriesFieldProps = {
  contentLabel: string;
  series: SeriesOption[];
};

export function SeriesField({ contentLabel, series }: SeriesFieldProps) {
  const form = useTypedAppFormContext({
    defaultValues: {} as SeriesFormValues,
  });
  const seriesId = useStore(form.store, (state) => state.values.seriesId);
  const seriesTitle = useStore(form.store, (state) => state.values.seriesTitle);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const deferredSearch = useDeferredValue(search);
  const normalizedSearch = deferredSearch.trim().toLocaleLowerCase("es");
  const selectedSeries = series.find((item) => item.id === seriesId) ?? null;
  const selectedLabel = selectedSeries?.title ?? seriesTitle.trim();
  const hasSeries = selectedLabel !== "";
  const filteredSeries = useMemo(() => {
    if (normalizedSearch === "") {
      return series;
    }

    return series.filter((item) =>
      item.title.toLocaleLowerCase("es").includes(normalizedSearch)
    );
  }, [normalizedSearch, series]);

  const closeDialog = () => {
    setDialogOpen(false);
    setSearch("");
    setNewSeriesTitle("");
  };

  const selectSeries = (item: SeriesOption) => {
    form.setFieldValue("seriesId", item.id);
    form.setFieldValue("seriesTitle", "");
    closeDialog();
  };

  const createSeries = () => {
    const title = newSeriesTitle.trim();

    if (title === "") {
      return;
    }

    form.setFieldValue("seriesId", null);
    form.setFieldValue("seriesTitle", title);
    closeDialog();
  };

  const clearSeries = () => {
    form.setFieldValue("seriesId", null);
    form.setFieldValue("seriesTitle", "");
    form.setFieldValue("seriesOrder", 0);
  };

  return (
    <section className="col-span-2 space-y-4 rounded-2xl border border-border/70 bg-muted/30 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1">
          <h3 className="font-medium text-sm">Serie</h3>
          <p className="text-muted-foreground text-sm">
            Agrupa {contentLabel}s relacionados y define el orden de esta parte.
          </p>
        </div>
        {hasSeries ? (
          <Button onClick={clearSeries} type="button" variant="ghost">
            <HugeiconsIcon className="size-4" icon={Cancel01Icon} />
            Quitar
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="space-y-2">
          <Label>Serie seleccionada</Label>
          <div className="flex gap-2">
            <div className="min-h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
              {hasSeries ? (
                <span>{selectedLabel}</span>
              ) : (
                <span className="text-muted-foreground">Sin serie</span>
              )}
            </div>
            <Dialog
              onOpenChange={(open) => {
                setDialogOpen(open);

                if (!open) {
                  setSearch("");
                  setNewSeriesTitle("");
                }
              }}
              open={dialogOpen}
            >
              <DialogTrigger
                render={<Button type="button" variant="outline" />}
              >
                {hasSeries ? "Cambiar" : "Seleccionar"}
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Seleccionar serie</DialogTitle>
                </DialogHeader>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="series-search">Buscar serie</Label>
                    <div className="relative">
                      <HugeiconsIcon
                        className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground"
                        icon={Search01Icon}
                      />
                      <Input
                        className="pl-9"
                        id="series-search"
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Busca por nombre"
                        type="search"
                        value={search}
                      />
                    </div>
                  </div>

                  <div className="max-h-72 space-y-2 overflow-y-auto">
                    {filteredSeries.length > 0 ? (
                      filteredSeries.map((item) => (
                        <button
                          className="flex w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-background p-3 text-left transition-colors hover:bg-muted/60"
                          key={item.id}
                          onClick={() => selectSeries(item)}
                          type="button"
                        >
                          <span className="font-medium text-sm">
                            {item.title}
                          </span>
                          {item.id === seriesId ? (
                            <span className="text-muted-foreground text-xs">
                              Seleccionada
                            </span>
                          ) : null}
                        </button>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground text-sm">
                        {series.length === 0
                          ? "Aun no hay series cargadas."
                          : "No hay series que coincidan con la busqueda."}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-3">
                    <Label htmlFor="new-series-title">Nueva serie</Label>
                    <div className="flex gap-2">
                      <Input
                        id="new-series-title"
                        onChange={(event) =>
                          setNewSeriesTitle(event.target.value)
                        }
                        placeholder="Nombre de la serie"
                        value={newSeriesTitle}
                      />
                      <Button
                        disabled={newSeriesTitle.trim() === ""}
                        onClick={createSeries}
                        type="button"
                      >
                        <HugeiconsIcon className="size-4" icon={PlusSignIcon} />
                        Crear
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <FieldDescription>
            Puedes elegir una serie existente o crear una nueva al guardar.
          </FieldDescription>
        </div>

        <form.AppField name="seriesOrder">
          {(field) => (
            <div className="space-y-2">
              <Label htmlFor={field.name}>Orden</Label>
              <Input
                disabled={!hasSeries}
                id={field.name}
                min={0}
                onChange={(event) =>
                  field.handleChange(Number(event.target.value) || 0)
                }
                step={1}
                type="number"
                value={String(field.state.value ?? 0)}
              />
              <FieldDescription>Ejemplo: 1, 2, 3...</FieldDescription>
              <ErrorField field={field} />
            </div>
          )}
        </form.AppField>
      </div>
    </section>
  );
}
