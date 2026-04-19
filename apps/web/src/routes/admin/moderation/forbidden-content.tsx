import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { orpcClient, queryClient } from "@/lib/orpc";

type ForbiddenKind = "term" | "word" | "url";

const FORBIDDEN_CONTENT_QUERY_KEY = ["moderation", "forbidden-content"];

const kindLabels: Record<ForbiddenKind, string> = {
  term: "Termino",
  url: "URL",
  word: "Palabra exacta",
};

export const Route = createFileRoute("/admin/moderation/forbidden-content")({
  component: RouteComponent,
  loader: () => orpcClient.moderation.listForbiddenContentRules(),
  staleTime: 0,
});

function RouteComponent() {
  const initialRules = Route.useLoaderData();
  const [kind, setKind] = useState<ForbiddenKind>("term");
  const [value, setValue] = useState("");

  const { data: rules } = useQuery({
    initialData: initialRules,
    queryFn: () => orpcClient.moderation.listForbiddenContentRules(),
    queryKey: FORBIDDEN_CONTENT_QUERY_KEY,
  });

  const parsedValues = parseForbiddenValues(value);

  const createMutation = useMutation({
    mutationFn: () =>
      orpcClient.moderation.createForbiddenContentRules({
        kind,
        values: parsedValues,
      }),
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudieron guardar los terminos.";
      toast.error(message);
    },
    onSuccess: async (result) => {
      setValue("");
      await queryClient.invalidateQueries({
        queryKey: FORBIDDEN_CONTENT_QUERY_KEY,
      });
      toast.success(`Se guardaron ${result.created} elementos.`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      orpcClient.moderation.updateForbiddenContentRule({ id, isActive }),
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el termino.";
      toast.error(message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: FORBIDDEN_CONTENT_QUERY_KEY,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      orpcClient.moderation.deleteForbiddenContentRule({ id }),
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo eliminar el termino.";
      toast.error(message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: FORBIDDEN_CONTENT_QUERY_KEY,
      });
      toast.success("Termino eliminado.");
    },
  });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl">Contenido prohibido</h1>
        <p className="text-muted-foreground text-sm">
          Bloquea comentarios y resenas que incluyan terminos, palabras exactas
          o URLs no permitidas.
        </p>
      </div>

      <section className="grid gap-4 rounded-lg border p-4">
        <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="grid gap-2">
            <Label htmlFor="forbidden-kind">Tipo</Label>
            <Select
              onValueChange={(nextKind) =>
                setKind((nextKind ?? "term") as ForbiddenKind)
              }
              value={kind}
            >
              <SelectTrigger className="w-full" id="forbidden-kind">
                <SelectValue>{kindLabels[kind]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="term">{kindLabels.term}</SelectItem>
                <SelectItem value="word">{kindLabels.word}</SelectItem>
                <SelectItem value="url">{kindLabels.url}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="forbidden-values">Valores</Label>
            <Textarea
              className="min-h-32"
              id="forbidden-values"
              onChange={(event) => setValue(event.target.value)}
              placeholder="Un elemento por linea"
              value={value}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={parsedValues.length === 0}
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
            type="button"
          >
            <HugeiconsIcon className="size-4" icon={PlusSignIcon} />
            Agregar
          </Button>
          {parsedValues.length > 0 && (
            <Badge variant="outline">
              {parsedValues.length} listo{parsedValues.length === 1 ? "" : "s"}
            </Badge>
          )}
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border p-4">
        <div>
          <h2 className="font-semibold text-lg">Reglas activas</h2>
          <p className="text-muted-foreground text-sm">
            Las reglas desactivadas quedan guardadas, pero no bloquean nuevas
            publicaciones.
          </p>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((rule) => (
              <TableRow key={rule.id}>
                <TableCell>{kindLabels[rule.kind]}</TableCell>
                <TableCell className="max-w-[420px] whitespace-normal break-words font-medium">
                  {rule.value}
                </TableCell>
                <TableCell>
                  <Badge variant={rule.isActive ? "default" : "outline"}>
                    {rule.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      disabled={updateMutation.isPending}
                      onClick={() =>
                        updateMutation.mutate({
                          id: rule.id,
                          isActive: !rule.isActive,
                        })
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {rule.isActive ? "Desactivar" : "Activar"}
                    </Button>
                    <Button
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(rule.id)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <HugeiconsIcon className="size-4" icon={Delete02Icon} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rules.length === 0 && (
              <TableRow>
                <TableCell
                  className="py-8 text-center text-muted-foreground"
                  colSpan={4}
                >
                  No hay contenido prohibido configurado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </main>
  );
}

function parseForbiddenValues(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
