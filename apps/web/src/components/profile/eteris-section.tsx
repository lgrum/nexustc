"use client";

import { Coins01Icon } from "@hugeicons/core-free-icons";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";

import { ProfileCustomizationVisibilityStatus } from "@/components/profile/profile-customization-visibility-status";
import {
  ProfilePanel,
  ProfileSectionHeader,
} from "@/components/profile/profile-section";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { orpc, orpcClient } from "@/lib/orpc";

type HistoryPage = Awaited<ReturnType<(typeof orpcClient.eteris)["history"]>>;
type HistoryCursor = NonNullable<HistoryPage["nextCursor"]>;
type WalletState = Awaited<ReturnType<(typeof orpcClient.eteris)["getMine"]>>;

function getWalletStatusMessage(data: WalletState) {
  if (data.enabled) {
    if (data.status === "frozen") {
      return "La Billetera est\u00E1 congelada mientras revisamos una inconsistencia.";
    }
    if (data.status === "closed") {
      return "La Billetera est\u00E1 cerrada.";
    }
    if (data.debt) {
      return "Tu saldo est\u00E1 en deuda. No puedes gastar Eteris hasta regularizarlo.";
    }
    return data.spendingEnabled
      ? "Tu Billetera est\u00E1 disponible para usar Eteris."
      : "Los gastos est\u00E1n pausados; todav\u00EDa puedes consultar tu saldo e historial.";
  }
  return "La Billetera a\u00FAn no est\u00E1 activa. Tu saldo comienza en cero.";
}

export function EterisSection({
  customizationEnabled = false,
}: {
  customizationEnabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(orpc.eteris.getMine.queryOptions());
  const history = useInfiniteQuery({
    enabled: data.enabled,
    getNextPageParam: (lastPage: HistoryPage) =>
      lastPage.nextCursor ?? undefined,
    initialPageParam: undefined as HistoryCursor | undefined,
    queryFn: ({ pageParam }: { pageParam: HistoryCursor | undefined }) =>
      orpcClient.eteris.history({
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: 20,
      }),
    queryKey: ["eteris", "history"],
  });
  const visibility = useMutation({
    mutationFn: (publicBalance: boolean) =>
      orpcClient.eteris.setPublicBalance({ publicBalance }),
    onError: () => toast.error("No pudimos actualizar la privacidad."),
    onSuccess: async () => {
      await queryClient.invalidateQueries(orpc.eteris.getMine.queryOptions());
      toast.success("Privacidad actualizada");
    },
  });
  const transactions = useMemo(
    () => history.data?.pages.flatMap((page) => page.items) ?? [],
    [history.data?.pages]
  );

  return (
    <div className="space-y-5">
      <ProfilePanel className="p-5 sm:p-6">
        <ProfileSectionHeader
          description="Tu saldo de Eteris y su historial son privados por defecto."
          eyebrow="Cuenta"
          icon={Coins01Icon}
          title="Billetera"
        />
        <div className="mt-6 rounded-[1.25rem] border border-border/70 bg-background/45 p-4">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.16em]">
            Saldo
          </p>
          <p className="mt-2 font-lexend font-semibold text-3xl tabular-nums">
            {data.balance} Eteris
          </p>
          <p className="mt-3 text-muted-foreground text-sm leading-6">
            {getWalletStatusMessage(data)}
          </p>
        </div>
        {customizationEnabled ? (
          <div className="mt-5">
            <ProfileCustomizationVisibilityStatus
              description="El historial, el estado interno y cualquier deuda siempre permanecen privados."
              status={
                data.publicBalance
                  ? "Saldo visible en tu perfil"
                  : "Saldo oculto en tu perfil"
              }
            />
          </div>
        ) : (
          <div className="mt-5 flex items-center justify-between gap-4 rounded-[1.25rem] border border-border/70 bg-background/45 p-4">
            <span>
              <label
                className="block font-medium"
                htmlFor="public-eteris-balance"
              >
                Mostrar saldo en mi perfil
              </label>
              <span className="mt-1 block text-muted-foreground text-sm">
                El historial y el estado interno siempre permanecen privados.
              </span>
            </span>
            <Switch
              aria-label={"Mostrar saldo de Eteris en mi perfil p\u00FAblico"}
              checked={data.publicBalance}
              disabled={!data.enabled || visibility.isPending}
              id="public-eteris-balance"
              onCheckedChange={(checked) => visibility.mutate(checked)}
            />
          </div>
        )}
      </ProfilePanel>

      {data.enabled ? (
        <ProfilePanel className="p-5 sm:p-6">
          <ProfileSectionHeader
            description={
              "Solo t\u00FA y el personal autorizado pueden consultar estos movimientos."
            }
            eyebrow="Privado"
            title="Historial de Eteris"
          />
          {history.isPending ? (
            <p className="mt-5 text-muted-foreground text-sm" role="status">
              Cargando historial de Eteris.
            </p>
          ) : history.isError ? (
            <div className="mt-5 text-sm" role="alert">
              <p>No pudimos cargar tu historial de Eteris.</p>
              <Button
                className="mt-3"
                onClick={() => history.refetch()}
                variant="outline"
              >
                Reintentar
              </Button>
            </div>
          ) : transactions.length ? (
            <ul className="mt-5 divide-y divide-border/70">
              {transactions.map((transaction) => (
                <li
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                  key={transaction.id}
                >
                  <span>
                    <span className="block font-medium">
                      {transaction.label}
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(transaction.createdAt).toLocaleDateString("es")}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {BigInt(transaction.amount) > 0n ? "+" : ""}
                    {transaction.amount}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-5 text-muted-foreground text-sm">
              {"Todav\u00EDa no hay movimientos de Eteris."}
            </p>
          )}
          {history.hasNextPage ? (
            <Button
              className="mt-5"
              disabled={history.isFetchingNextPage}
              onClick={() => history.fetchNextPage()}
              variant="outline"
            >
              {history.isFetchingNextPage ? "Cargando" : "Cargar m\u00E1s"}
            </Button>
          ) : null}
        </ProfilePanel>
      ) : null}
    </div>
  );
}
