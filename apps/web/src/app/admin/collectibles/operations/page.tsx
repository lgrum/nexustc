import type { Metadata } from "next";
import Link from "next/link";

import { orpcClient } from "@/lib/orpc";

export const metadata: Metadata = {
  title: "Operaciones de coleccionables | NeXusTC",
};

export default async function CollectibleOperationsPage() {
  const metrics = await orpcClient.collectiblesAdmin.operations.metrics();
  const cards = [
    [
      "Latencia de emisión (s)",
      metrics.issuanceLatencySeconds,
      "/admin/collectibles/audits",
    ],
    [
      "Reintentos deadlock/rollback",
      metrics.deadlockRetryCount,
      "/admin/collectibles/audits",
    ],
    ["Congelamientos", metrics.freezeCount, "/admin/collectibles/freezes"],
    ["Restauraciones", metrics.restoreCount, "/admin/collectibles/freezes"],
    [
      "Correcciones",
      metrics.correctionCount,
      "/admin/collectibles/corrections",
    ],
    [
      "Transferencias excepcionales",
      metrics.exceptionalTransferCount,
      "/admin/collectibles/corrections",
    ],
    [
      "Concesiones excepcionales",
      metrics.exceptionalGrantCount,
      "/admin/collectibles/corrections",
    ],
    [
      "Reversiones Eteris",
      metrics.feeReversalCount,
      "/admin/collectibles/corrections",
    ],
    [
      "Listing Fee emitidas",
      metrics.listingFeeIssuanceCount,
      "/admin/collectibles/audits",
    ],
    [
      "Listing Fee revertidas",
      metrics.listingFeeReversalCount,
      "/admin/collectibles/audits",
    ],
    ["Ventas liquidadas", metrics.salesCount, "/admin/collectibles/audits"],
    [
      "Agotamiento de suministro",
      metrics.supplyExhaustionCount,
      "/admin/collectibles/audits",
    ],
    [
      "Revisiones agotadas",
      metrics.revisionExhaustionCount,
      "/admin/collectibles/audits",
    ],
    ["Desvío de cupos", metrics.quotaDriftCount, "/admin/collectibles/audits"],
    [
      "Fallos de billetera",
      metrics.walletFailureCount,
      "/admin/collectibles/audits",
    ],
    [
      "Edad máxima de custodia (s)",
      metrics.custodyAgeSeconds,
      "/admin/collectibles/audits",
    ],
    [
      "Caducidades pendientes",
      metrics.expiryBacklogCount,
      "/admin/collectibles/audits",
    ],
    [
      "Notificaciones pendientes/fallidas",
      metrics.notificationBacklogCount,
      "/admin/collectibles/audits",
    ],
    [
      "Fallos de render",
      metrics.renderFailureCount,
      "/admin/collectibles/audits",
    ],
    [
      "Liquidaciones fallidas",
      metrics.failedSettlementCount,
      "/admin/collectibles/audits",
    ],
  ] as const;

  return (
    <main className="space-y-8 p-6">
      <header className="space-y-2">
        <p className="text-muted-foreground text-sm">
          Economía de cartas y Packs
        </p>
        <h1 className="text-balance font-semibold text-3xl tracking-tight">
          Operaciones
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          Acciones administrativas con versión esperada, motivo e idempotencia.
          Los contadores son agregados y no contienen resultados de Packs.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value, href]) => (
          <Link
            className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            href={href}
            key={label}
          >
            <p className="text-muted-foreground text-sm">{label}</p>
            <p className="mt-2 font-semibold text-2xl tabular-nums">{value}</p>
          </Link>
        ))}
      </section>
      <nav
        aria-label="Operaciones de coleccionables"
        className="grid gap-3 sm:grid-cols-2"
      >
        <Link
          className="rounded-lg border p-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/admin/collectibles/trades"
        >
          Revisar y cerrar intercambios
        </Link>
        <Link
          className="rounded-lg border p-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/admin/collectibles/gifts"
        >
          Revisar y cerrar regalos
        </Link>
        <Link
          className="rounded-lg border p-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/admin/collectibles/audits"
        >
          Buscar auditoría administrativa
        </Link>
        <Link
          className="rounded-lg border p-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href="/admin/collectibles/corrections"
        >
          Ejecutar una corrección excepcional
        </Link>
      </nav>
    </main>
  );
}
