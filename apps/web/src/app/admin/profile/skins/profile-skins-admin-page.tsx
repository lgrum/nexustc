"use client";

import { FloppyDiskIcon, Rocket01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PATRON_TIER_KEYS, PATRON_TIERS } from "@repo/shared/constants";
import {
  PROFILE_DEFAULT_SKIN_TOKENS,
  profileSkinTokensSchema,
} from "@repo/shared/profile-customization";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ProfileSkinSurface } from "@/components/profile/profile-skin-surface";
import { Button } from "@/components/ui/button";
import { useAppForm } from "@/hooks/use-app-form";
import { orpc, orpcClient } from "@/lib/orpc";

import { CatalogLifecycleActions } from "../catalog-lifecycle-actions";

const accessOptions = [
  { label: "Sin acceso VIP", value: "disabled" },
  ...PATRON_TIER_KEYS.filter((tier) => tier !== "none").map((tier) => ({
    label: PATRON_TIERS[tier].badge ?? tier,
    value: tier,
  })),
];

const skinFormSchema = z.object({
  backgroundAssetId: z.string(),
  catalogOrder: z.string().regex(/^\d+$/, "Usa un número entero no negativo."),
  description: z.string().max(500),
  eterisPrice: z
    .string()
    .regex(/^$|^\d+$/, "Usa un precio entero no negativo."),
  isFree: z.enum(["true", "false"]),
  itemId: z.string(),
  name: z.string().trim().min(1).max(80),
  requiredTier: z.enum(["disabled", ...PATRON_TIER_KEYS]),
  stableKey: z.string(),
  tokenText: z.string().superRefine((value, context) => {
    try {
      profileSkinTokensSchema.parse(JSON.parse(value));
    } catch {
      context.addIssue({
        code: "custom",
        message: "Los tokens no son válidos.",
      });
    }
  }),
});

type SkinFormValues = z.input<typeof skinFormSchema>;

const emptyValues: SkinFormValues = {
  backgroundAssetId: "",
  catalogOrder: "0",
  description: "",
  eterisPrice: "",
  isFree: "true",
  itemId: "",
  name: "",
  requiredTier: "disabled",
  stableKey: "",
  tokenText: JSON.stringify(PROFILE_DEFAULT_SKIN_TOKENS, null, 2),
};

