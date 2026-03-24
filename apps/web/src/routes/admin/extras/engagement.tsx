import { engagementQuestionCreateSchema } from "@repo/shared/schemas";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EngagementPromptBlock } from "@/components/posts/engagement-prompt-block";
import { TermBadge } from "@/components/term-badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { orpc, orpcClient } from "@/lib/orpc";
import { cn } from "@/lib/utils";

const dashboardQuery = orpc.engagementQuestion.getDashboardData.queryOptions();
const SAMPLE_PROMPT =
  "Quitando el morbo... este post vende mejor su fantasia con el tono o con el conflicto?";
const ACTIVE_FILTER_OPTIONS = [
  { label: "Todas", value: "all" },
  { label: "Activas", value: "active" },
  { label: "Inactivas", value: "inactive" },
] as const;
const ALL_TAG_FILTER = { label: "Todos", value: "all" } as const;
const GLOBAL_TAG_FILTER = { label: "Globales", value: "global" } as const;

type FormState = {
  tagTermId: string;
  isGlobal: boolean;
  text: string;
  isActive: boolean;
};

function getInitialFormState(tagTermId = ""): FormState {
  return {
    isActive: true,
    isGlobal: false,
    tagTermId,
    text: "",
  };
}

export const Route = createFileRoute("/admin/extras/engagement")({
  component: RouteComponent,
});

