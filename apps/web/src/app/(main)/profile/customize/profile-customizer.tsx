"use client";

import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  ComputerIcon,
  DragDropVerticalIcon,
  FloppyDiskIcon,
  Search01Icon,
  Cancel01Icon,
  Add01Icon,
  SmartPhone01Icon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { PublicProfile } from "@repo/api/services/profile";
import { PATRON_TIERS } from "@repo/shared/constants";
import type {
  EffectiveProfileShowcase,
  FavoriteGameProjection,
  FavoriteGamesEditorState,
  ProfileCustomizationDraft,
  ProfileCustomizationEditorState,
  ProfileDecorationCatalogEntry,
  ProfileLayoutCatalogEntry,
  ProfileSkinCatalogEntry,
  ProfileShowcaseDraft,
} from "@repo/shared/profile-customization";
import {
  PROFILE_DEFAULT_SKIN_TOKENS,
  PROFILE_DECORATION_SLOTS,
  FAVORITE_GAMES_CAPACITY_LADDER,
  PROFILE_LAYOUT_REGISTRY,
  EMPTY_PROFILE_DECORATIONS,
} from "@repo/shared/profile-customization";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ProfileDecorationSurface } from "@/components/profile/profile-decoration-surface";
import { ProfileSkinSurface } from "@/components/profile/profile-skin-surface";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { orpcClient } from "@/lib/orpc";
import { cn } from "@/lib/utils";

import { ProfileShowcaseLayout } from "../../user/[id]/profile-showcase-layout";
import { PublicProfileHero } from "../../user/[id]/public-profile-hero";
import { UserClient } from "../../user/[id]/user-client";

type EditorState = ProfileCustomizationEditorState;

function withDecorationDefaults(
  configuration: ProfileCustomizationDraft
): ProfileCustomizationDraft {
  return {
    ...configuration,
    decorations: configuration.decorations ?? EMPTY_PROFILE_DECORATIONS,
  };
}

function withEditorDecorationDefaults(state: EditorState): EditorState {
  return {
    ...state,
    configuration: withDecorationDefaults(state.configuration),
    defaultConfiguration: withDecorationDefaults(state.defaultConfiguration),
    effectiveConfiguration: withDecorationDefaults(
      state.effectiveConfiguration ?? state.configuration
    ),
  };
}

const SHOWCASE_COPY = {
  library: {
    description: "Juegos y cómics que guardaste públicamente.",
    label: "Biblioteca",
  },
  reviews: {
    description: "Tus reseñas públicas, de la más reciente a la más antigua.",
    label: "Reseñas",
  },
  "favorite-games": {
    description: "Tu ranking personal, sin depender de favoritos ni propiedad.",
    label: "Juegos favoritos",
  },
  xp: {
    description: "Tu nivel y el avance dentro del nivel actual, sin historial.",
    label: "Account XP",
  },
  streak: {
    description: "Solo tu racha actual y los hitos derivados de ella.",
    label: "Racha",
  },
  eteris: {
    description:
      "Solo tu saldo actual no negativo; el historial sigue privado.",
    label: "Eteris",
  },
} as const;

const DECORATION_SLOT_COPY = {
  "ambient-effect": "Efecto ambiental",
  "avatar-frame": "Marco de avatar",
  "nameplate-effect": "Efecto de nombre",
  "profile-frame": "Marco de perfil",
} as const;

function LockedLabel({
  entitled,
  eterisPrice,
  requiredTier,
}: {
  entitled: boolean;
  eterisPrice?: bigint | null;
  requiredTier: keyof typeof PATRON_TIERS | null;
}) {
  if (entitled) {
    return null;
  }
  const vipLabel =
    requiredTier && requiredTier !== "none"
      ? PATRON_TIERS[requiredTier].badge
      : null;
  return (
    <span className="mt-2 block w-fit rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 text-xs dark:text-amber-300">
      {vipLabel
        ? `Vista previa bloqueada · Requiere ${vipLabel}`
        : eterisPrice !== null && eterisPrice !== undefined
          ? `Vista previa bloqueada · ${eterisPrice.toString()} Eteris`
          : "Vista previa bloqueada"}
    </span>
  );
}

type PurchasableCatalogItem =
  | ProfileDecorationCatalogEntry
  | ProfileLayoutCatalogEntry
  | ProfileSkinCatalogEntry;