export function ProfileSkinsAdminPage() {
  const { data, refetch } = useSuspenseQuery(
    orpc.profileCatalogAdmin.skins.list.queryOptions()
  );
  const [previewAssetKey, setPreviewAssetKey] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [loadedRevision, setLoadedRevision] = useState<{
    id: string;
    state: "draft" | "published";
  } | null>(null);
  const form = useAppForm({
    defaultValues: emptyValues,
    onSubmit: async ({ value }) => {
      try {
        const result = await orpcClient.profileCatalogAdmin.skins.saveDraft({
          draft: {
            backgroundAssetId: value.backgroundAssetId.trim() || null,
            catalogOrder: Number(value.catalogOrder),
            description: value.description.trim(),
            eterisPrice: value.eterisPrice ? BigInt(value.eterisPrice) : null,
            isFree: value.isFree === "true",
            itemId: value.itemId || undefined,
            name: value.name.trim(),
            requiredTier:
              value.requiredTier === "disabled" ? null : value.requiredTier,
            stableKey: value.itemId ? undefined : value.stableKey.trim(),
            tokens: profileSkinTokensSchema.parse(JSON.parse(value.tokenText)),
          },
        });
        if (!result) {
          throw new Error("El servicio no devolvió el borrador guardado.");
        }
        form.setFieldValue("itemId", result.itemId);
        setLoadedRevision({ id: result.revisionId, state: "draft" });
        await refetch();
        toast.success("Borrador de Skin guardado");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No pudimos guardar el borrador."
        );
      }
    },
    validators: { onSubmit: skinFormSchema },
  });

  const loadRevision = (skin: (typeof data)[number]) => {
    form.reset({
      backgroundAssetId: skin.backgroundAssetId ?? "",
      catalogOrder: String(skin.catalogOrder),
      description: skin.description,
      eterisPrice: skin.eterisPrice?.toString() ?? "",
      isFree: skin.isFree ? "true" : "false",
      itemId: skin.itemId,
      name: skin.name,
      requiredTier: skin.requiredTier ?? "disabled",
      stableKey: skin.stableKey.replace(/^skin\./, ""),
      tokenText: JSON.stringify(skin.tokens, null, 2),
    });
    setPreviewAssetKey(skin.backgroundAssetKey);
    setLoadedRevision({
      id: skin.revisionId,
      state: skin.state === "draft" ? "draft" : "published",
    });
  };

  const publish = async () => {
    const itemId = form.getFieldValue("itemId");
    if (!itemId || loadedRevision?.state !== "draft") {
      toast.error("Guarda esta revisión como borrador antes de publicar.");
      return;
    }
    setPublishing(true);
    try {
      await orpcClient.profileCatalogAdmin.skins.publish({
        itemId,
        revisionId: loadedRevision.id,
      });
      await refetch();
      toast.success("Skin publicado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No pudimos publicar el Skin."
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <main className="space-y-5">
      <header className="rounded-[2rem] border bg-card/80 p-6">
        <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
          Catálogo visual
        </p>
        <h1 className="mt-2 font-black text-3xl tracking-tight">
          Profile Skins
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
          Configura acceso gratuito, VIP o por Eteris, carga revisiones
          existentes y valida el resultado antes de publicar.
        </p>
      </header>
      <div className="grid gap-5 xl:grid-cols-[minmax(20rem,.75fr)_minmax(0,1.25fr)]">
        <section className="rounded-[1.5rem] border bg-card/75 p-5">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              form.handleSubmit();
            }}
          >
            <form.AppForm>
              <form.AppField name="name">
                {(field) => <field.TextField label="Nombre" required />}
              </form.AppField>
              <form.Subscribe selector={(state) => state.values.itemId}>
                {(itemId) =>
                  itemId ? null : (
                    <form.AppField name="stableKey">
                      {(field) => (
                        <field.TextField label="Clave estable" required />
                      )}
                    </form.AppField>
                  )
                }
              </form.Subscribe>
              <form.AppField name="description">
                {(field) => <field.TextField label="Descripción" />}
              </form.AppField>
              <div className="grid gap-4 sm:grid-cols-2">
                <form.AppField name="catalogOrder">
                  {(field) => (
                    <field.TextField
                      inputMode="numeric"
                      label="Orden del catálogo"
                      required
                    />
                  )}
                </form.AppField>
                <form.AppField name="eterisPrice">
                  {(field) => (
                    <field.TextField
                      inputMode="numeric"
                      label="Precio en Eteris (opcional)"
                    />
                  )}
                </form.AppField>
                <form.AppField name="isFree">
                  {(field) => (
                    <field.SelectField
                      label="Acceso gratuito"
                      options={[
                        { label: "Sí", value: "true" },
                        { label: "No", value: "false" },
                      ]}
                    />
                  )}
                </form.AppField>
                <form.AppField name="requiredTier">
                  {(field) => (
                    <field.SelectField
                      label="Acceso VIP temporal"
                      options={accessOptions}
                    />
                  )}
                </form.AppField>
              </div>
              <form.AppField name="backgroundAssetId">
                {(field) => (
                  <field.TextField
                    label="ID de fondo administrado (opcional)"
                    onChange={(event) => {
                      setPreviewAssetKey(null);
                      field.handleChange(event.target.value);
                    }}
                  />
                )}
              </form.AppField>
              <form.AppField name="tokenText">
                {(field) => (
                  <field.TextareaField
                    className="min-h-96 font-mono text-xs"
                    label="Tokens semánticos estructurados"
                  />
                )}
              </form.AppField>
              <div className="flex flex-wrap gap-2">
                <form.SubmitButton>
                  <HugeiconsIcon
                    aria-hidden
                    className="size-4"
                    icon={FloppyDiskIcon}
                  />
                  Guardar borrador
                </form.SubmitButton>
                <form.Subscribe selector={(state) => state.values.itemId}>
                  {(itemId) => (
                    <Button
                      disabled={
                        publishing ||
                        !itemId ||
                        loadedRevision?.state !== "draft"
                      }
                      loading={publishing}
                      onClick={publish}
                      type="button"
                      variant="outline"
                    >
                      <HugeiconsIcon
                        aria-hidden
                        className="size-4"
                        icon={Rocket01Icon}
                      />
                      Publicar
                    </Button>
                  )}
                </form.Subscribe>
                <Button
                  onClick={() => {
                    form.reset(emptyValues);
                    setPreviewAssetKey(null);
                    setLoadedRevision(null);
                  }}
                  type="button"
                  variant="ghost"
                >
                  Nuevo Skin
                </Button>
              </div>
            </form.AppForm>
          </form>
        </section>
        <form.Subscribe selector={(state) => state.values}>
          {(values) => (
            <SkinPreviews
              assetKey={previewAssetKey}
              tokenText={values.tokenText}
            />
          )}
        </form.Subscribe>
      </div>
      <section className="rounded-[1.5rem] border bg-card/75 p-5">
        <h2 className="font-bold text-xl">Historial del catálogo</h2>
        <ul className="mt-4 divide-y">
          {data.map((skin) => (
            <li
              className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={skin.revisionId}
            >
              <span>
                <strong>{skin.name}</strong>
                <small className="ml-2 text-muted-foreground">
                  {skin.stableKey} · r{skin.revision} ·{" "}
                  {skin.isFree ? "gratis" : "restringido"}
                  {skin.eterisPrice === null
                    ? ""
                    : ` · ${skin.eterisPrice.toString()} Eteris`}
                </small>
              </span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  onClick={() => loadRevision(skin)}
                  size="sm"
                  variant="outline"
                >
                  Editar esta revisión
                </Button>
                <span className="rounded-full border px-2 py-1 text-xs">
                  {skin.lifecycle} · {skin.state}
                </span>
                <CatalogLifecycleActions
                  currentPublishedRevisionId={skin.currentPublishedRevisionId}
                  isProtectedDefault={skin.isProtectedDefault}
                  itemId={skin.itemId}
                  lifecycle={skin.lifecycle}
                  onChanged={refetch}
                  revisionId={skin.revisionId}
                  state={skin.state}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function SkinPreviews({
  assetKey,
  tokenText,
}: {
  assetKey: string | null;
  tokenText: string;
}) {
  let tokens = null;
  try {
    tokens = profileSkinTokensSchema.parse(JSON.parse(tokenText));
  } catch {
    /* The form displays the validation error. */
  }
  if (!tokens) {
    return (
      <p
        className="rounded-2xl border border-destructive/40 p-5 text-destructive"
        role="status"
      >
        Corrige los tokens para actualizar la vista previa.
      </p>
    );
  }
  return (
    <section
      aria-label="Previsualizaciones representativas"
      className="grid content-start gap-4 md:grid-cols-2"
    >
      {[
        { label: "Escritorio", className: "aspect-video" },
        { label: "Móvil", className: "mx-auto aspect-[9/16] max-w-xs" },
        {
          label: "Movimiento reducido",
          className: "aspect-video md:col-span-2",
        },
      ].map((preview) => (
        <article
          className={
            preview.label === "Movimiento reducido" ? "md:col-span-2" : ""
          }
          key={preview.label}
        >
          <p className="mb-2 font-semibold text-sm">{preview.label}</p>
          <ProfileSkinSurface
            className={`${preview.className} overflow-hidden rounded-2xl border p-5`}
            skin={{
              backgroundAssetKey: assetKey,
              key: "owner-preview",
              tokens,
            }}
          >
            <div className="rounded-xl border bg-card p-4" data-profile-shell>
              <p className="font-bold">Identidad protegida</p>
              <p className="text-muted-foreground text-sm">
                Shell y tarjetas conservan contraste y foco.
              </p>
              <div className="mt-4 border bg-card p-3" data-showcase-variant>
                Showcase publicado
              </div>
            </div>
          </ProfileSkinSurface>
        </article>
      ))}
    </section>
  );
}