function RouteComponent() {
  const { data } = useSuspenseQuery(dashboardQuery);
  const queryClient = useQueryClient();
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    null
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [formState, setFormState] = useState<FormState>(() =>
    getInitialFormState(data.tagTerms[0]?.id ?? "")
  );

  const selectedQuestion = useMemo(
    () =>
      data.questions.find((question) => question.id === selectedQuestionId) ??
      null,
    [data.questions, selectedQuestionId]
  );

  useEffect(() => {
    if (!selectedQuestion) {
      setFormState((current) =>
        getInitialFormState(data.tagTerms[0]?.id ?? current.tagTermId ?? "")
      );
      return;
    }

    setFormState({
      isActive: selectedQuestion.isActive,
      isGlobal: selectedQuestion.isGlobal,
      tagTermId: selectedQuestion.tagTermId ?? "",
      text: selectedQuestion.text,
    });
  }, [data.tagTerms, selectedQuestion]);

  const filteredQuestions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es");

    return data.questions.filter((question) => {
      const tagName = question.tagTerm?.name ?? "global";
      const matchesSearch =
        normalizedSearch.length === 0 ||
        question.text.toLocaleLowerCase("es").includes(normalizedSearch) ||
        tagName.toLocaleLowerCase("es").includes(normalizedSearch);
      const matchesTag =
        tagFilter === ALL_TAG_FILTER.value ||
        (tagFilter === GLOBAL_TAG_FILTER.value
          ? question.isGlobal
          : question.tagTermId === tagFilter);
      const matchesActive =
        activeFilter === "all" ||
        (activeFilter === "active" ? question.isActive : !question.isActive);

      return matchesSearch && matchesTag && matchesActive;
    });
  }, [activeFilter, data.questions, search, tagFilter]);

  const invalidateDashboard = async () => {
    await queryClient.invalidateQueries({ queryKey: dashboardQuery.queryKey });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        isActive: formState.isActive,
        isGlobal: formState.isGlobal,
        locale: "es" as const,
        tagTermId: formState.isGlobal ? undefined : formState.tagTermId,
        text: formState.text,
      };

      if (selectedQuestion) {
        return orpcClient.engagementQuestion.edit({
          ...payload,
          id: selectedQuestion.id,
        });
      }

      return orpcClient.engagementQuestion.create(payload);
    },
    onError: (error) => {
      toast.error(`No se pudo guardar la pregunta: ${error}`);
    },
    onSuccess: async (result) => {
      await invalidateDashboard();
      setSelectedQuestionId(result?.id ?? null);
      toast.success(
        selectedQuestion ? "Pregunta actualizada" : "Pregunta creada"
      );
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (payload: { id: string; isActive: boolean }) =>
      orpcClient.engagementQuestion.toggleActive(payload),
    onError: (error) => {
      toast.error(`No se pudo actualizar el estado: ${error}`);
    },
    onSuccess: async () => {
      await invalidateDashboard();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => orpcClient.engagementQuestion.delete({ id }),
    onError: (error) => {
      toast.error(`No se pudo eliminar la pregunta: ${error}`);
    },
    onSuccess: async () => {
      await invalidateDashboard();
      setDeleteDialogOpen(false);
      setSelectedQuestionId(null);
      toast.success("Pregunta eliminada");
    },
  });

  const onSave = async () => {
    const result = engagementQuestionCreateSchema.safeParse({
      isActive: formState.isActive,
      isGlobal: formState.isGlobal,
      locale: "es",
      tagTermId: formState.isGlobal ? undefined : formState.tagTermId,
      text: formState.text,
    });

    if (!result.success) {
      const firstIssue =
        result.error.issues[0]?.message ?? "Formulario invalido";
      toast.error(firstIssue);
      return;
    }

    await saveMutation.mutateAsync();
  };

  const onDelete = async () => {
    if (!selectedQuestion) {
      return;
    }

    await deleteMutation.mutateAsync(selectedQuestion.id);
  };

  const previewText = formState.text.trim() || SAMPLE_PROMPT;
  const currentTagFilterLabel =
    tagFilter === ALL_TAG_FILTER.value
      ? ALL_TAG_FILTER.label
      : tagFilter === GLOBAL_TAG_FILTER.value
        ? GLOBAL_TAG_FILTER.label
        : (data.tagTerms.find((tagTerm) => tagTerm.id === tagFilter)?.name ??
          ALL_TAG_FILTER.label);

  return (
    <main className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
      <Card>
        <CardHeader>
          <CardTitle>
            {selectedQuestion ? "Editar pregunta" : "Nueva pregunta"}
          </CardTitle>
          <CardDescription>
            Banco editorial por tag o global para el bloque fijo encima de
            comentarios.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <Label
                className="font-medium text-sm"
                htmlFor="engagement-global-switch"
              >
                Pregunta global
              </Label>
              <div className="text-muted-foreground text-sm">
                Si esta activa, la pregunta puede salir en cualquier post.
              </div>
            </div>
            <Switch
              checked={formState.isGlobal}
              id="engagement-global-switch"
              onCheckedChange={(checked) => {
                setFormState((current) => ({
                  ...current,
                  isGlobal: checked,
                  tagTermId:
                    !checked && current.tagTermId.length === 0
                      ? (data.tagTerms[0]?.id ?? "")
                      : current.tagTermId,
                }));
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="engagement-tag-term">Tag</Label>
            {formState.isGlobal ? (
              <div className="rounded-lg border border-border border-dashed px-3 py-3 text-muted-foreground text-sm">
                Las preguntas globales no requieren tag.
              </div>
            ) : (
              <Select
                onValueChange={(value) => {
                  setFormState((current) => ({
                    ...current,
                    tagTermId: value ?? "",
                  }));
                }}
                value={formState.tagTermId}
              >
                <SelectTrigger className="w-full" id="engagement-tag-term">
                  <SelectValue>
                    {data.tagTerms.find(
                      (tagTerm) => tagTerm.id === formState.tagTermId
                    )?.name ?? "Seleccionar tag"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {data.tagTerms.map((tagTerm) => (
                    <SelectItem key={tagTerm.id} value={tagTerm.id}>
                      {tagTerm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="engagement-text">Pregunta</Label>
            <Textarea
              className="min-h-36"
              id="engagement-text"
              maxLength={220}
              onChange={(event) => {
                setFormState((current) => ({
                  ...current,
                  text: event.target.value,
                }));
              }}
              placeholder="Seamos honestos... que detalle empuja de verdad la tension de este tag?"
              value={formState.text}
            />
            <FieldDescription>
              Tono provocativo, postura clara y sin descripcion grafica
              explicita.
            </FieldDescription>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <Label
                className="font-medium text-sm"
                htmlFor="engagement-active-switch"
              >
                Pregunta activa
              </Label>
              <div className="text-muted-foreground text-sm">
                Solo las preguntas activas entran al selector automatico.
              </div>
            </div>
            <Switch
              checked={formState.isActive}
              id="engagement-active-switch"
              onCheckedChange={(checked) => {
                setFormState((current) => ({
                  ...current,
                  isActive: checked,
                }));
              }}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              loading={saveMutation.isPending}
              onClick={onSave}
              type="button"
            >
              {selectedQuestion ? "Guardar cambios" : "Crear pregunta"}
            </Button>
            <Button
              onClick={() => {
                setSelectedQuestionId(null);
                setFormState(getInitialFormState(data.tagTerms[0]?.id ?? ""));
              }}
              type="button"
              variant="outline"
            >
              Nueva
            </Button>
            <Button
              disabled={!selectedQuestion}
              onClick={() => setDeleteDialogOpen(true)}
              type="button"
              variant="ghost"
            >
              Eliminar
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <div className="font-medium text-sm">Vista previa</div>
              <div className="text-muted-foreground text-sm">
                Asi se vera dentro del bloque no interactivo del post.
              </div>
            </div>
            <EngagementPromptBlock
              prompts={[
                {
                  id: "preview",
                  source: "tag",
                  tagTermId: formState.isGlobal ? null : formState.tagTermId,
                  text: previewText,
                },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preguntas por tag y globales</CardTitle>
          <CardDescription>
            {filteredQuestions.length} preguntas visibles de{" "}
            {data.questions.length} cargadas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="engagement-search">Buscar</Label>
              <Input
                id="engagement-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por texto, tag o global"
                value={search}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="engagement-active-filter">Estado</Label>
              <Select
                onValueChange={(value) => {
                  setActiveFilter(
                    (value as "all" | "active" | "inactive" | null) ?? "all"
                  );
                }}
                value={activeFilter}
              >
                <SelectTrigger className="w-full" id="engagement-active-filter">
                  <SelectValue>
                    {ACTIVE_FILTER_OPTIONS.find(
                      (option) => option.value === activeFilter
                    )?.label ?? "Todas"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ACTIVE_FILTER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="engagement-tag-filter">Filtrar alcance</Label>
            <Select
              onValueChange={(value) => setTagFilter(value ?? "all")}
              value={tagFilter}
            >
              <SelectTrigger className="w-full" id="engagement-tag-filter">
                <SelectValue>{currentTagFilterLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_TAG_FILTER.value}>
                  {ALL_TAG_FILTER.label}
                </SelectItem>
                <SelectItem value={GLOBAL_TAG_FILTER.value}>
                  {GLOBAL_TAG_FILTER.label}
                </SelectItem>
                {data.tagTerms.map((tagTerm) => (
                  <SelectItem key={tagTerm.id} value={tagTerm.id}>
                    {tagTerm.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {filteredQuestions.map((question) => {
              const isSelected = question.id === selectedQuestionId;

              return (
                <button
                  className={cn(
                    "w-full rounded-xl border border-border px-4 py-3 text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/40"
                  )}
                  key={question.id}
                  onClick={() => setSelectedQuestionId(question.id)}
                  type="button"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {question.isGlobal ? (
                        <Badge variant="secondary">Global</Badge>
                      ) : question.tagTerm ? (
                        <TermBadge
                          tag={{
                            color: question.tagTerm.color,
                            name: question.tagTerm.name,
                          }}
                        />
                      ) : null}
                      <Badge
                        variant={question.isActive ? "default" : "outline"}
                      >
                        {question.isActive ? "Activa" : "Inactiva"}
                      </Badge>
                    </div>
                    <Switch
                      checked={question.isActive}
                      onCheckedChange={(checked) => {
                        toggleMutation.mutate({
                          id: question.id,
                          isActive: checked,
                        });
                      }}
                    />
                  </div>
                  <p className="text-pretty text-foreground text-sm leading-relaxed">
                    {question.text}
                  </p>
                </button>
              );
            })}

            {filteredQuestions.length === 0 && (
              <div className="rounded-xl border border-border border-dashed px-4 py-8 text-center text-muted-foreground text-sm">
                No hay preguntas que coincidan con los filtros actuales.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar pregunta</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion quita la pregunta del banco editorial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await onDelete();
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