function PermanentPurchaseControl({
  isPurchasing,
  item,
  onPurchase,
}: {
  isPurchasing: boolean;
  item?: PurchasableCatalogItem;
  onPurchase: (item: PurchasableCatalogItem) => void;
}) {
  if (
    !item ||
    item.lifecycle !== "active" ||
    item.permanentlyOwned ||
    item.eterisPrice === null ||
    item.eterisPrice <= 0n ||
    item.revision === undefined
  ) {
    return null;
  }
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/6 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-semibold text-sm">Conservar {item.name}</p>
        <p className="mt-0.5 text-muted-foreground text-xs leading-5">
          {item.entitled
            ? "Tu acceso VIP es temporal. Puedes hacer que esta pieza sea tuya para siempre."
            : "La compra desbloquea esta pieza para siempre."}{" "}
          No se publicará hasta que guardes tus cambios.
        </p>
      </div>
      <Button
        className="shrink-0"
        disabled={isPurchasing}
        onClick={() => onPurchase(item)}
        size="sm"
        type="button"
        variant="outline"
      >
        {isPurchasing
          ? "Procesando…"
          : `Conservar permanentemente · ${item.eterisPrice.toString()} Eteris`}
      </Button>
    </div>
  );
}

function FavoriteGamesControl({
  capacity,
  catalog,
  gameIds,
  onCatalogChange,
  onChange,
}: {
  capacity: number;
  catalog: FavoriteGameProjection[];
  gameIds: string[];
  onCatalogChange: (games: FavoriteGameProjection[]) => void;
  onChange: (gameIds: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const pendingFocus = useRef<string | null>(null);
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const searchInput = useRef<HTMLInputElement>(null);
  const byId = new Map(catalog.map((game) => [game.id, game]));

  useEffect(() => {
    if (!pendingFocus.current) {
      return;
    }
    if (pendingFocus.current === "search") {
      searchInput.current?.focus();
    } else {
      removeButtons.current.get(pendingFocus.current)?.focus();
    }
    pendingFocus.current = null;
  }, [gameIds]);

  const runSearch = async () => {
    setIsSearching(true);
    try {
      onCatalogChange(await orpcClient.profile.searchFavoriteGames({ search }));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-sm">Ranking guardado</p>
        <span className="rounded-full bg-background px-2.5 py-1 text-xs">
          {gameIds.length}/{capacity} activos
        </span>
      </div>
      {gameIds.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed p-3 text-muted-foreground text-sm">
          Elige tu primer juego para crear una portada destacada.
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {gameIds.map((id, index) => {
            const game = byId.get(id);
            const active = index < capacity;
            return (
              <li
                className="flex items-center gap-2 rounded-xl bg-background/80 p-2"
                key={id}
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/12 font-black text-primary text-xs">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {game?.title ?? "Juego no disponible"}
                  {active ? null : (
                    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-[10px] uppercase">
                      Inactivo
                    </span>
                  )}
                </span>
                <Button
                  aria-label={`Mover ${game?.title ?? "juego"} arriba`}
                  disabled={index === 0}
                  onClick={() => {
                    const next = [...gameIds];
                    [next[index - 1], next[index]] = [
                      next[index]!,
                      next[index - 1]!,
                    ];
                    onChange(next);
                  }}
                  size="icon-sm"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    aria-hidden
                    className="size-3.5"
                    icon={ArrowUp01Icon}
                  />
                </Button>
                <Button
                  aria-label={`Mover ${game?.title ?? "juego"} abajo`}
                  disabled={index === gameIds.length - 1}
                  onClick={() => {
                    const next = [...gameIds];
                    [next[index], next[index + 1]] = [
                      next[index + 1]!,
                      next[index]!,
                    ];
                    onChange(next);
                  }}
                  size="icon-sm"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    aria-hidden
                    className="size-3.5"
                    icon={ArrowDown01Icon}
                  />
                </Button>
                <Button
                  aria-label={`Quitar ${game?.title ?? "juego"}`}
                  onClick={() => {
                    pendingFocus.current =
                      gameIds[index + 1] ?? gameIds[index - 1] ?? "search";
                    onChange(gameIds.filter((gameId) => gameId !== id));
                  }}
                  ref={(node) => {
                    if (node) {
                      removeButtons.current.set(id, node);
                    } else {
                      removeButtons.current.delete(id);
                    }
                  }}
                  size="icon-sm"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    aria-hidden
                    className="size-3.5"
                    icon={Cancel01Icon}
                  />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-4 flex gap-2">
        <Input
          aria-label="Buscar juegos públicos"
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void runSearch();
            }
          }}
          placeholder="Buscar en el catálogo público"
          ref={searchInput}
          value={search}
        />
        <Button
          aria-label="Buscar juegos"
          disabled={isSearching}
          onClick={runSearch}
          size="icon"
          variant="outline"
        >
          <HugeiconsIcon aria-hidden className="size-4" icon={Search01Icon} />
        </Button>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {catalog
          .filter(({ id }) => !gameIds.includes(id))
          .map((game) => (
            <li
              className="flex min-w-0 items-center gap-2 rounded-xl border bg-background/60 p-2"
              key={game.id}
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {game.title}
              </span>
              <Button
                aria-label={`Agregar ${game.title}`}
                disabled={gameIds.length >= capacity}
                onClick={() => onChange([...gameIds, game.id])}
                size="icon-sm"
                variant="outline"
              >
                <HugeiconsIcon
                  aria-hidden
                  className="size-3.5"
                  icon={Add01Icon}
                />
              </Button>
            </li>
          ))}
      </ul>
      {gameIds.length >= capacity ? (
        <p className="mt-3 text-muted-foreground text-xs">
          Alcanzaste tu capacidad actual. Puedes reordenar o quitar juegos
          guardados.
        </p>
      ) : null}
    </div>
  );
}

function serializeDraft(draft: ProfileCustomizationDraft) {
  return JSON.stringify(draft);
}

function moveShowcase(
  draft: ProfileCustomizationDraft,
  from: number,
  to: number
) {
  if (to < 0 || to >= draft.showcases.length || from === to) {
    return draft;
  }
  const showcases = [...draft.showcases];
  const [moved] = showcases.splice(from, 1);
  if (!moved) {
    return draft;
  }
  showcases.splice(to, 0, moved);
  return {
    ...draft,
    showcases: showcases.map((showcase, order) => ({ ...showcase, order })),
  };
}

export function ProfileCustomizer({
  favoriteGames,
  initialState,
  profile,
  scalarShowcases = [],
}: {
  favoriteGames?: FavoriteGamesEditorState;
  initialState: EditorState;
  profile: PublicProfile;
  scalarShowcases?: EffectiveProfileShowcase[];
}) {
  const confirm = useConfirm();
  const [savedState, setSavedState] = useState(() =>
    withEditorDecorationDefaults(initialState)
  );
  const [draft, setDraft] = useState(() =>
    withDecorationDefaults(initialState.configuration)
  );
  const [pendingReapply, setPendingReapply] =
    useState<ProfileCustomizationDraft>();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [previewWidth, setPreviewWidth] = useState<"desktop" | "mobile">(
    "desktop"
  );
  const [isSaving, setIsSaving] = useState(false);
  const [purchasingItemId, setPurchasingItemId] = useState<string>();
  const purchaseKeys = useRef(new Map<string, string>());
  const [conflict, setConflict] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>(
    initialState.showcaseErrors
  );
  const [favoriteGamesCatalog, setFavoriteGamesCatalog] = useState(() => {
    const games = [
      ...(favoriteGames?.selected.flatMap(({ game }) => (game ? [game] : [])) ??
        []),
      ...(favoriteGames?.suggestions ?? []),
    ];
    return [...new Map(games.map((game) => [game.id, game])).values()];
  });
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const pendingShowcaseFocus = useRef<string | null>(null);
  const showcaseMoveButtons = useRef(new Map<string, HTMLButtonElement>());
  const [previewFavoriteCapacity, setPreviewFavoriteCapacity] = useState(
    favoriteGames?.capacity ?? 1
  );
  const dirty =
    serializeDraft(draft) !== serializeDraft(savedState.configuration);

  useEffect(() => {
    if (!pendingShowcaseFocus.current) {
      return;
    }
    showcaseMoveButtons.current.get(pendingShowcaseFocus.current)?.focus();
    pendingShowcaseFocus.current = null;
  }, [draft.showcases]);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const warnHistory = async () => {
      const isConfirmed = await confirm({
        title: "Cambios sin guardar",
        description: "Si sales ahora, perderás los cambios de este borrador.",
        confirmText: "Salir sin guardar",
      });
      if (!isConfirmed) {
        window.history.pushState(null, "", window.location.href);
      }
    };
    const warnLinks = async (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest("a[href]");
      if (link) {
        event.preventDefault();
        const href = link.getAttribute("href");
        const isConfirmed = await confirm({
          title: "Cambios sin guardar",
          description: "Si sales ahora, perderás los cambios de este borrador.",
          confirmText: "Salir sin guardar",
        });
        if (isConfirmed && href) {
          window.location.assign(href);
        }
      }
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("popstate", warnHistory);
    document.addEventListener("click", warnLinks, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("popstate", warnHistory);
      document.removeEventListener("click", warnLinks, true);
    };
  }, [confirm, dirty]);

  const updateShowcase = (
    index: number,
    update: (showcase: ProfileShowcaseDraft) => ProfileShowcaseDraft
  ) => {
    setDraft((current) => ({
      ...current,
      showcases: current.showcases.map((showcase, itemIndex) =>
        itemIndex === index ? update(showcase) : showcase
      ),
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setFieldErrors({});
    try {
      const nextState = await orpcClient.profile.saveCustomization({
        draft,
        expectedRevision: savedState.revision,
      });
      const normalizedState = withEditorDecorationDefaults(nextState);
      setSavedState(normalizedState);
      setDraft(normalizedState.configuration);
      setConflict(false);
      setPendingReapply(undefined);
      toast.success("Perfil publicado");
    } catch (error) {
      const candidate = error as {
        code?: string;
        data?: { fieldErrors?: Record<string, string> };
      };
      if (candidate.code === "PROFILE_CUSTOMIZATION_CONFLICT") {
        setConflict(true);
      }
      setFieldErrors(candidate.data?.fieldErrors ?? {});
      toast.error(
        error instanceof Error ? error.message : "No pudimos guardar el perfil."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handlePurchase = async (item: PurchasableCatalogItem) => {
    if (item.eterisPrice === null || item.revision === undefined) {
      return;
    }
    const confirmed = await confirm({
      confirmText: "Conservar permanentemente",
      description: `Se descontarán exactamente ${item.eterisPrice.toString()} Eteris. La compra no publicará ni equipará cambios hasta que elijas Guardar cambios.`,
      title: `Conservar ${item.name}`,
    });
    if (!confirmed) {
      return;
    }
    const idempotencyKey =
      purchaseKeys.current.get(item.itemId) ?? crypto.randomUUID();
    purchaseKeys.current.set(item.itemId, idempotencyKey);
    setPurchasingItemId(item.itemId);
    try {
      await orpcClient.profile.purchaseCatalogItem({
        expectedPrice: item.eterisPrice.toString(),
        expectedRevision: item.revision,
        idempotencyKey,
        itemId: item.itemId,
      });
      const refreshed = await orpcClient.profile.getCustomizationEditorState();
      setSavedState(withEditorDecorationDefaults(refreshed));
      purchaseKeys.current.delete(item.itemId);
      toast.success(`${item.name} ahora es tuyo permanentemente`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos completar la compra."
      );
    } finally {
      setPurchasingItemId(undefined);
    }
  };

  const reloadConflict = async () => {
    const current = await orpcClient.profile.getCustomizationEditorState();
    setPendingReapply(draft);
    const normalizedState = withEditorDecorationDefaults(current);
    setSavedState(normalizedState);
    setDraft(normalizedState.configuration);
    setConflict(false);
  };

  const previewShowcases = draft.showcases
    .filter(({ enabled }) => enabled)
    .flatMap(({ payload, type, variant }) => {
      if (type === "xp" || type === "streak" || type === "eteris") {
        const source = scalarShowcases.find(
          (showcase) => showcase.type === type
        );
        return source
          ? [
              {
                ...source,
                variant: variant === "compact" ? "compact" : "standard",
              } as EffectiveProfileShowcase,
            ]
          : [];
      }
      if (type !== "favorite-games") {
        return [
          { rendererKey: type, type, variant } as EffectiveProfileShowcase,
        ];
      }
      const ids = Array.isArray(payload.gameIds)
        ? payload.gameIds.filter((id): id is string => typeof id === "string")
        : [];
      const byId = new Map(favoriteGamesCatalog.map((game) => [game.id, game]));
      const games = ids.slice(0, previewFavoriteCapacity).flatMap((id) => {
        const game = byId.get(id);
        return game ? [game] : [];
      });
      return [
        {
          games,
          rendererKey: type,
          type,
          variant,
        } as EffectiveProfileShowcase,
      ];
    });
  const previewSkin = savedState.skins?.find(
    ({ key }) => key === draft.skinKey
  ) ??
    savedState.skins?.[0] ?? {
      backgroundAssetKey: null,
      description: "",
      isFree: true,
      key: "default",
      name: "Predeterminado",
      requiredTier: null,
      eterisPrice: null,
      entitled: true,
      itemId: "profile-skin-default",
      lifecycle: "active" as const,
      selectable: true,
      tokens: PROFILE_DEFAULT_SKIN_TOKENS,
    };
  const availableLayouts =
    savedState.layouts ??
    PROFILE_LAYOUT_REGISTRY.map((layout) => ({
      ...layout,
      eterisPrice: null,
      entitled: true,
      isFree: true,
      lifecycle: "active" as const,
      requiredTier: null,
      selectable: true,
    }));

  return (
    <main className="mx-auto w-full max-w-7xl px-3 py-5 pb-12 sm:px-4 md:py-8">
      <header className="mb-5 flex flex-col gap-4 rounded-[2rem] border border-primary/15 bg-card/80 p-5 shadow-lg shadow-black/10 sm:flex-row sm:items-end sm:justify-between sm:p-7">
        <div>
          <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
            Tu espacio público
          </p>
          <h1 className="mt-2 font-black text-3xl tracking-tight sm:text-4xl">
            Personalizar perfil
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
            Ordena lo que cuenta tu perfil. Los cambios solo se publican cuando
            eliges Guardar cambios.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            nativeButton={false}
            render={<Link href={`/user/${profile.id}`} />}
            variant="outline"
          >
            <HugeiconsIcon aria-hidden className="size-4" icon={ViewIcon} />
            Ver perfil publicado
          </Button>
          <Button disabled={!dirty || isSaving} onClick={handleSave}>
            <HugeiconsIcon
              aria-hidden
              className="size-4"
              icon={FloppyDiskIcon}
            />
            {isSaving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </header>

      {conflict ? (
        <div
          className="mb-5 rounded-2xl border border-destructive/40 bg-destructive/10 p-4"
          role="alert"
        >
          <p className="font-semibold">Este perfil cambió en otra pestaña.</p>
          <p className="mt-1 text-sm">
            Recarga la versión publicada y luego decide si quieres reaplicar
            este borrador.
          </p>
          <Button className="mt-3" onClick={reloadConflict} variant="outline">
            Recargar estado actual
          </Button>
        </div>
      ) : null}
      {pendingReapply ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <p className="text-sm">
            El borrador anterior está listo para reaplicarse manualmente.
          </p>
          <Button
            onClick={() => {
              setDraft(pendingReapply);
              setPendingReapply(undefined);
            }}
            variant="outline"
          >
            Reaplicar borrador
          </Button>
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 rounded-xl border bg-card p-1 lg:hidden">
        {(["edit", "preview"] as const).map((value) => (
          <Button
            aria-pressed={mode === value}
            key={value}
            onClick={() => setMode(value)}
            variant={mode === value ? "default" : "ghost"}
          >
            {value === "edit" ? "Editar" : "Vista previa"}
          </Button>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(20rem,0.72fr)_minmax(0,1.28fr)]">
        <section
          aria-label={"Controles de personalizaci\u00F3n"}
          className={cn("space-y-4", mode === "preview" && "hidden lg:block")}
        >
          <fieldset className="rounded-[1.5rem] border bg-card/75 p-5">
            <legend className="px-1 font-bold text-xl">Diseño</legend>
            <p className="mt-1 text-muted-foreground text-sm">
              Elige cómo se distribuyen tus Showcases. El orden guardado no
              cambia al pasar de un diseño a otro.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {availableLayouts
                .filter(
                  (layout) =>
                    layout.lifecycle === "active" ||
                    layout.key === draft.layoutKey
                )
                .map((layout) => (
                  <label
                    className="group relative cursor-pointer rounded-2xl border bg-background/60 p-3 transition-colors has-checked:border-primary has-checked:bg-primary/8 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                    key={layout.key}
                  >
                    <input
                      aria-describedby={
                        fieldErrors.layoutKey
                          ? "profile-layout-error"
                          : undefined
                      }
                      checked={draft.layoutKey === layout.key}
                      className="sr-only"
                      name="profile-layout"
                      onChange={() =>
                        setDraft((current) => ({
                          ...current,
                          layoutKey: layout.key,
                        }))
                      }
                      type="radio"
                      value={layout.key}
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "mb-3 grid h-10 gap-1 rounded-lg border border-border/70 bg-muted/60 p-1.5",
                        layout.key === "stack" && "grid-cols-1",
                        layout.key !== "stack" && "grid-cols-2"
                      )}
                    >
                      <span
                        className={cn(
                          "rounded-sm bg-primary/45",
                          layout.key === "spotlight" && "col-span-2"
                        )}
                      />
                      <span className="rounded-sm bg-foreground/15" />
                      {layout.key === "stack" ? null : (
                        <span className="rounded-sm bg-foreground/15" />
                      )}
                    </span>
                    <span className="block font-semibold text-sm">
                      {layout.name}
                    </span>
                    <span className="mt-1 block text-muted-foreground text-xs leading-5">
                      {layout.description}
                    </span>
                    <LockedLabel
                      entitled={layout.entitled}
                      eterisPrice={layout.eterisPrice}
                      requiredTier={layout.requiredTier}
                    />
                  </label>
                ))}
            </div>
            <PermanentPurchaseControl
              isPurchasing={
                availableLayouts.find(({ key }) => key === draft.layoutKey)
                  ?.itemId === purchasingItemId
              }
              item={availableLayouts.find(({ key }) => key === draft.layoutKey)}
              onPurchase={handlePurchase}
            />
            {fieldErrors.layoutKey ? (
              <p
                className="mt-3 text-destructive text-sm"
                id="profile-layout-error"
                role="alert"
              >
                {fieldErrors.layoutKey}
              </p>
            ) : null}
          </fieldset>
          <fieldset className="rounded-[1.5rem] border bg-card/75 p-5">
            <legend className="px-1 font-bold text-xl">Skin</legend>
            <p className="mt-1 text-muted-foreground text-sm">
              Cambia la atmósfera del perfil sin alterar el tema de la
              aplicación.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(savedState.skins ?? [])
                .filter(
                  (skin) =>
                    skin.lifecycle === "active" || skin.key === draft.skinKey
                )
                .map((skin) => (
                  <label
                    className="group cursor-pointer overflow-hidden rounded-2xl border bg-background/60 transition-colors has-checked:border-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                    key={skin.key}
                  >
                    <input
                      aria-describedby={
                        fieldErrors.skinKey ? "profile-skin-error" : undefined
                      }
                      checked={draft.skinKey === skin.key}
                      className="sr-only"
                      name="profile-skin"
                      onChange={() =>
                        setDraft((current) => ({
                          ...current,
                          skinKey: skin.key,
                        }))
                      }
                      type="radio"
                      value={skin.key}
                    />
                    <span aria-hidden className="flex h-11">
                      {[
                        skin.tokens.background.kind === "solid"
                          ? skin.tokens.background.color
                          : skin.tokens.background.stops[0]!.color,
                        skin.tokens.shellSurface,
                        skin.tokens.showcaseSurface,
                        skin.tokens.accent,
                      ].map((color) => (
                        <span
                          className="flex-1"
                          key={color}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    <span className="block p-3">
                      <span className="block font-semibold text-sm">
                        {skin.name}
                      </span>
                      <span className="mt-1 block text-muted-foreground text-xs leading-5">
                        {skin.description}
                      </span>
                      <LockedLabel
                        entitled={skin.entitled}
                        eterisPrice={skin.eterisPrice}
                        requiredTier={skin.requiredTier}
                      />
                    </span>
                  </label>
                ))}
            </div>
            <PermanentPurchaseControl
              isPurchasing={
                savedState.skins?.find(({ key }) => key === draft.skinKey)
                  ?.itemId === purchasingItemId
              }
              item={savedState.skins?.find(({ key }) => key === draft.skinKey)}
              onPurchase={handlePurchase}
            />
            {fieldErrors.skinKey ? (
              <p
                className="mt-3 text-destructive text-sm"
                id="profile-skin-error"
                role="alert"
              >
                {fieldErrors.skinKey}
              </p>
            ) : null}
          </fieldset>
          <fieldset className="rounded-[1.5rem] border bg-card/75 p-5">
            <legend className="px-1 font-bold text-xl">Decorations</legend>
            <p className="mt-1 text-muted-foreground text-sm">
              Equipa una pieza por slot. Los efectos conservan la identidad y
              respetan el movimiento reducido.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {PROFILE_DECORATION_SLOTS.map((slot) => (
                <div className="grid gap-2" key={slot}>
                  <label
                    className="font-medium text-sm"
                    htmlFor={`decoration-${slot}`}
                  >
                    {DECORATION_SLOT_COPY[slot]}
                  </label>
                  <Select
                    onValueChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        decorations: {
                          ...current.decorations,
                          [slot]: value === "none" ? null : value,
                        },
                      }))
                    }
                    value={draft.decorations[slot] ?? "none"}
                  >
                    <SelectTrigger
                      aria-describedby={
                        fieldErrors[`decorations.${slot}`]
                          ? `profile-decoration-${slot}-error`
                          : undefined
                      }
                      aria-invalid={Boolean(fieldErrors[`decorations.${slot}`])}
                      id={`decoration-${slot}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin Decoration</SelectItem>
                      {(savedState.decorations ?? [])
                        .filter(
                          (decoration) =>
                            decoration.slot === slot &&
                            (decoration.lifecycle === "active" ||
                              draft.decorations[slot] === decoration.key)
                        )
                        .map((decoration) => (
                          <SelectItem
                            key={decoration.key}
                            value={decoration.key}
                          >
                            {decoration.name}
                            {decoration.entitled
                              ? ""
                              : decoration.requiredTier &&
                                  PATRON_TIERS[decoration.requiredTier].badge
                                ? ` · Requiere ${PATRON_TIERS[decoration.requiredTier].badge}`
                                : typeof decoration.eterisPrice === "bigint"
                                  ? ` · ${decoration.eterisPrice.toString()} Eteris`
                                  : " · Bloqueada"}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <PermanentPurchaseControl
                    isPurchasing={
                      savedState.decorations?.find(
                        (decoration) =>
                          decoration.slot === slot &&
                          decoration.key === draft.decorations[slot]
                      )?.itemId === purchasingItemId
                    }
                    item={savedState.decorations?.find(
                      (decoration) =>
                        decoration.slot === slot &&
                        decoration.key === draft.decorations[slot]
                    )}
                    onPurchase={handlePurchase}
                  />
                  {fieldErrors[`decorations.${slot}`] ? (
                    <p
                      className="text-destructive text-sm"
                      id={`profile-decoration-${slot}-error`}
                      role="alert"
                    >
                      {fieldErrors[`decorations.${slot}`]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </fieldset>
          <div className="rounded-[1.5rem] border bg-card/75 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-bold text-xl">Showcases</h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  El orden de esta lista es el orden del perfil en cualquier
                  pantalla.
                </p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 font-medium text-xs">
                {draft.showcases.filter(({ enabled }) => enabled).length}{" "}
                visibles
              </span>
            </div>
            <ol className="mt-5 space-y-3">
              {draft.showcases.map((showcase, index) => {
                const copy =
                  SHOWCASE_COPY[showcase.type as keyof typeof SHOWCASE_COPY];
                const showcaseError =
                  fieldErrors[`showcases.${showcase.type}`] ??
                  fieldErrors[`showcases.${showcase.type}.payload`];
                const showcaseErrorId = showcaseError
                  ? `profile-showcase-${showcase.instanceId}-error`
                  : undefined;
                return (
                  <li
                    className="rounded-2xl border bg-background/60 p-4"
                    draggable
                    key={showcase.instanceId}
                    onDragStart={() => setDraggedIndex(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => {
                      if (draggedIndex !== null) {
                        setDraft((current) =>
                          moveShowcase(current, draggedIndex, index)
                        );
                      }
                      setDraggedIndex(null);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <HugeiconsIcon
                        aria-hidden
                        className="mt-1 size-5 text-muted-foreground"
                        icon={DragDropVerticalIcon}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <label
                            className="font-semibold"
                            htmlFor={`showcase-${showcase.type}`}
                          >
                            {copy?.label ?? showcase.type}
                          </label>
                          <Switch
                            aria-describedby={showcaseErrorId}
                            aria-invalid={Boolean(showcaseError)}
                            checked={showcase.enabled}
                            id={`showcase-${showcase.type}`}
                            onCheckedChange={(enabled) =>
                              updateShowcase(index, (current) => ({
                                ...current,
                                enabled,
                              }))
                            }
                          />
                        </div>
                        <p className="mt-1 text-muted-foreground text-sm">
                          {copy?.description}
                        </p>
                        {(() => {
                          const entitlement =
                            savedState.showcaseEntitlements?.[showcase.type];
                          return entitlement ? (
                            <LockedLabel
                              entitled={entitlement.entitled}
                              requiredTier={entitlement.requiredTier}
                            />
                          ) : null;
                        })()}
                        {showcase.type === "favorite-games" ? (
                          <>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {FAVORITE_GAMES_CAPACITY_LADDER.toReversed().map(
                                ({ capacity, minimumTier }) => (
                                  <Button
                                    aria-pressed={
                                      previewFavoriteCapacity === capacity
                                    }
                                    key={minimumTier}
                                    onClick={() =>
                                      setPreviewFavoriteCapacity(capacity)
                                    }
                                    size="sm"
                                    variant={
                                      previewFavoriteCapacity === capacity
                                        ? "default"
                                        : "outline"
                                    }
                                  >
                                    {capacity} ·{" "}
                                    {minimumTier === "none"
                                      ? "Gratis"
                                      : PATRON_TIERS[minimumTier].badge}
                                    {capacity > (favoriteGames?.capacity ?? 1)
                                      ? " · Vista previa"
                                      : ""}
                                  </Button>
                                )
                              )}
                            </div>
                            <FavoriteGamesControl
                              capacity={previewFavoriteCapacity}
                              catalog={favoriteGamesCatalog}
                              gameIds={
                                Array.isArray(showcase.payload.gameIds)
                                  ? showcase.payload.gameIds.filter(
                                      (id): id is string =>
                                        typeof id === "string"
                                    )
                                  : []
                              }
                              onCatalogChange={(games) =>
                                setFavoriteGamesCatalog((current) => [
                                  ...new Map(
                                    [...current, ...games].map((game) => [
                                      game.id,
                                      game,
                                    ])
                                  ).values(),
                                ])
                              }
                              onChange={(gameIds) =>
                                updateShowcase(index, (current) => ({
                                  ...current,
                                  payload: { gameIds },
                                }))
                              }
                            />
                          </>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Select
                            onValueChange={(variant) =>
                              updateShowcase(index, (current) => ({
                                ...current,
                                variant:
                                  variant as ProfileShowcaseDraft["variant"],
                              }))
                            }
                            value={showcase.variant}
                          >
                            <SelectTrigger
                              aria-describedby={showcaseErrorId}
                              aria-label={`Variante de ${copy?.label}`}
                              aria-invalid={Boolean(showcaseError)}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="compact">Compacta</SelectItem>
                              <SelectItem value="standard">Estándar</SelectItem>
                              <SelectItem value="featured">
                                Destacada
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            aria-label={`Mover ${copy?.label} arriba`}
                            disabled={index === 0}
                            onClick={() => {
                              pendingShowcaseFocus.current = `${showcase.instanceId}:down`;
                              setDraft((current) =>
                                moveShowcase(current, index, index - 1)
                              );
                            }}
                            ref={(node) => {
                              const key = `${showcase.instanceId}:up`;
                              if (node) {
                                showcaseMoveButtons.current.set(key, node);
                              } else {
                                showcaseMoveButtons.current.delete(key);
                              }
                            }}
                            size="icon"
                            variant="outline"
                          >
                            <HugeiconsIcon
                              aria-hidden
                              className="size-4"
                              icon={ArrowUp01Icon}
                            />
                          </Button>
                          <Button
                            aria-label={`Mover ${copy?.label} abajo`}
                            disabled={index === draft.showcases.length - 1}
                            onClick={() => {
                              pendingShowcaseFocus.current = `${showcase.instanceId}:up`;
                              setDraft((current) =>
                                moveShowcase(current, index, index + 1)
                              );
                            }}
                            ref={(node) => {
                              const key = `${showcase.instanceId}:down`;
                              if (node) {
                                showcaseMoveButtons.current.set(key, node);
                              } else {
                                showcaseMoveButtons.current.delete(key);
                              }
                            }}
                            size="icon"
                            variant="outline"
                          >
                            <HugeiconsIcon
                              aria-hidden
                              className="size-4"
                              icon={ArrowDown01Icon}
                            />
                          </Button>
                        </div>
                        {showcaseError ? (
                          <p
                            className="mt-2 text-destructive text-sm"
                            id={showcaseErrorId}
                            role="alert"
                          >
                            {showcaseError}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="rounded-[1.5rem] border bg-card/75 p-5">
            <h2 className="font-bold text-lg">Volver a empezar</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Restaura los valores actuales en este borrador. Tus elementos
              adquiridos no cambian.
            </p>
            <Button
              className="mt-4"
              onClick={async () => {
                if (
                  await confirm({
                    title: "Restablecer perfil",
                    description: "Esto reemplazará solo el borrador actual.",
                    confirmText: "Restablecer",
                  })
                ) {
                  setDraft(savedState.defaultConfiguration);
                }
              }}
              variant="outline"
            >
              Restablecer perfil
            </Button>
          </div>
        </section>

        <section
          aria-label="Vista previa del perfil"
          className={cn("min-w-0", mode === "edit" && "hidden lg:block")}
        >
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border bg-card p-2">
            <p className="px-2 font-medium text-sm">Vista previa en vivo</p>
            <div className="flex gap-1">
              <Button
                aria-label="Ancho de escritorio"
                aria-pressed={previewWidth === "desktop"}
                onClick={() => setPreviewWidth("desktop")}
                size="icon"
                variant={previewWidth === "desktop" ? "default" : "ghost"}
              >
                <HugeiconsIcon
                  aria-hidden
                  className="size-4"
                  icon={ComputerIcon}
                />
              </Button>
              <Button
                aria-label="Ancho móvil"
                aria-pressed={previewWidth === "mobile"}
                onClick={() => setPreviewWidth("mobile")}
                size="icon"
                variant={previewWidth === "mobile" ? "default" : "ghost"}
              >
                <HugeiconsIcon
                  aria-hidden
                  className="size-4"
                  icon={SmartPhone01Icon}
                />
              </Button>
            </div>
          </div>
          <div className="sticky top-4 overflow-auto rounded-[1.75rem] border bg-background/70 p-3 shadow-xl shadow-black/10">
            {previewSkin ? (
              <ProfileSkinSurface
                className={cn(
                  "mx-auto flex flex-col gap-8 rounded-2xl p-4 transition-[max-width]",
                  previewWidth === "mobile" ? "max-w-sm" : "max-w-none"
                )}
                skin={previewSkin}
              >
                <ProfileDecorationSurface
                  className="flex flex-col gap-8"
                  decorations={(savedState.decorations ?? []).filter(
                    (decoration) =>
                      draft.decorations[decoration.slot] === decoration.key
                  )}
                >
                  <PublicProfileHero
                    profile={profile}
                    showLegacyStats={false}
                  />
                  <ProfileShowcaseLayout rendererKey={draft.layoutKey}>
                    <UserClient
                      showEmptyShowcases
                      showcases={previewShowcases}
                      userId={profile.id}
                      userName={profile.name}
                      visibility={profile.visibility}
                    />
                  </ProfileShowcaseLayout>
                </ProfileDecorationSurface>
              </ProfileSkinSurface>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
