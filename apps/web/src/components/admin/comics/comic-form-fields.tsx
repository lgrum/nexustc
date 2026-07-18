import { ArrowLeftDoubleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TAXONOMIES } from "@repo/shared/constants";
import { COMIC_EARLY_ACCESS_DEFAULTS } from "@repo/shared/early-access";
import { COMIC_MEDIA_MAX_ITEMS } from "@repo/shared/media";
import { useStore } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { ComicCreatorSelectField } from "@/components/admin/comic-creators/comic-creator-select-field";
import { GenerateMarkdownLinkDialog } from "@/components/admin/generate-md-link-dialog";
import { ManualEngagementQuestionsField } from "@/components/admin/manual-engagement-questions-field";
import { ScheduledReleaseField } from "@/components/admin/scheduled-release-field";
import { SeriesField } from "@/components/admin/series-field";
import { TranslatorSelectField } from "@/components/admin/translators/translator-select-field";
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
import type { comicAdminFormSchema } from "@/lib/deferred-media";
import { removeUrls } from "@/lib/utils";

type ComicTermOption = {
  id: string;
  name: string;
  taxonomy: (typeof TAXONOMIES)[number];
};

type GroupedComicTerms = Partial<
  Record<(typeof TAXONOMIES)[number], ComicTermOption[]>
>;

type SharedComicFormValues = z.input<typeof comicAdminFormSchema>;

type ComicFormFieldsProps = {
  series: {
    id: string;
    title: string;
    type: "post" | "comic";
  }[];
  terms: ComicTermOption[];
};

const DOCUMENT_STATUS_OPTIONS = [
  { label: "Publicar", value: "publish" },
  { label: "Pendiente", value: "pending" },
  { label: "Borrador", value: "draft" },
  { label: "Basura", value: "trash" },
] as const;

const mapTermOptions = (terms?: ComicTermOption[]) =>
  terms?.map((term) => ({
    label: term.name,
    value: term.id,
  })) ?? [];

const appendUniqueValues = (
  currentValues: string[],
  valuesToAppend: string[]
) => [...new Set([...currentValues, ...valuesToAppend])];

export function ComicFormFields({ series, terms }: ComicFormFieldsProps) {
  const form = useTypedAppFormContext({
    defaultValues: {} as SharedComicFormValues,
  });
  const groupedTerms: GroupedComicTerms = Object.groupBy(
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

      <form.AppField name="style">
        {(field) => (
          <field.SelectField
            label="Estilo"
            options={mapTermOptions(groupedTerms.style)}
            required
          />
        )}
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
                  Estreno escalonado
                </h2>
                <p className="max-w-2xl text-amber-50/80 text-sm leading-relaxed">
                  El comic abre primero para VIP 8, luego VIP 5 y finalmente
                  quedar público.
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
                      {COMIC_EARLY_ACCESS_DEFAULTS.enabled ? "ON" : "OFF"} por
                      defecto
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
                    VIP 8 o superior entra primero durante 24 horas por defecto.
                  </FieldDescription>
                  <ErrorField field={field} />
                </div>
              )}
            </form.AppField>

            <form.AppField name="vip8EarlyAccessHours">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Ventana VIP 5 (horas)</Label>
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
                    Después, el acceso se amplía a VIP 5 durante 24 horas por
                    defecto.
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
                Quedará libre para todos tras {totalEarlyAccessHours} horas.
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

      <div className="col-span-2 space-x-2">
        <HasPermissions permissions={{ shortener: ["use"] }}>
          <URLShortenerDialog shortenerCount={2} />
        </HasPermissions>
        <GenerateMarkdownLinkDialog />
      </div>

      <form.AppField name="censorship">
        {(field) => (
          <field.SelectField
            label="Censura"
            options={mapTermOptions(groupedTerms.censorship)}
          />
        )}
      </form.AppField>

      <form.AppField name="status">
        {(field) => (
          <field.SelectField
            label="Estado"
            options={mapTermOptions(groupedTerms.status)}
            required
          />
        )}
      </form.AppField>

      <div className="flex flex-row items-end gap-2">
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

      <SeriesField contentLabel="comic" series={series} />

      <ComicCreatorSelectField />

      <TranslatorSelectField />

      <section className="col-span-2">
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

      <form.AppField name="mediaSelection">
        {(field) => (
          <field.MediaField
            description="Selecciona y ordena las paginas del comic desde la biblioteca central."
            directUpload
            label="Media"
            maxItems={COMIC_MEDIA_MAX_ITEMS}
            ownerKind="Comic"
          />
        )}
      </form.AppField>

      <form.AppField name="coverImageSelection">
        {(field) => (
          <field.MediaField
            description="Opcional. Si no eliges una portada, se usara la primera pagina del comic."
            label="Imagen de portada"
            maxItems={1}
            ownerKind="Comic"
          />
        )}
      </form.AppField>
    </div>
  );
}
