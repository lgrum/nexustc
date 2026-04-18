import { ArrowLeftDoubleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TAXONOMIES } from "@repo/shared/constants";
import { useStore } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { GenerateMarkdownLinkDialog } from "@/components/admin/generate-md-link-dialog";
import { ManualEngagementQuestionsField } from "@/components/admin/manual-engagement-questions-field";
import { URLShortenerDialog } from "@/components/admin/url-shortener-dialog";
import { HasPermissions } from "@/components/auth/has-role";
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

export function ComicFormFields({ terms }: ComicFormFieldsProps) {
  const form = useTypedAppFormContext({
    defaultValues: {} as SharedComicFormValues,
  });
  const groupedTerms: GroupedComicTerms = Object.groupBy(
    terms,
    (term) => term.taxonomy
  );
  const adsLinks = useStore(form.store, (state) => state.values.adsLinks);
  const premiumLinks = useStore(
    form.store,
    (state) => state.values.premiumLinks
  );
  const [tagsContent, setTagsContent] = useState("");
  const [tagsDialogVisible, setTagsDialogVisible] = useState(false);

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

    form.setFieldValue("tags", foundTags);
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

  return (
    <div className="grid grid-cols-2 gap-4">
      <form.AppField name="title">
        {(field) => (
          <field.TextField label="Nombre" placeholder="Nombre" required />
        )}
      </form.AppField>

      <div className="col-span-2 flex flex-row gap-4">
        <div className="flex-1 space-y-4">
          <form.AppField name="adsLinks">
            {(field) => (
              <field.TextareaField
                className="h-40 resize-none"
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
        <div className="flex flex-1 flex-col gap-4">
          <form.AppField name="premiumLinks">
            {(field) => (
              <field.TextareaField
                className="h-40 resize-none"
                label="Links Premium"
              />
            )}
          </form.AppField>
        </div>
      </div>

      <div className="col-span-2 flex flex-row gap-4">
        <div className="flex-1 space-y-4 rounded-xl border border-border/70 bg-muted/35 p-4 shadow-xs">
          <Markdown>{adsLinks}</Markdown>
        </div>
        <div className="flex-1 space-y-4 rounded-xl border border-border/70 bg-muted/35 p-4 shadow-xs">
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
            label="Media"
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
