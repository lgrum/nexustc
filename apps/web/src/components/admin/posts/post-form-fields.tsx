import { ArrowLeftDoubleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PREMIUM_LINK_ACCESS_LEVEL_LABELS,
  PREMIUM_LINK_ACCESS_LEVELS,
} from "@repo/shared/constants";
import type { TAXONOMIES } from "@repo/shared/constants";
import { useStore } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { CreatorSelectField } from "@/components/admin/creators/creator-select-field";
import { GenerateMarkdownLinkDialog } from "@/components/admin/generate-md-link-dialog";
import { ManualEngagementQuestionsField } from "@/components/admin/manual-engagement-questions-field";
import { ScheduledReleaseField } from "@/components/admin/scheduled-release-field";
import { SeriesField } from "@/components/admin/series-field";
import { URLShortenerDialog } from "@/components/admin/url-shortener-dialog";
import { HasPermissions } from "@/components/auth/has-role";
import { ErrorField } from "@/components/forms/error-field";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTypedAppFormContext } from "@/hooks/use-app-form";
import type { postAdminFormSchema } from "@/lib/deferred-media";
import { removeUrls } from "@/lib/utils";

type PostTermOption = {
  id: string;
  name: string;
};

type PostTermTaxonomy = (typeof TAXONOMIES)[number];

type PostFormTerm = PostTermOption & {
  taxonomy: PostTermTaxonomy;
};

type GroupedPostTerms = Partial<Record<PostTermTaxonomy, PostFormTerm[]>>;

type SharedPostFormValues = z.input<typeof postAdminFormSchema>;

type PostFormFieldsProps = {
  series: {
    id: string;
    title: string;
    type: "post" | "comic";
  }[];
  terms: PostFormTerm[];
};

const DOCUMENT_STATUS_OPTIONS = [
  { label: "Publicar", value: "publish" },
  { label: "Pendiente", value: "pending" },
  { label: "Borrador", value: "draft" },
  { label: "Basura", value: "trash" },
] as const;

const PREMIUM_LINK_ACCESS_LEVEL_OPTIONS = PREMIUM_LINK_ACCESS_LEVELS.map(
  (value) => ({
    label: PREMIUM_LINK_ACCESS_LEVEL_LABELS[value],
    value,
  })
);

const mapTermOptions = (terms?: PostTermOption[]) =>
  terms?.map((term) => ({
    label: term.name,
    value: term.id,
  })) ?? [];

const appendUniqueValues = (
  currentValues: string[],
  valuesToAppend: string[]
) => [...new Set([...currentValues, ...valuesToAppend])];

