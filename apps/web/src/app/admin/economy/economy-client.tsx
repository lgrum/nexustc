"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { HasRole } from "@/components/auth/has-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppForm } from "@/hooks/use-app-form";
import { orpc } from "@/lib/orpc";
import type { orpcClient } from "@/lib/orpc";

type Report = Awaited<ReturnType<typeof orpcClient.eteris.admin.report>>;

const auditSchema = z.object({ auditUserId: z.string().trim().min(1) });
const xpAdjustmentSchema = z.object({
  xpAmount: z
    .string()
    .regex(/^-?[1-9]\d*$/)
    .refine((value) => Math.abs(Number(value)) <= 365_000),
  xpReason: z.string().trim().min(10).max(500),
  xpUserId: z.string().trim().min(1),
});
const eterisAdjustmentSchema = z.object({
  eterisAmount: z.string().regex(/^-?[1-9]\d*$/),
  eterisReason: z.string().trim().min(10).max(500),
  eterisUserId: z.string().trim().min(1),
});
const reconciliationSchema = z.object({
  reconciliationUserId: z.string().trim().min(1),
});

export function EconomyClient({ initialReport }: { initialReport: Report }) {
  const [auditedUserId, setAuditedUserId] = useState("");
  const report = useQuery({
    ...orpc.eteris.admin.report.queryOptions(),
    initialData: initialReport,
  });
  const xpAudit = useQuery({
    ...orpc.progression.admin.inspectUser.queryOptions({
      input: { limit: 20, userId: auditedUserId },
    }),
    enabled: Boolean(auditedUserId),
  });
  const walletAudit = useQuery({
    ...orpc.eteris.admin.inspectWallet.queryOptions({
      input: { limit: 20, userId: auditedUserId },
    }),
    enabled: Boolean(auditedUserId),
  });
  const auditForm = useAppForm({
    defaultValues: { auditUserId: "" },
    onSubmit: ({ value }) => setAuditedUserId(value.auditUserId.trim()),
    validators: { onSubmit: auditSchema },
  });

  const snapshot = report.data;

  return (
    <main className="grid gap-6">
      <header>
        <h1 className="font-bold text-2xl">Economía de Eteris</h1>
        <p className="text-muted-foreground text-sm">
          Informe diario UTC del {snapshot.day}. Generado {snapshot.createdAt}.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Suministro de usuarios"
          value={`${snapshot.totalUserSupply} Eteris`}
        />
        <Metric label="Emitido" value={`${snapshot.issued} Eteris`} />
        <Metric label="Quemado" value={`${snapshot.burned} Eteris`} />
        <Metric
          label="Relación fuentes/sumideros"
          value={snapshot.sourceSinkRatio ?? "Sin quema registrada"}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Tienda oficial</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <p>
            Ofertas configuradas (incluye programadas):{" "}
            {snapshot.officialCardShop.configuredOfferCount}
          </p>
          <p>Ofertas activas: {snapshot.officialCardShop.activeOfferCount}</p>
          <p>
            Cuota limitada restante:{" "}
            {snapshot.officialCardShop.remainingLimitedQuota}
          </p>
          <p>Paquetes vendidos: {snapshot.officialCardShop.soldPackCount}</p>
          <p>Compras de hoy: {snapshot.officialCardShop.purchaseCount}</p>
          <p>
            Eteris quemados por compras:{" "}
            {snapshot.officialCardShop.eterisBurned}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gachapon</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <p>
            Máquinas configuradas: {snapshot.gachapon.configuredMachineCount}
          </p>
          <p>Máquinas activas: {snapshot.gachapon.activeMachineCount}</p>
          <p>Cuota global restante: {snapshot.gachapon.remainingGlobalQuota}</p>
          <p>Activaciones de hoy: {snapshot.gachapon.activationCount}</p>
          <p>Paquetes emitidos: {snapshot.gachapon.issuedPackCount}</p>
          <p>Eteris quemados por Gachapon: {snapshot.gachapon.eterisBurned}</p>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <ReasonCard
          title="Emisión por motivo"
          values={snapshot.issuedByReason}
        />
        <ReasonCard title="Quema por motivo" values={snapshot.burnedByReason} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Distribución y estado</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p>
              P50: {snapshot.balancePercentiles.p50}
              <span className="mx-2">·</span>P90:{" "}
              {snapshot.balancePercentiles.p90}
              <span className="mx-2">·</span>P99:{" "}
              {snapshot.balancePercentiles.p99}
            </p>
            <p>{snapshot.negativeWalletCount} negativa</p>
            <p>{snapshot.frozenWalletCount} congeladas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Velocidad de ganancia anómala</CardTitle>
          </CardHeader>
          <CardContent>
            {snapshot.anomalousEarners.length ? (
              <ul className="grid gap-2">
                {snapshot.anomalousEarners.map((earner) => (
                  <li
                    className="flex justify-between gap-4"
                    key={earner.userId}
                  >
                    <span>{earner.userId}</span>
                    <span>{earner.total} Eteris</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Sin anomalías detectadas.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Auditoría de usuario</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              auditForm.handleSubmit();
            }}
          >
            <auditForm.AppForm>
              <auditForm.AppField name="auditUserId">
                {(field) => (
                  <field.TextField
                    className="flex-1"
                    label="ID de usuario a auditar"
                    required
                  />
                )}
              </auditForm.AppField>
              <auditForm.SubmitButton>Consultar</auditForm.SubmitButton>
            </auditForm.AppForm>
          </form>
          {auditedUserId && (xpAudit.isPending || walletAudit.isPending) && (
            <p role="status">Cargando auditoría.</p>
          )}
          {(xpAudit.isError || walletAudit.isError) && (
            <p role="alert">No se pudo cargar la auditoría.</p>
          )}
          {auditedUserId && xpAudit.data && walletAudit.data && (
            <div className="grid gap-4 lg:grid-cols-2">
              <AuditHistory
                heading={`Account XP: ${xpAudit.data.totalXp} total, ${xpAudit.data.pendingXp} pendiente`}
                items={xpAudit.data.history.items}
                unit="XP"
              />
              <AuditHistory
                heading={`Billetera: ${walletAudit.data.balance} Eteris (${walletAudit.data.status})`}
                items={walletAudit.data.history.items}
                unit="Eteris"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <HasRole authRole="owner">
        <OwnerTools onReconciled={() => report.refetch()} />
      </HasRole>
    </main>
  );
}

function OwnerTools({ onReconciled }: { onReconciled: () => unknown }) {
  const queryClient = useQueryClient();
  const xpIdempotencyKey = useRef<string | null>(null);
  const eterisIdempotencyKey = useRef<string | null>(null);
  const xpAdjustment = useMutation(
    orpc.progression.owner.adjustXp.mutationOptions()
  );
  const eterisAdjustment = useMutation(
    orpc.eteris.owner.adjust.mutationOptions()
  );
  const reconciliation = useMutation(
    orpc.eteris.owner.reconcileWallet.mutationOptions()
  );
  const refreshAudit = (userId: string) =>
    Promise.all([
      queryClient.invalidateQueries(
        orpc.progression.admin.inspectUser.queryOptions({
          input: { limit: 20, userId },
        })
      ),
      queryClient.invalidateQueries(
        orpc.eteris.admin.inspectWallet.queryOptions({
          input: { limit: 20, userId },
        })
      ),
    ]);
  const xpForm = useAppForm({
    defaultValues: { xpAmount: "", xpReason: "", xpUserId: "" },
    onSubmit: async ({ value }) => {
      xpIdempotencyKey.current ??= `owner-xp-${crypto.randomUUID()}`;
      try {
        const userId = value.xpUserId.trim();
        await xpAdjustment.mutateAsync({
          amount: Number(value.xpAmount),
          idempotencyKey: xpIdempotencyKey.current,
          reason: value.xpReason.trim(),
          userId,
        });
        await refreshAudit(userId);
        xpIdempotencyKey.current = null;
        toast.success("Account XP ajustado.");
        xpForm.reset();
      } catch {
        toast.error("No se pudo ajustar Account XP.");
      }
    },
    validators: { onSubmit: xpAdjustmentSchema },
  });
  const eterisForm = useAppForm({
    defaultValues: {
      eterisAmount: "",
      eterisReason: "",
      eterisUserId: "",
    },
    onSubmit: async ({ value }) => {
      eterisIdempotencyKey.current ??= `owner-eteris-${crypto.randomUUID()}`;
      try {
        const userId = value.eterisUserId.trim();
        const result = await eterisAdjustment.mutateAsync({
          amount: value.eterisAmount,
          idempotencyKey: eterisIdempotencyKey.current,
          reason: value.eterisReason.trim(),
          userId,
        });
        if (result.projectionMismatch) {
          throw new Error("ETERIS_PROJECTION_MISMATCH");
        }
        await refreshAudit(userId);
        eterisIdempotencyKey.current = null;
        toast.success("Eteris ajustado.");
        eterisForm.reset();
      } catch {
        toast.error("No se pudo ajustar Eteris.");
      }
    },
    validators: { onSubmit: eterisAdjustmentSchema },
  });
  const reconciliationForm = useAppForm({
    defaultValues: { reconciliationUserId: "" },
    onSubmit: async ({ value }) => {
      try {
        const userId = value.reconciliationUserId.trim();
        await reconciliation.mutateAsync({
          repair: true,
          userId,
        });
        toast.success("Billetera reconciliada.");
        reconciliationForm.reset();
        await Promise.all([onReconciled(), refreshAudit(userId)]);
      } catch {
        toast.error("No se pudo reconciliar la billetera.");
      }
    },
    validators: { onSubmit: reconciliationSchema },
  });

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Ajustar Account XP</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              xpForm.handleSubmit();
            }}
          >
            <xpForm.AppForm>
              <xpForm.AppField name="xpUserId">
                {(field) => <field.TextField label="ID de usuario" required />}
              </xpForm.AppField>
              <xpForm.AppField name="xpAmount">
                {(field) => (
                  <field.TextField label="Cantidad firmada" required />
                )}
              </xpForm.AppField>
              <xpForm.AppField name="xpReason">
                {(field) => (
                  <field.TextareaField label="Motivo de auditoría" required />
                )}
              </xpForm.AppField>
              <xpForm.SubmitButton>Registrar ajuste</xpForm.SubmitButton>
            </xpForm.AppForm>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Ajustar Eteris</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              eterisForm.handleSubmit();
            }}
          >
            <eterisForm.AppForm>
              <eterisForm.AppField name="eterisUserId">
                {(field) => <field.TextField label="ID de usuario" required />}
              </eterisForm.AppField>
              <eterisForm.AppField name="eterisAmount">
                {(field) => (
                  <field.TextField label="Cantidad firmada" required />
                )}
              </eterisForm.AppField>
              <eterisForm.AppField name="eterisReason">
                {(field) => (
                  <field.TextareaField label="Motivo de auditoría" required />
                )}
              </eterisForm.AppField>
              <eterisForm.SubmitButton>
                Registrar ajuste
              </eterisForm.SubmitButton>
            </eterisForm.AppForm>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Reconciliar billetera</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              reconciliationForm.handleSubmit();
            }}
          >
            <reconciliationForm.AppForm>
              <reconciliationForm.AppField name="reconciliationUserId">
                {(field) => (
                  <field.TextField
                    label="ID de usuario a reconciliar"
                    required
                  />
                )}
              </reconciliationForm.AppField>
              <reconciliationForm.SubmitButton>
                Reconciliar billetera
              </reconciliationForm.SubmitButton>
            </reconciliationForm.AppForm>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

function AuditHistory({
  heading,
  items,
  unit,
}: {
  heading: string;
  items: {
    amount: number | string;
    createdAt: string;
    id: string;
    label: string;
  }[];
  unit: string;
}) {
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{heading}</h2>
      {items.length ? (
        <ul className="grid gap-2 text-sm">
          {items.map((item) => (
            <li
              className="flex justify-between gap-4 rounded border p-2"
              key={item.id}
            >
              <span>{item.label}</span>
              <span>
                {item.amount} {unit} · {item.createdAt}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Sin movimientos.</p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="font-semibold text-2xl tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function ReasonCard({
  title,
  values,
}: {
  title: string;
  values: Record<string, string>;
}) {
  const entries = Object.entries(values);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length ? (
          <ul className="grid gap-2">
            {entries.map(([reason, amount]) => (
              <li className="flex justify-between gap-4" key={reason}>
                <span>{reason.replaceAll("_", " ")}</span>
                <span>{amount} Eteris</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Sin movimientos.</p>
        )}
      </CardContent>
    </Card>
  );
}
