"use client";

import { Award01Icon } from "@hugeicons/core-free-icons";
import { useInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  ProfilePanel,
  ProfileSectionHeader,
} from "@/components/profile/profile-section";
import { Button } from "@/components/ui/button";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { orpc, orpcClient } from "@/lib/orpc";

type HistoryPage = Awaited<
  ReturnType<(typeof orpcClient.progression)["history"]>
>;
type HistoryCursor = NonNullable<HistoryPage["nextCursor"]>;

const EVENT_STATE_LABELS = {
  cancelled: "Cancelado",
  pending: "Pendiente",
  posted: "Confirmado",
} as const;

export function ProgressionSection() {
  const { data } = useSuspenseQuery(orpc.progression.getMine.queryOptions());
  const history = useInfiniteQuery({
    enabled: data.enabled,
    getNextPageParam: (lastPage: HistoryPage) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as HistoryCursor | undefined,
    queryFn: ({ pageParam }: { pageParam: HistoryCursor | undefined }) =>
      orpcClient.progression.history({
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: 20,
      }),
    queryKey: ["progression", "history"],
  });
  const events = useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data?.pages]
  );
  const nextLevel = data.level === 1000 ? null : data.level + 1;

  return (
    <div className="space-y-5">
      <ProfilePanel className="p-5 sm:p-6">
        <ProfileSectionHeader
          description="Tu Account Level se calcula con Account XP validado por el servidor."
          eyebrow="Cuenta"
          icon={Award01Icon}
          title="Progreso"
        />

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <ProgressStat label="Account Level" value={`Nivel ${data.level}`} />
          <ProgressStat label="Account XP" value={`${data.totalXp} XP`} />
          <ProgressStat
            label="Pending XP"
            value={`${data.pendingXp} XP pendientes`}
          />
        </div>

        <div className="mt-5 rounded-[1.25rem] border border-border/70 bg-background/45 p-4">
          {nextLevel ? (
            <Progress
              aria-label={`Progreso hacia el nivel ${nextLevel}`}
              value={Math.round(data.progress * 100)}
            >
              <ProgressLabel>Progreso hacia el nivel {nextLevel}</ProgressLabel>
              <ProgressValue />
            </Progress>
          ) : (
            <p className="font-medium" role="status">
              Nivel máximo alcanzado
            </p>
          )}
          {nextLevel ? (
            <p className="mt-2 text-muted-foreground text-sm">
              {data.xpForNextLevel} XP para el siguiente nivel
            </p>
          ) : null}
          <p className="mt-3 text-muted-foreground text-sm leading-6">
            {data.enabled
              ? data.accrualEnabled
                ? "Pending XP no aumenta tu nivel hasta que se confirme."
                : "El seguimiento está pausado; las acciones durante esta pausa no acumulan XP."
              : "Account XP aún no está activo. Tu cuenta comienza en el nivel 1 sin progreso histórico."}
          </p>
        </div>

        <div className="mt-5 rounded-[1.25rem] border border-border/70 bg-background/45 p-4">
          <h3 className="font-semibold text-sm">
            Próximas recompensas automáticas
          </h3>
          {data.automaticRewards.length ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {data.automaticRewards.map((reward) => (
                <li
                  className="rounded-lg bg-muted/50 px-3 py-2 text-sm tabular-nums"
                  key={reward.level}
                >
                  Nivel {reward.level}: {reward.amount} Eteris
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-muted-foreground text-sm">
              Completaste todas las recompensas automáticas del recorrido.
            </p>
          )}
        </div>
      </ProfilePanel>

      {data.enabled ? (
        <ProfilePanel className="p-5 sm:p-6">
          <ProfileSectionHeader
            description="Solo tú puedes consultar este historial."
            eyebrow="Privado"
            title="Historial de Account XP"
          />
          {history.isPending ? (
            <p className="mt-5 text-muted-foreground text-sm" role="status">
              Cargando historial de Account XP.
            </p>
          ) : history.isError ? (
            <div className="mt-5 text-sm" role="alert">
              <p>No pudimos cargar tu historial de Account XP.</p>
              <Button
                className="mt-3"
                onClick={() => history.refetch()}
                variant="outline"
              >
                Reintentar
              </Button>
            </div>
          ) : events.length ? (
            <ul className="mt-5 divide-y divide-border/70">
              {events.map((event) => (
                <li
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                  key={event.id}
                >
                  <span>
                    <span className="block font-medium">{event.label}</span>
                    <span className="text-muted-foreground">
                      {EVENT_STATE_LABELS[event.state]} ·{" "}
                      {new Date(event.createdAt).toLocaleDateString("es")}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {event.amount > 0 ? "+" : ""}
                    {event.amount} XP
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-muted-foreground text-sm">
              Todavía no hay actividad de Account XP.
            </p>
          )}
          {history.hasNextPage ? (
            <Button
              className="mt-5"
              disabled={history.isFetchingNextPage}
              onClick={() => history.fetchNextPage()}
              variant="outline"
            >
              {history.isFetchingNextPage ? "Cargando" : "Cargar más"}
            </Button>
          ) : null}
        </ProfilePanel>
      ) : null}
    </div>
  );
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-border/70 bg-background/45 p-4">
      <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {label}
      </p>
      <p className="mt-2 font-lexend font-semibold text-xl tabular-nums">
        {value}
      </p>
    </div>
  );
}
