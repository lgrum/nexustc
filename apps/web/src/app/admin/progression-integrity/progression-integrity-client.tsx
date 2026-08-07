"use client";

import { useStore } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppForm } from "@/hooks/use-app-form";
import { orpc } from "@/lib/orpc";
import type { orpcClient } from "@/lib/orpc";

type Cases = Awaited<ReturnType<typeof orpcClient.progression.admin.listCases>>;
const decisionSchema = z.object({
  likerUserIds: z.string(),
  reason: z.string().trim().min(10).max(500),
  subjectId: z.string(),
});

export function ProgressionIntegrityClient({
  initialCases,
}: {
  initialCases: Cases;
}) {
  const [selectedCaseId, setSelectedCaseId] = useState<string>();
  const cases = useQuery({
    ...orpc.progression.admin.listCases.queryOptions({
      input: { limit: 50, status: "open" },
    }),
    initialData: initialCases,
  });
  const detail = useQuery({
    ...orpc.progression.admin.getCase.queryOptions({
      input: { caseId: selectedCaseId ?? "" },
    }),
    enabled: Boolean(selectedCaseId),
  });
  const decision = useMutation(
    orpc.progression.admin.decideCase.mutationOptions({
      onError: () => toast.error("No se pudo decidir el caso."),
      onSuccess: async () => {
        toast.success("Decisión registrada.");
        setSelectedCaseId(undefined);
        form.reset();
        await cases.refetch();
      },
    })
  );
  const form = useAppForm({
    defaultValues: { likerUserIds: "", reason: "", subjectId: "" },
    onSubmit: () => Promise.resolve(),
    validators: { onChange: decisionSchema },
  });
  const values = useStore(form.store, (state) => state.values);
  const reasonValid = values.reason.trim().length >= 10;

  function decide(
    action: "block" | "dismiss" | "release" | "reverse" | "disqualify_likes"
  ) {
    if (!selectedCaseId || !decisionSchema.safeParse(values).success) {
      return;
    }
    if (action === "disqualify_likes") {
      decision.mutate({
        action,
        caseId: selectedCaseId,
        likerUserIds: values.likerUserIds
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean),
        reason: values.reason.trim(),
        subjectId: values.subjectId.trim(),
      });
      return;
    }
    decision.mutate({
      action,
      caseId: selectedCaseId,
      reason: values.reason.trim(),
    });
  }

  return (
    <main className="grid gap-6">
      <header>
        <h1 className="font-bold text-2xl">Integridad de Account XP</h1>
        <p className="text-muted-foreground text-sm">
          Casos pendientes con evidencia resumida. Ninguna penalizacion
          permanente se aplica automaticamente.
        </p>
      </header>

      <section className="grid gap-3">
        {cases.data.map((item) => (
          <button
            className="grid gap-2 rounded-lg border p-4 text-left hover:bg-muted/50"
            key={item.id}
            onClick={() => setSelectedCaseId(item.id)}
            type="button"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{item.summary}</span>
              <Badge
                variant={item.riskLevel === "high" ? "destructive" : "outline"}
              >
                {item.riskLevel === "high" ? "Riesgo alto" : "Riesgo medio"}
              </Badge>
            </div>
            <span className="text-muted-foreground text-xs">
              Cuenta {item.userId ?? "eliminada"} · {item.createdAt}
            </span>
          </button>
        ))}
        {cases.data.length === 0 && (
          <p className="rounded-lg border p-8 text-center text-muted-foreground">
            No hay casos abiertos.
          </p>
        )}
      </section>

      {selectedCaseId && detail.data && (
        <form
          className="grid gap-4 rounded-lg border p-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <div>
            <h2 className="font-semibold text-lg">{detail.data.summary}</h2>
            <p className="text-muted-foreground text-sm">
              {detail.data.evidence.signals
                .map((signal) => `${signal.kind}: ${signal.count}`)
                .join(" · ") || "Sin senales adicionales"}
            </p>
          </div>
          <ul className="grid gap-2 text-sm">
            {detail.data.events.map((event) => (
              <li className="rounded border p-2" key={event.id}>
                {event.kind} · {event.amount} XP · {event.state}
              </li>
            ))}
          </ul>
          <form.AppForm>
            <form.AppField name="reason">
              {(field) => (
                <field.TextareaField label="Motivo de la decisión" required />
              )}
            </form.AppField>
            <div className="flex flex-wrap gap-2">
              {(["release", "dismiss", "reverse", "block"] as const).map(
                (action) => (
                  <Button
                    disabled={!reasonValid || decision.isPending}
                    key={action}
                    onClick={() => decide(action)}
                    type="button"
                    variant={action === "reverse" ? "destructive" : "outline"}
                  >
                    {
                      {
                        block: "Bloquear alcance",
                        dismiss: "Descartar",
                        release: "Liberar XP",
                        reverse: "Revertir",
                      }[action]
                    }
                  </Button>
                )
              )}
            </div>
            <div className="grid gap-3 border-t pt-4 md:grid-cols-2">
              <form.AppField name="subjectId">
                {(field) => <field.TextField label="Sujeto de recompensa" />}
              </form.AppField>
              <form.AppField name="likerUserIds">
                {(field) => (
                  <field.TextField label="IDs coordinados, separados por coma" />
                )}
              </form.AppField>
              <Button
                disabled={
                  !reasonValid ||
                  !values.subjectId.trim() ||
                  !values.likerUserIds.trim() ||
                  decision.isPending
                }
                onClick={() => decide("disqualify_likes")}
                type="button"
                variant="destructive"
              >
                Descalificar likes confirmados
              </Button>
            </div>
          </form.AppForm>
        </form>
      )}
    </main>
  );
}
