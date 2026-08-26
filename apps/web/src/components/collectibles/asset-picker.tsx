"use client";

import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";

export type CollectibleAssetOption = {
  assetId: string;
  characterName?: string;
  edition?: string | null;
  gameName?: string;
  kind: "card" | "pack";
  mintNumber?: number | null;
  rarity?: string;
  seriesName?: string;
  templateName?: string;
};

export function collectibleAssetName(asset: CollectibleAssetOption) {
  if (asset.kind === "pack") {
    return asset.templateName ?? "Pack sin abrir";
  }
  return asset.characterName ?? "Carta coleccionable";
}

function assetDescription(asset: CollectibleAssetOption) {
  if (asset.kind === "pack") {
    return "Pack sin abrir";
  }
  return [
    asset.seriesName,
    asset.edition,
    asset.mintNumber ? `Mint #${asset.mintNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function AssetPicker({
  emptyMessage = "No hay coleccionables disponibles.",
  label,
  loading = false,
  max = 50,
  onChange,
  options,
  selected,
}: {
  emptyMessage?: string;
  label: string;
  loading?: boolean;
  max?: number;
  onChange: (assets: CollectibleAssetOption[]) => void;
  options: CollectibleAssetOption[];
  selected: CollectibleAssetOption[];
}) {
  const [search, setSearch] = useState("");
  const selectedKeys = new Set(
    selected.map((asset) => `${asset.kind}:${asset.assetId}`)
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    if (!query) {
      return options;
    }
    return options.filter((asset) =>
      [
        collectibleAssetName(asset),
        asset.seriesName,
        asset.edition,
        asset.gameName,
        asset.rarity,
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("es").includes(query))
    );
  }, [options, search]);

  return (
    <fieldset className="space-y-3 rounded-2xl border p-4">
      <legend className="px-1 font-bold">{label}</legend>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {selected.length}/{max} seleccionados
        </span>
        {selected.length ? (
          <button
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => onChange([])}
            type="button"
          >
            Quitar todos
          </button>
        ) : null}
      </div>
      <Input
        aria-label={`Buscar en ${label}`}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar por personaje, serie o pack"
        type="search"
        value={search}
      />
      {loading ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-dashed p-4 text-muted-foreground text-sm"
        >
          Cargando tu inventario…
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-muted-foreground text-sm">
          {search ? "No hay resultados para esta búsqueda." : emptyMessage}
        </p>
      ) : (
        <ul className="grid max-h-96 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {filtered.map((asset) => {
            const key = `${asset.kind}:${asset.assetId}`;
            const checked = selectedKeys.has(key);
            return (
              <li key={key}>
                <button
                  aria-pressed={checked}
                  className="min-h-16 w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary/10"
                  disabled={!checked && selected.length >= max}
                  onClick={() =>
                    onChange(
                      checked
                        ? selected.filter(
                            (item) => `${item.kind}:${item.assetId}` !== key
                          )
                        : [...selected, asset]
                    )
                  }
                  type="button"
                >
                  <span className="block font-semibold">
                    {collectibleAssetName(asset)}
                  </span>
                  <span className="block text-muted-foreground text-xs">
                    {assetDescription(asset) ||
                      (asset.kind === "card" ? "Carta" : "Pack sin abrir")}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
