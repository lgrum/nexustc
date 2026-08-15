"use client";

import {
  FloppyDiskIcon,
  Rocket01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { PATRON_TIER_KEYS, PATRON_TIERS } from "@repo/shared/constants";
import {
  PROFILE_DECORATION_EFFECT_KEYS_BY_SLOT,
  PROFILE_DECORATION_FONT_KEYS,
  PROFILE_DECORATION_SLOTS,
  isProfileDecorationEffectAllowed,
  profileDecorationVisualSchema,
} from "@repo/shared/profile-customization";
import type { ProfileDecorationVisual } from "@repo/shared/profile-customization";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ProfileDecorationSurface } from "@/components/profile/profile-decoration-surface";
import { Button } from "@/components/ui/button";
import { useAppForm } from "@/hooks/use-app-form";
import { orpc, orpcClient } from "@/lib/orpc";

import { CatalogLifecycleActions } from "../catalog-lifecycle-actions";

const optional = (label: string) => ({ label, value: "disabled" });
const tierOptions = [
  optional("Sin acceso VIP"),
  ...PATRON_TIER_KEYS.filter((tier) => tier !== "none").map((tier) => ({
    label: PATRON_TIERS[tier].badge ?? tier,
    value: tier,
  })),
];
const formSchema = z
  .object({
    catalogOrder: z
      .string()
      .regex(/^\d+$/, "Usa un número entero no negativo."),
    description: z.string().max(500),
    effectKey: z.enum([
      "disabled",
      ...PROFILE_DECORATION_EFFECT_KEYS_BY_SLOT["profile-frame"],
    ]),
    eterisPrice: z
      .string()
      .regex(/^$|^\d+$/, "Usa un precio entero no negativo."),
    fontKey: z.enum(["disabled", ...PROFILE_DECORATION_FONT_KEYS]),
    isFree: z.enum(["true", "false"]),
    itemId: z.string(),
    mediaAssetId: z.string(),
    name: z.string().trim().min(1).max(80),
    reducedMotion: z.enum(["disabled", "static", "omit"]),
    requiredTier: z.enum(["disabled", ...PATRON_TIER_KEYS]),
    slot: z.enum(PROFILE_DECORATION_SLOTS),
    stableKey: z.string(),
  })
  .superRefine((values, context) => {
    if (
      values.effectKey !== "disabled" &&
      !isProfileDecorationEffectAllowed(values.slot, values.effectKey)
    ) {
      context.addIssue({
        code: "custom",
        message: "Este efecto no está disponible para el slot elegido.",
        path: ["effectKey"],
      });
    }
  });
type DecorationFormValues = z.input<typeof formSchema>;

const emptyValues: DecorationFormValues = {
  catalogOrder: "0",
  description: "",
  effectKey: "disabled",
  eterisPrice: "",
  fontKey: "disabled",
  isFree: "true",
  itemId: "",
  mediaAssetId: "",
  name: "",
  reducedMotion: "disabled",
  requiredTier: "disabled",
  slot: "avatar-frame",
  stableKey: "",
};

