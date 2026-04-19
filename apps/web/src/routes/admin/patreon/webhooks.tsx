import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { orpcClient } from "@/lib/orpc";
import { ownerMiddleware } from "@/middleware/owner";

const WEBHOOK_REQUEST_LIMIT = 50;
const webhookRequestsQueryKey = [
  "patreon",
  "webhook-requests",
  WEBHOOK_REQUEST_LIMIT,
] as const;

type ProcessingStatus =
  | "stored"
  | "processed"
  | "ignored"
  | "invalid"
  | "failed";

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

export const Route = createFileRoute("/admin/patreon/webhooks")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Webhooks de Patreon",
      },
    ],
  }),
  loader: () =>
    orpcClient.patreon.admin.listWebhookRequests({
      limit: WEBHOOK_REQUEST_LIMIT,
      offset: 0,
    }),
  server: {
    middleware: [ownerMiddleware],
  },
  staleTime: 0,
});

function RouteComponent() {
  const initialData = Route.useLoaderData();
  const webhookRequestsQuery = useQuery({
    initialData,
    queryFn: () =>
      orpcClient.patreon.admin.listWebhookRequests({
        limit: WEBHOOK_REQUEST_LIMIT,
        offset: 0,
      }),
    queryKey: webhookRequestsQueryKey,
  });

  const { requests, total } = webhookRequestsQuery.data;

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
                      <p className="mt-2 max-w-64 whitespace-normal break-words text-destructive text-xs">
                        {request.processingError}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    {request.responseStatus ?? "-"}
                  </TableCell>
                  <TableCell className="min-w-[520px] align-top">
                    <div className="grid gap-2">
                      <p className="break-all text-muted-foreground text-xs">
                        {request.url}
                      </p>
                      <details className="group rounded-md border p-3">
                        <summary className="cursor-pointer font-medium text-sm">
                          Headers
                        </summary>
                        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
                          {formatJson(request.headers)}
                        </pre>
                      </details>
                      <details className="group rounded-md border p-3">
                        <summary className="cursor-pointer font-medium text-sm">
                          Body
                        </summary>
                        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
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
                    Todavia no hay webhooks de Patreon guardados.
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