export function PostFormFields({ series, terms }: PostFormFieldsProps) {
  const form = useTypedAppFormContext({
    defaultValues: {} as SharedPostFormValues,
  });
  const groupedTerms: GroupedPostTerms = Object.groupBy(
    terms,
    (term) => term.taxonomy
  );
  const adsLinks = useStore(form.store, (state) => state.values.adsLinks);
  const documentStatus = useStore(
    form.store,
    (state) => state.values.documentStatus
  );
  const earlyAccessEnabled = useStore(
    form.store,
    (state) => state.values.earlyAccessEnabled
  );
  const premiumLinks = useStore(
    form.store,
    (state) => state.values.premiumLinks
  );
  const vip12EarlyAccessHours = useStore(
    form.store,
    (state) => state.values.vip12EarlyAccessHours
  );
  const vip8EarlyAccessHours = useStore(
    form.store,
    (state) => state.values.vip8EarlyAccessHours
  );
  const [tagsContent, setTagsContent] = useState("");
  const [tagsDialogVisible, setTagsDialogVisible] = useState(false);
  const totalEarlyAccessHours =
    (vip12EarlyAccessHours ?? 0) + (vip8EarlyAccessHours ?? 0);

  const extractTags = () => {
    if (tagsContent.trim() === "") {
      setTagsDialogVisible(false);
      return;
    }

    const tags = tagsContent.split(",").map((tag) => tag.trim());
    const foundTags: string[] = [];
    const notFoundTags: string[] = [];

    for (const tag of tags) {
      const foundTag = groupedTerms.tag?.find(
        (term) => term.name.toLowerCase() === tag.toLowerCase()
      );
      if (foundTag) {
        foundTags.push(foundTag.id);
      } else {
        notFoundTags.push(tag);
      }
    }

    if (foundTags.length > 0) {
      form.setFieldValue(
        "tags",
        appendUniqueValues(form.getFieldValue("tags"), foundTags)
      );
    }

    setTagsContent("");
    setTagsDialogVisible(false);
    if (notFoundTags.length > 0) {
      toast.error(
        `No se encontraron los siguientes tags: ${notFoundTags.join(", ")}`,
        {
          closeButton: true,
          dismissible: true,
          duration: Number.POSITIVE_INFINITY,
        }
      );
    }
  };

  const copyTags = async () => {
    const tagsById = new Map(groupedTerms.tag?.map((tag) => [tag.id, tag]));
    const tagNames = form
      .getFieldValue("tags")
      .map((tagId) => tagsById.get(tagId)?.name)
      .filter((name): name is string => Boolean(name));

    try {
      await navigator.clipboard.writeText(tagNames.join(", "));
      toast.success("Tags copiados al portapapeles");
    } catch {
      toast.error("No se pudieron copiar los tags");
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <form.AppField name="title">
        {(field) => (
          <field.TextField label="Nombre" placeholder="Nombre" required />
        )}
      </form.AppField>

      <form.AppField name="version">
        {(field) => <field.TextField label="Versión" placeholder="Versión" />}
      </form.AppField>

      <section className="col-span-2 rounded-[28px] border border-amber-500/25 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_45%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.18),transparent_40%),rgba(15,23,42,0.72)] p-5 shadow-[0_24px_80px_-52px_rgba(251,191,36,0.85)]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center rounded-full border border-amber-300/25 bg-black/20 px-3 py-1 font-semibold text-[11px] text-amber-200 uppercase tracking-[0.24em]">
                VIP Early Access
              </div>
              <div className="space-y-1">
                <h2 className="font-lexend font-bold text-white text-xl">
                  Estreno escalonado por defecto
                </h2>
                <p className="max-w-2xl text-amber-50/80 text-sm leading-relaxed">
                  Cada juego nuevo pasa primero por VIP 12, luego VIP 8 y al
                  final sale para todos. Si esta publicación necesita otra
                  lógica, puedes ajustar la ventana sin tocar nada más.
                </p>
              </div>
            </div>

            <form.AppField name="earlyAccessEnabled">
              {(field) => (
                <div className="flex items-center justify-between gap-3 rounded-full border border-white/10 bg-white/8 px-4 py-2 backdrop-blur">
                  <div className="flex flex-col">
                    <span className="font-medium text-sm text-white">
                      Enable Early Access
                    </span>
                    <span className="text-[11px] text-amber-100/70">
                      ON por defecto
                    </span>
                  </div>
                  <Switch
                    checked={field.state.value}
                    onCheckedChange={(value) => field.handleChange(value)}
                  />
                </div>
              )}
            </form.AppField>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <form.AppField name="vip12EarlyAccessHours">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Ventana VIP 12 (horas)</Label>
                  <Input
                    disabled={!earlyAccessEnabled}
                    id={field.name}
                    min={0}
                    onChange={(event) =>
                      field.handleChange(Number(event.target.value) || 0)
                    }
                    step={1}
                    type="number"
                    value={String(field.state.value ?? 0)}
                  />
                  <FieldDescription>
                    Solo VIP 12 puede entrar primero cuando el post abre.
                  </FieldDescription>
                  <ErrorField field={field} />
                </div>
              )}
            </form.AppField>

            <form.AppField name="vip8EarlyAccessHours">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Ventana VIP 8 (horas)</Label>
                  <Input
                    disabled={!earlyAccessEnabled}
                    id={field.name}
                    min={0}
                    onChange={(event) =>
                      field.handleChange(Number(event.target.value) || 0)
                    }
                    step={1}
                    type="number"
                    value={String(field.state.value ?? 0)}
                  />
                  <FieldDescription>
                    Después de VIP 12, el acceso se amplía a VIP 8.
                  </FieldDescription>
                  <ErrorField field={field} />
                </div>
              )}
            </form.AppField>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="font-medium text-[11px] text-amber-200 uppercase tracking-[0.22em]">
                Salida pública
              </div>
              <div className="mt-2 font-lexend font-bold text-3xl text-white">
                {totalEarlyAccessHours}h
              </div>
              <p className="mt-2 max-w-48 text-amber-50/75 text-sm leading-relaxed">
                Este contenido quedará libre para todos tras{" "}
                {totalEarlyAccessHours} horas desde su primera publicación.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-4">
        <div className="min-w-0 space-y-4">
          <form.AppField name="adsLinks">
            {(field) => (
              <field.TextareaField
                className="h-40 min-w-0 resize-none"
                label="Links con Anuncios"
              />
            )}
          </form.AppField>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="w-px flex-1 bg-border" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    form.setFieldValue("adsLinks", removeUrls(premiumLinks));
                  }}
                />
              }
            >
              <HugeiconsIcon icon={ArrowLeftDoubleIcon} />
            </TooltipTrigger>
            <TooltipContent>
              Copia Links Premium a Links con Anuncios, eliminando URLs
            </TooltipContent>
          </Tooltip>
          <div className="w-px flex-1 bg-border" />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <form.AppField name="premiumLinks">
            {(field) => (
              <field.TextareaField
                className="h-40 min-w-0 resize-none"
                label="Links Premium"
              />
            )}
          </form.AppField>
        </div>
      </div>

      <div className="col-span-2 grid grid-cols-2 gap-4">
        <div className="min-w-0 space-y-4 break-words rounded-xl border border-border/70 bg-muted/35 p-4 shadow-xs">
          <Markdown>{adsLinks}</Markdown>
        </div>
        <div className="min-w-0 space-y-4 break-words rounded-xl border border-border/70 bg-muted/35 p-4 shadow-xs">
          <Markdown>{premiumLinks}</Markdown>
        </div>
      </div>

      <div className="col-span-2 space-x-2 space-y-2">
        <HasPermissions permissions={{ shortener: ["use"] }}>
          <URLShortenerDialog />
        </HasPermissions>
        <GenerateMarkdownLinkDialog />
      </div>

      <div className="flex flex-row col-span-2 items-end gap-2">
        <form.AppField name="tags">
          {(field) => (
            <field.MultiSelectField
              className="w-full"
              label="Tags"
              options={mapTermOptions(groupedTerms.tag)}
            />
          )}
        </form.AppField>
        <Dialog
          onOpenChange={(value) => setTagsDialogVisible(value)}
          open={tagsDialogVisible}
        >
          <DialogTrigger render={<Button type="button" />}>
            Insertar Tags
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Insertar Tags</DialogTitle>
            </DialogHeader>
            <Textarea
              onChange={(e) => setTagsContent(e.target.value)}
              value={tagsContent}
            />
            <DialogFooter>
              <Button onClick={extractTags} type="button">
                Extraer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button onClick={copyTags} type="button" variant="outline">
          Copiar Tags
        </Button>
      </div>

      <form.AppField name="status">
        {(field) => (
          <field.SelectField
            label="Estado"
            options={mapTermOptions(groupedTerms.status)}
          />
        )}
      </form.AppField>

      <form.AppField name="premiumLinksAccessLevel">
        {(field) => (
          <field.SelectField
            label="Acceso Links Premium"
            options={PREMIUM_LINK_ACCESS_LEVEL_OPTIONS}
          />
        )}
      </form.AppField>

      <form.AppField name="censorship">
        {(field) => (
          <field.SelectField
            label="Censura"
            options={mapTermOptions(groupedTerms.censorship)}
          />
        )}
      </form.AppField>

      <form.AppField name="engine">
        {(field) => (
          <field.SelectField
            label="Motor"
            options={mapTermOptions(groupedTerms.engine)}
          />
        )}
      </form.AppField>

      <form.AppField name="graphics">
        {(field) => (
          <field.SelectField
            label="Gráficos"
            options={mapTermOptions(groupedTerms.graphics)}
          />
        )}
      </form.AppField>

      <form.AppField name="platforms">
        {(field) => (
          <field.MultiSelectField
            label="Plataformas"
            options={mapTermOptions(groupedTerms.platform)}
          />
        )}
      </form.AppField>

      <form.AppField name="languages">
        {(field) => (
          <field.MultiSelectField
            label="Idiomas"
            options={mapTermOptions(groupedTerms.language)}
          />
        )}
      </form.AppField>

      <form.AppField name="documentStatus">
        {(field) => (
          <field.SelectField
            label="Estado del Documento"
            options={[...DOCUMENT_STATUS_OPTIONS]}
            required
          />
        )}
      </form.AppField>

      <form.AppField name="releasedAt">
        {(field) => (
          <ScheduledReleaseField
            disabled={documentStatus !== "publish"}
            errorField={field}
            name={field.name}
            onChange={field.handleChange}
            value={field.state.value}
          />
        )}
      </form.AppField>

      <SeriesField contentLabel="juego" series={series} />

      <CreatorSelectField />

      <section className="col-span-2 space-y-4">
        <form.AppField name="content">
          {(field) => (
            <field.TextareaField className="w-full" label="Acerca de" />
          )}
        </form.AppField>
        <form.AppField name="changelog">
          {(field) => (
            <field.TextareaField className="w-full" label="Cambios" />
          )}
        </form.AppField>
        <form.AppField name="manualEngagementQuestions">
          {(field) => (
            <ManualEngagementQuestionsField
              errors={field.state.meta.errors}
              onChange={field.handleChange}
              value={field.state.value}
            />
          )}
        </form.AppField>
      </section>

      <form.AppField name="thumbnailImageCount">
        {(field) => {
          const usesFourImages = (field.state.value ?? 4) === 4;

          return (
            <div className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor={field.name}>Miniaturas de tarjeta</Label>
                  <FieldDescription>
                    Usa la primera imagen de Media o arma el mosaico con hasta
                    cuatro imagenes. La portada no se usa aqui.
                  </FieldDescription>
                </div>
                <div className="flex shrink-0 items-center gap-3 rounded-full border border-border bg-background px-3 py-2">
                  <span className="font-medium text-muted-foreground text-xs">
                    1
                  </span>
                  <Switch
                    checked={usesFourImages}
                    id={field.name}
                    onCheckedChange={(checked) =>
                      field.handleChange(checked ? 4 : 1)
                    }
                  />
                  <span className="font-medium text-muted-foreground text-xs">
                    4
                  </span>
                </div>
              </div>
              <ErrorField field={field} />
            </div>
          );
        }}
      </form.AppField>

      <form.AppField name="mediaSelection">
        {(field) => (
          <field.MediaField
            description="Selecciona y ordena la media del post desde la biblioteca central."
            label="Media"
            ownerKind="Juego"
          />
        )}
      </form.AppField>

      <form.AppField name="coverImageSelection">
        {(field) => (
          <field.MediaField
            crop={{
              description:
                "Ajusta el encuadre de la portada para el hero del post.",
              title: "Recortar portada",
            }}
            description="Opcional. Si no eliges una portada, se usara la primera imagen de la media."
            label="Imagen de portada"
            maxItems={1}
            ownerKind="Juego"
          />
        )}
      </form.AppField>
    </div>
  );
}