export function ProfileDecorationsAdminPage() {
  const { data, refetch } = useSuspenseQuery(
    orpc.profileCatalogAdmin.decorations.list.queryOptions()
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
        const result =
          await orpcClient.profileCatalogAdmin.decorations.saveDraft({
            draft: {
              catalogOrder: Number(value.catalogOrder),
              description: value.description.trim(),
              effectKey:
                value.effectKey === "disabled" ? null : value.effectKey,
              eterisPrice: value.eterisPrice ? BigInt(value.eterisPrice) : null,
              fontKey: value.fontKey === "disabled" ? null : value.fontKey,
              isFree: value.isFree === "true",
              itemId: value.itemId || undefined,
              mediaAssetId: value.mediaAssetId.trim() || null,
              name: value.name.trim(),
              reducedMotion:
                value.reducedMotion === "disabled"
                  ? null
                  : { behavior: value.reducedMotion },
              requiredTier:
                value.requiredTier === "disabled" ? null : value.requiredTier,
              slot: value.slot,
              stableKey: value.itemId ? undefined : value.stableKey.trim(),
            },
          });
        if (!result) {
          throw new Error("El servicio no devolvió el borrador guardado.");
        }
        form.setFieldValue("itemId", result.itemId);
        setLoadedRevision({ id: result.revisionId, state: "draft" });
        await refetch();
        toast.success("Borrador de Decoration guardado");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No pudimos guardar el borrador."
        );
      }
    },
    validators: { onSubmit: formSchema },
  });

  const loadRevision = (item: (typeof data)[number]) => {
    const effectKey = PROFILE_DECORATION_EFFECT_KEYS_BY_SLOT[item.slot].find(
      (key) => key === item.effectKey
    );
    const fontKey = PROFILE_DECORATION_FONT_KEYS.find(
      (key) => key === item.fontKey
    );
    const reducedMotion = z
      .enum(["static", "omit"])
      .safeParse(
        (item.reducedMotion as { behavior?: unknown } | null)?.behavior
      );
    form.reset({
      catalogOrder: String(item.catalogOrder),
      description: item.description,
      effectKey: effectKey ?? "disabled",
      eterisPrice: item.eterisPrice?.toString() ?? "",
      fontKey: fontKey ?? "disabled",
      isFree: item.isFree ? "true" : "false",
      itemId: item.itemId,
      mediaAssetId: item.mediaAssetId ?? "",
      name: item.name,
      reducedMotion: reducedMotion.success ? reducedMotion.data : "disabled",
      requiredTier: item.requiredTier ?? "disabled",
      slot: item.slot,
      stableKey: item.stableKey.replace(/^decoration\./, ""),
    });
    setPreviewAssetKey(item.mediaAssetKey);
    setLoadedRevision({
      id: item.revisionId,
      state: item.state === "draft" ? "draft" : "published",
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
      await orpcClient.profileCatalogAdmin.decorations.publish({
        itemId,
        revisionId: loadedRevision.id,
      });
      await refetch();
      toast.success("Decoration publicada");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No pudimos publicar la Decoration."
      );
    } finally {
      setPublishing(false);
    }
  };

  return (
    <main className="space-y-5">
      <header className="overflow-hidden rounded-[2rem] border bg-card/80 p-6">
        <div className="flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
            <HugeiconsIcon aria-hidden className="size-6" icon={SparklesIcon} />
          </span>
          <div>
            <p className="font-semibold text-primary text-xs uppercase tracking-[0.24em]">
              Capas cosméticas
            </p>
            <h1 className="mt-2 font-black text-3xl tracking-tight">
              Profile Decorations
            </h1>
            <p className="mt-2 max-w-2xl text-muted-foreground text-sm">
              Configura acceso, recurso administrado y fallback de movimiento;
              la identidad protegida siempre queda por encima.
            </p>
          </div>
        </div>
      </header>
      <div className="grid gap-5 xl:grid-cols-[minmax(20rem,.8fr)_minmax(0,1.2fr)]">
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
                <form.AppField name="slot">
                  {(field) => (
                    <field.SelectField
                      label="Slot"
                      options={PROFILE_DECORATION_SLOTS.map((value) => ({
                        label: value,
                        value,
                      }))}
                    />
                  )}
                </form.AppField>
                <form.Subscribe selector={(state) => state.values.slot}>
                  {(slot) => (
                    <form.AppField name="effectKey">
                      {(field) => (
                        <field.SelectField
                          label="Efecto registrado"
                          options={[
                            optional("Sin efecto"),
                            ...PROFILE_DECORATION_EFFECT_KEYS_BY_SLOT[slot].map(
                              (value) => ({ label: value, value })
                            ),
                          ]}
                        />
                      )}
                    </form.AppField>
                  )}
                </form.Subscribe>
                <form.AppField name="fontKey">
                  {(field) => (
                    <field.SelectField
                      label="Fuente aprobada"
                      options={[
                        optional("Sin fuente"),
                        ...PROFILE_DECORATION_FONT_KEYS.map((value) => ({
                          label: value,
                          value,
                        })),
                      ]}
                    />
                  )}
                </form.AppField>
                <form.AppField name="reducedMotion">
                  {(field) => (
                    <field.SelectField
                      label="Movimiento reducido"
                      options={[
                        optional("No requerido"),
                        { label: "Versión estática", value: "static" },
                        { label: "Omitir efecto", value: "omit" },
                      ]}
                    />
                  )}
                </form.AppField>
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
                      options={tierOptions}
                    />
                  )}
                </form.AppField>
              </div>
              <form.AppField name="mediaAssetId">
                {(field) => (
                  <field.TextField
                    label="ID de recurso administrado (opcional)"
                    onChange={(event) => {
                      setPreviewAssetKey(null);
                      field.handleChange(event.target.value);
                    }}
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
                  Nueva Decoration
                </Button>
              </div>
            </form.AppForm>
          </form>
        </section>
        <form.Subscribe selector={(state) => state.values}>
          {(values) => (
            <DecorationPreviews assetKey={previewAssetKey} values={values} />
          )}
        </form.Subscribe>
      </div>
      <section className="rounded-[1.5rem] border bg-card/75 p-5">
        <h2 className="font-bold text-xl">Historial del catálogo</h2>
        <ul className="mt-4 divide-y">
          {data.map((item) => (
            <li
              className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              key={item.revisionId}
            >
              <span>
                <strong>{item.name}</strong>
                <small className="ml-2 text-muted-foreground">
                  {item.stableKey} · {item.slot} · r{item.revision}
                  {item.eterisPrice === null
                    ? ""
                    : ` · ${item.eterisPrice.toString()} Eteris`}
                </small>
              </span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  onClick={() => loadRevision(item)}
                  size="sm"
                  variant="outline"
                >
                  Editar esta revisión
                </Button>
                <span className="rounded-full border px-2 py-1 text-xs">
                  {item.lifecycle} · {item.state}
                </span>
                <CatalogLifecycleActions
                  currentPublishedRevisionId={item.currentPublishedRevisionId}
                  isProtectedDefault={item.isProtectedDefault}
                  itemId={item.itemId}
                  lifecycle={item.lifecycle}
                  onChanged={refetch}
                  revisionId={item.revisionId}
                  state={item.state}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function DecorationPreviews({
  assetKey,
  values,
}: {
  assetKey: string | null;
  values: DecorationFormValues;
}) {
  const parsed = profileDecorationVisualSchema.safeParse({
    effectKey: values.effectKey === "disabled" ? null : values.effectKey,
    fontKey: values.fontKey === "disabled" ? null : values.fontKey,
    mediaAssetKey: assetKey,
    reducedMotion:
      values.reducedMotion === "disabled"
        ? null
        : { behavior: values.reducedMotion },
    slot: values.slot,
  });
  if (!parsed.success) {
    return (
      <p
        className="rounded-2xl border border-destructive/40 p-5 text-destructive"
        role="status"
      >
        Completa el fallback requerido para actualizar la vista previa.
      </p>
    );
  }
  return (
    <section
      aria-label="Previsualizaciones representativas"
      className="grid content-start gap-4 sm:grid-cols-3"
    >
      {["Escritorio", "Móvil", "Movimiento reducido"].map((label) => (
        <DecorationPreview
          decoration={parsed.data}
          forceReducedMotion={label === "Movimiento reducido"}
          key={label}
          label={label}
        />
      ))}
    </section>
  );
}

function DecorationPreview({
  decoration,
  forceReducedMotion,
  label,
}: {
  decoration: ProfileDecorationVisual;
  forceReducedMotion: boolean;
  label: string;
}) {
  return (
    <article className="rounded-[1.5rem] border bg-card/75 p-4">
      <p className="font-semibold text-sm">{label}</p>
      <ProfileDecorationSurface
        className="mt-3 aspect-[4/5] overflow-hidden rounded-2xl border bg-gradient-to-br from-background via-card to-primary/10 p-5"
        decorations={[decoration]}
        forceReducedMotion={forceReducedMotion}
      >
        <div
          className="grid h-full place-items-center rounded-xl border"
          data-profile-shell
        >
          <div className="text-center">
            <div
              className="relative mx-auto size-16"
              data-profile-avatar-decoration
            >
              <div
                className="size-16 rounded-full bg-muted"
                data-profile-avatar
              />
            </div>
            <p className="mt-4 font-bold" data-profile-name>
              Identidad legible
            </p>
          </div>
        </div>
      </ProfileDecorationSurface>
    </article>
  );
}
