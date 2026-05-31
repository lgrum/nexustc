import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useDebounceEffect } from "@/hooks/use-debounce-effect";
import { getClientErrorMessage, orpcClient } from "@/lib/orpc";
import { ownerMiddleware } from "@/middleware/owner";

const WEBHOOK_REQUEST_LIMIT = 50;
const ALL_FILTER_VALUE = "all";
const RECONCILIATION_DEFAULT_LIMIT = 100;
const RECONCILIATION_MAX_LIMIT = 500;

type ReconciliationResult = Awaited<
  ReturnType<typeof orpcClient.patreon.admin.reconcileMemberships>
>;
type ReconciliationAction = ReconciliationResult["results"][number]["action"];

type ProcessingStatus =
  | "stored"
  | "processed"
  | "ignored"
  | "invalid"
  | "failed";

type WebhookMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const eventOptions = [
  "members:create",
  "members:update",
  "members:delete",
  "members:pledge:create",
  "members:pledge:update",
  "members:pledge:delete",
] as const;

const methodOptions: WebhookMethod[] = [
  "POST",
  "GET",
  "PUT",
  "PATCH",
  "DELETE",
];

const statusOptions: ProcessingStatus[] = [
  "stored",
  "processed",
  "ignored",
  "invalid",
  "failed",
];

const statusLabels: Record<ProcessingStatus, string> = {
  failed: "Fallido",
  ignored: "Ignorado",
  invalid: "Invalido",
  processed: "Procesado",
  stored: "Guardado",
};

const statusVariants: Record<
  ProcessingStatus,
  ComponentProps<typeof Badge>["variant"]
> = {
  failed: "destructive",
  ignored: "secondary",
  invalid: "destructive",
  processed: "default",
  stored: "outline",
};

const reconciliationActionLabels: Record<ReconciliationAction, string> = {
  deactivated: "Desactivado",
  failed: "Fallido",
  kept_active: "Activo",
  skipped_permanent: "Permanente",
};

const reconciliationActionVariants: Record<
  ReconciliationAction,
  ComponentProps<typeof Badge>["variant"]
> = {
  deactivated: "destructive",
  failed: "destructive",
  kept_active: "default",
  skipped_permanent: "secondary",
};

export const Route = createFileRoute("/admin/patreon/webhooks")({
  component: RouteComponent,
  loader: () =>
    orpcClient.patreon.admin.listWebhookRequests({
      limit: WEBHOOK_REQUEST_LIMIT,
      offset: 0,
    }),
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Webhooks de Patreon",
      },
    ],
  }),
  server: {
    middleware: [ownerMiddleware],
  },
  staleTime: 0,
});

