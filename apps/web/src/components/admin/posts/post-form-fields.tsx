import { ArrowLeftDoubleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  PREMIUM_LINK_ACCESS_LEVEL_LABELS,
  PREMIUM_LINK_ACCESS_LEVELS,
} from "@repo/shared/constants";
import type { TAXONOMIES } from "@repo/shared/constants";
import { useStore } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { CreatorCreateDialog } from "@/components/admin/creators/creator-create-dialog";
import { GenerateMarkdownLinkDialog } from "@/components/admin/generate-md-link-dialog";
import { ManualEngagementQuestionsField } from "@/components/admin/manual-engagement-questions-field";
import { SeriesField } from "@/components/admin/series-field";
import { URLShortenerDialog } from "@/components/admin/url-shortener-dialog";
import { HasPermissions } from "@/components/auth/has-role";
import { ErrorField } from "@/components/forms/error-field";
import { Markdown } from "@/components/markdown";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import type { orpcClient } from "@/lib/orpc";
import { orpc } from "@/lib/orpc";
import { getBucketUrl, removeUrls } from "@/lib/utils";

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

type CreatorListItem = Awaited<
  ReturnType<typeof orpcClient.creator.admin.list>
>[number];

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

function getInitials(value: string) {
  const words = value.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (words.length === 0) {
    return "CR";
  }

  return words.map((word) => word[0]?.toUpperCase() ?? "").join("");
}

export function PostFormFields({ series, terms }: PostFormFieldsProps) {
  const form = useTypedAppFormContext({
    defaultValues: {} as SharedPostFormValues,
  });
  const groupedTerms: GroupedPostTerms = Object.groupBy(
    terms,
    (term) => term.taxonomy
  );
  const { data: creators } = useSuspenseQuery(
    orpc.creator.admin.list.queryOptions()
  );
  const adsLinks = useStore(form.store, (state) => state.values.adsLinks);
  const creatorId = useStore(form.store, (state) => state.values.creatorId);
  const creatorLink = useStore(form.store, (state) => state.values.creatorLink);
  const creatorName = useStore(form.store, (state) => state.values.creatorName);
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
  const [creatorDialogOpen, setCreatorDialogOpen] = useState(false);
  const [creatorSearch, setCreatorSearch] = useState("");
  const totalEarlyAccessHours =
    (vip12EarlyAccessHours ?? 0) + (vip8EarlyAccessHours ?? 0);
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
                <h2 className="font-[Lexend] font-bold text-white text-xl">
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
              <div className="mt-2 font-[Lexend] font-bold text-3xl text-white">
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

      <SeriesField contentLabel="juego" series={series} />

      <section className="col-span-2 space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-medium text-sm">Creador</h3>
            <p className="text-muted-foreground text-sm">
              Selecciona un creador existente o registra uno nuevo sin salir del
              post.
            </p>
          </div>
          {selectedCreator ? (
            <Button
              onClick={clearCreatorSelection}
              type="button"
              variant="ghost"
            >
              Quitar
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/80 p-3">
          <Avatar className="size-14" size="lg">
            {selectedCreator?.media.objectKey ? (
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
                Este post tiene datos de creador cargados, pero todavia no esta
                vinculado a un registro reusable.
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
            <DialogContent className="sm:max-w-2xl">
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
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {filteredCreators.length > 0 ? (
                    filteredCreators.map((creatorItem) => (
                      <button
                        className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-background p-3 text-left transition-colors hover:bg-muted/60"
                        key={creatorItem.id}
                        onClick={() => handleCreatorSelect(creatorItem)}
                        type="button"
                      >
                        <Avatar className="size-12" size="lg">
                          <AvatarImage
                            alt={creatorItem.name}
                            src={getBucketUrl(creatorItem.media.objectKey)}
                          />
                          <AvatarFallback>
                            {getInitials(creatorItem.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm">
                            {creatorItem.name}
                          </div>
                          <div className="truncate text-muted-foreground text-sm">
                            {creatorItem.url}
                          </div>
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {creatorItem.usageCount} post
                          {creatorItem.usageCount === 1 ? "" : "s"}
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