function RouteComponent() {
  const initialData = Route.useLoaderData();
  const [bodyInput, setBodyInput] = useState("");
  const [bodyFilter, setBodyFilter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(ALL_FILTER_VALUE);
  const [method, setMethod] = useState(ALL_FILTER_VALUE);
  const [processingStatus, setProcessingStatus] = useState(ALL_FILTER_VALUE);
  const [responseStatusInput, setResponseStatusInput] = useState("");
  const [responseStatusFilter, setResponseStatusFilter] = useState("");
  const [reconciliationLimit, setReconciliationLimit] = useState(
    String(RECONCILIATION_DEFAULT_LIMIT)
  );
  const [reconciliationResult, setReconciliationResult] =
    useState<ReconciliationResult | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [signatureInput, setSignatureInput] = useState("");
  const [signatureFilter, setSignatureFilter] = useState("");

  useDebounceEffect(
    () => {
      setBodyFilter(bodyInput.trim());
    },
    300,
    [bodyInput]
  );

  useDebounceEffect(
    () => {
      setResponseStatusFilter(responseStatusInput.trim());
    },
    300,
    [responseStatusInput]
  );

  useDebounceEffect(
    () => {
      setSignatureFilter(signatureInput.trim());
    },
    300,
    [signatureInput]
  );

  const filters = useMemo(
    () => ({
      ...(bodyFilter ? { body: bodyFilter } : {}),
      ...(createdFrom
        ? { createdFrom: getDateBound(createdFrom, "start") }
        : {}),
      ...(createdTo ? { createdTo: getDateBound(createdTo, "end") } : {}),
      ...(selectedEvent === ALL_FILTER_VALUE ? {} : { event: selectedEvent }),
      ...(method === ALL_FILTER_VALUE
        ? {}
        : { method: method as WebhookMethod }),
      ...(processingStatus === ALL_FILTER_VALUE
        ? {}
        : { processingStatus: processingStatus as ProcessingStatus }),
      ...(responseStatusFilter
        ? { responseStatus: Number(responseStatusFilter) }
        : {}),
      ...(signatureFilter ? { signature: signatureFilter } : {}),
    }),
    [
      bodyFilter,
      createdFrom,
      createdTo,
      method,
      processingStatus,
      responseStatusFilter,
      selectedEvent,
      signatureFilter,
    ]
  );

  const hasActiveFilters = Object.keys(filters).length > 0;

  const webhookRequestsQuery = useQuery({
    initialData: hasActiveFilters ? undefined : initialData,
    queryFn: () =>
      orpcClient.patreon.admin.listWebhookRequests({
        filters,
        limit: WEBHOOK_REQUEST_LIMIT,
        offset: 0,
      }),
    queryKey: ["patreon", "webhook-requests", WEBHOOK_REQUEST_LIMIT, filters],
  });

  const requests = webhookRequestsQuery.data?.requests ?? [];
  const total = webhookRequestsQuery.data?.total ?? 0;

  const runReconciliation = async (dryRun: boolean) => {
    const parsedLimit = Number.parseInt(reconciliationLimit, 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), RECONCILIATION_MAX_LIMIT)
      : RECONCILIATION_DEFAULT_LIMIT;

    setIsReconciling(true);
    setReconciliationLimit(String(limit));

    try {
      const result = await orpcClient.patreon.admin.reconcileMemberships({
        dryRun,
        limit,
      });
      setReconciliationResult(result);
      toast.success(
        dryRun
          ? "Simulacion de Patreon completada"
          : "Reconciliacion de Patreon aplicada"
      );
    } catch (error) {
      toast.error(
        getClientErrorMessage(
          error,
          "No se pudo reconciliar las membresias de Patreon."
        )
      );
    } finally {
      setIsReconciling(false);
    }
  };

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <h1 className="font-bold text-2xl">Webhooks de Patreon</h1>
          <p className="max-w-3xl text-muted-foreground text-sm">
            Registro privado de las ultimas solicitudes recibidas en el endpoint
            de Patreon, incluyendo headers, body y resultado del procesamiento.
          </p>
        </div>
        <Button
          disabled={webhookRequestsQuery.isFetching}
          onClick={() => webhookRequestsQuery.refetch()}
          type="button"
          variant="outline"
        >
          <HugeiconsIcon className="size-4" icon={RefreshIcon} />
          Actualizar
        </Button>
      </div>

      <section className="grid gap-4 rounded-lg border p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-2">
            <h2 className="font-semibold text-lg">
              Reconciliacion de membresias
            </h2>
            <p className="max-w-3xl text-muted-foreground text-sm">
              Compara los usuarios VIP activos con Patreon y remueve perks
              cuando la membresia ya no es valida.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label htmlFor="patreon-reconciliation-limit">Limite</Label>
              <Input
                className="w-28"
                id="patreon-reconciliation-limit"
                inputMode="numeric"
                max={RECONCILIATION_MAX_LIMIT}
                min={1}
                onChange={(changeEvent) =>
                  setReconciliationLimit(changeEvent.target.value)
                }
                type="number"
                value={reconciliationLimit}
              />
            </div>
            <Button
              disabled={isReconciling}
              onClick={() => void runReconciliation(true)}
              type="button"
              variant="outline"
            >
              <HugeiconsIcon className="size-4" icon={RefreshIcon} />
              Simular
            </Button>
            <Button
              disabled={isReconciling}
              onClick={() => void runReconciliation(false)}
              type="button"
            >
              <HugeiconsIcon className="size-4" icon={RefreshIcon} />
              Aplicar
            </Button>
          </div>
        </div>

        {reconciliationResult && (
          <div className="grid gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={reconciliationResult.dryRun ? "outline" : "default"}
              >
                {reconciliationResult.dryRun ? "Simulacion" : "Aplicado"}
              </Badge>
              <Badge variant="secondary">
                Revisados {reconciliationResult.checked}
              </Badge>
              <Badge variant="destructive">
                Removidos {reconciliationResult.deactivated}
              </Badge>
              <Badge variant="default">
                Activos {reconciliationResult.keptActive}
              </Badge>
              <Badge variant="outline">
                Fallidos {reconciliationResult.failed}
              </Badge>
              <Badge variant="secondary">
                Permanentes {reconciliationResult.skippedPermanent}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Patreon</TableHead>
                    <TableHead>Accion</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliationResult.results.map((result) => (
                    <TableRow key={`${result.userId}-${result.action}`}>
                      <TableCell className="min-w-52 align-top font-medium">
                        {result.userId}
                      </TableCell>
                      <TableCell className="min-w-36 align-top">
                        {result.patreonUserId ?? "-"}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant={reconciliationActionVariants[result.action]}
                        >
                          {reconciliationActionLabels[result.action]}
                        </Badge>
                      </TableCell>
                      <TableCell className="min-w-32 align-top">
                        {result.previousTier}
                        {result.nextTier &&
                        result.nextTier !== result.previousTier
                          ? ` -> ${result.nextTier}`
                          : ""}
                      </TableCell>
                      <TableCell className="min-w-72 align-top text-muted-foreground text-sm">
                        {result.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                  {reconciliationResult.results.length === 0 && (
                    <TableRow>
                      <TableCell
                        className="py-6 text-center text-muted-foreground"
                        colSpan={5}
                      >
                        No hay usuarios VIP activos para revisar.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border p-4">
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="grid gap-2">
              <Label htmlFor="patreon-webhook-created-from">Desde</Label>
              <Input
                id="patreon-webhook-created-from"
                onChange={(changeEvent) =>
                  setCreatedFrom(changeEvent.target.value)
                }
                type="date"
                value={createdFrom}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patreon-webhook-created-to">Hasta</Label>
              <Input
                id="patreon-webhook-created-to"
                onChange={(changeEvent) =>
                  setCreatedTo(changeEvent.target.value)
                }
                type="date"
                value={createdTo}
              />
            </div>
            <div className="grid gap-2">
              <Label>Evento</Label>
              <Select
                onValueChange={(value) =>
                  setSelectedEvent(value ?? ALL_FILTER_VALUE)
                }
                value={selectedEvent}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {selectedEvent === ALL_FILTER_VALUE
                      ? "Todos"
                      : selectedEvent}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>Todos</SelectItem>
                  {eventOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Estado</Label>
              <Select
                onValueChange={(value) =>
                  setProcessingStatus(value ?? ALL_FILTER_VALUE)
                }
                value={processingStatus}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {processingStatus === ALL_FILTER_VALUE
                      ? "Todos"
                      : statusLabels[processingStatus as ProcessingStatus]}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>Todos</SelectItem>
                  {statusOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {statusLabels[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Metodo</Label>
              <Select
                onValueChange={(value) => setMethod(value ?? ALL_FILTER_VALUE)}
                value={method}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {method === ALL_FILTER_VALUE ? "Todos" : method}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>Todos</SelectItem>
                  {methodOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patreon-webhook-response-status">Respuesta</Label>
              <Input
                id="patreon-webhook-response-status"
                inputMode="numeric"
                max={599}
                min={100}
                onChange={(changeEvent) =>
                  setResponseStatusInput(changeEvent.target.value)
                }
                placeholder="200, 400..."
                type="number"
                value={responseStatusInput}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patreon-webhook-body-search">Body contiene</Label>
              <Input
                id="patreon-webhook-body-search"
                onChange={(changeEvent) =>
                  setBodyInput(changeEvent.target.value)
                }
                placeholder="Patreon user, tier, email..."
                type="search"
                value={bodyInput}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="patreon-webhook-signature-search">
                Firma contiene
              </Label>
              <Input
                id="patreon-webhook-signature-search"
                onChange={(changeEvent) =>
                  setSignatureInput(changeEvent.target.value)
                }
                placeholder="Fragmento de x-patreon-signature"
                type="search"
                value={signatureInput}
              />
            </div>
          </div>
          {hasActiveFilters && (
            <Button
              className="w-fit"
              onClick={() => {
                setBodyInput("");
                setBodyFilter("");
                setCreatedFrom("");
                setCreatedTo("");
                setSelectedEvent(ALL_FILTER_VALUE);
                setMethod(ALL_FILTER_VALUE);
                setProcessingStatus(ALL_FILTER_VALUE);
                setResponseStatusInput("");
                setResponseStatusFilter("");
                setSignatureInput("");
                setSignatureFilter("");
              }}
              type="button"
              variant="secondary"
            >
              Limpiar filtros
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">Solicitudes recientes</h2>
            <p className="text-muted-foreground text-sm">
              Mostrando {requests.length.toLocaleString()} de{" "}
              {total.toLocaleString()} registros guardados.
            </p>
          </div>
          <Badge variant="outline">Top {WEBHOOK_REQUEST_LIMIT}</Badge>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recibido</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Metodo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Respuesta</TableHead>
                <TableHead>Request</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="min-w-44 align-top">
                    {formatDate(request.createdAt)}
                  </TableCell>
                  <TableCell className="min-w-52 align-top font-medium">
                    {request.event ?? "Sin evento"}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant="secondary">{request.method}</Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={statusVariants[request.processingStatus]}>
                      {statusLabels[request.processingStatus]}
                    </Badge>
                    {request.processingError && (
                      <p className="mt-2 max-w-64 whitespace-normal wrap-break-word text-destructive text-xs">
                        {request.processingError}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    {request.responseStatus ?? "-"}
                  </TableCell>
                  <TableCell className="min-w-130 align-top">
                    <div className="grid gap-2">
                      <p className="break-all text-muted-foreground text-xs">
                        {request.url}
                      </p>
                      <details className="group rounded-md border p-3">
                        <summary className="cursor-pointer font-medium text-sm">
                          Headers
                        </summary>
                        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md bg-muted p-3 text-xs">
                          {formatJson(request.headers)}
                        </pre>
                      </details>
                      <details className="group rounded-md border p-3">
                        <summary className="cursor-pointer font-medium text-sm">
                          Body
                        </summary>
                        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap wrap-break-word rounded-md bg-muted p-3 text-xs">
                          {formatBody(request.body)}
                        </pre>
                      </details>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {requests.length === 0 && (
                <TableRow>
                  <TableCell
                    className="py-8 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    {hasActiveFilters
                      ? "No hay webhooks de Patreon que coincidan con los filtros."
                      : "Todavia no hay webhooks de Patreon guardados."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  );
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatBody(value: string) {
  try {
    return JSON.stringify(JSON.parse(value) as unknown, null, 2);
  } catch {
    return value;
  }
}

function getDateBound(value: string, boundary: "start" | "end") {
  const suffix = boundary === "start" ? "T00:00:00.000" : "T23:59:59.999";
  return new Date(`${value}${suffix}`);
}
