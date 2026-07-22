"use client";

import {
  Cancel01Icon,
  RefreshIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

import { PatreonLogo } from "@/components/icons/patreon";
import {
  ProfilePanel,
  ProfileSectionHeader,
} from "@/components/profile/profile-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { orpc, orpcClient } from "@/lib/orpc";

const TIER_STYLES: Record<string, string> = {
  tier1: "border-amber-400/30 bg-amber-400/12 text-amber-200",
  tier2: "border-purple-400/30 bg-purple-400/12 text-purple-200",
  tier3:
    "border-amber-400/40 bg-linear-to-r from-amber-400/80 to-orange-500/80 text-white",
};

export function AccountSection({ userId }: { userId: string }) {
  const accountsQueryKey = ["profile", "accounts", userId] as const;
  const { data: accounts } = useSuspenseQuery({
    queryFn: async () => {
      const result = await authClient.listAccounts();
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data ?? [];
    },
    queryKey: accountsQueryKey,
    staleTime: 1000 * 60,
  });
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const patreonAccount = accounts.find(
    (account) => account.providerId === "patreon"
  );

  const handleUnlink = async () => {
    if (!patreonAccount) {
      return;
    }

    const confirmed = await confirm({
      cancelText: "Conservar cuenta",
      confirmButton: { variant: "destructive" },
      confirmText: "Desvincular",
      description:
        "Se detendrá la sincronización de beneficios de Patreon. Better Auth impedirá la acción si esta fuera tu única forma de iniciar sesión.",
      title: "Desvincular Patreon",
    });

    if (!confirmed) {
      return;
    }

    const result = await authClient.unlinkAccount({
      accountId: patreonAccount.accountId,
      providerId: "patreon",
    });

    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    trackEvent("social_account_unlinked", { provider: "patreon" });
    await queryClient.invalidateQueries({ queryKey: accountsQueryKey });
    await queryClient.invalidateQueries(orpc.patreon.getStatus.queryOptions());
    toast.success("Cuenta de Patreon desvinculada");
  };

  return (
    <div className="space-y-5">
      <ProfilePanel className="p-5 sm:p-6">
        <ProfileSectionHeader
          description="Controla las identidades externas conectadas a NeXusTC y revisa qué servicios mantienen acceso a tu cuenta."
          eyebrow="Cuenta"
          icon={UserIcon}
          title="Cuentas vinculadas"
        />

        <ItemGroup className="mt-6">
          <Item
            className="gap-4 rounded-[1.25rem] bg-background/45 p-4"
            variant="outline"
          >
            <ItemMedia className="size-11 rounded-xl bg-white/5" variant="icon">
              <PatreonLogo className="size-6" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>Patreon</ItemTitle>
              <ItemDescription>
                {patreonAccount
                  ? "Conectado para sincronizar tu membresía y beneficios."
                  : "Vincula tu cuenta para activar los beneficios de tu nivel."}
              </ItemDescription>
            </ItemContent>
            <ItemActions className="basis-full justify-end sm:basis-auto">
              {patreonAccount ? (
                <Button onClick={handleUnlink} size="sm" variant="outline">
                  <HugeiconsIcon
                    aria-hidden
                    className="size-4"
                    icon={Cancel01Icon}
                  />
                  Desvincular
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    trackEvent("social_account_link_started", {
                      provider: "patreon",
                    });
                    authClient.linkSocial({
                      callbackURL: "/profile?section=account",
                      provider: "patreon",
                    });
                  }}
                  size="sm"
                >
                  <PatreonLogo className="size-4" />
                  Vincular Patreon
                </Button>
              )}
            </ItemActions>
          </Item>
        </ItemGroup>
      </ProfilePanel>

      <PatreonStatusSection />
    </div>
  );
}

function PatreonStatusSection() {
  const { data: status } = useSuspenseQuery(
    orpc.patreon.getStatus.queryOptions()
  );
  const queryClient = useQueryClient();
  const syncMutation = useMutation({
    mutationFn: () => orpcClient.patreon.syncMembership({}),
    onError: (error) => {
      trackEvent("patreon_sync_completed", {
        reason: "request_failed",
        result: "failed",
      });
      toast.error(
        error instanceof Error ? error.message : "Error al sincronizar"
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries(orpc.patreon.getStatus.queryOptions()),
        queryClient.invalidateQueries(
          orpc.profile.getMySettings.queryOptions()
        ),
      ]);
      trackEvent("patreon_sync_completed", { result: "success" });
      toast.success("Estado de Patreon sincronizado");
    },
  });

  return (
    <ProfilePanel className="p-5 sm:p-6">
      <ProfileSectionHeader
        action={
          <Button
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
            size="sm"
            variant="outline"
          >
            {syncMutation.isPending ? (
              <Spinner className="size-4" />
            ) : (
              <HugeiconsIcon
                aria-hidden
                className="size-4"
                icon={RefreshIcon}
              />
            )}
            Sincronizar
          </Button>
        }
        description="Consulta el nivel reconocido por NeXusTC y cuándo se verificó por última vez."
        eyebrow="Membresía"
        icon={RefreshIcon}
        title="Estado de Patreon"
      />

      <div className="mt-6 rounded-[1.25rem] border border-border/70 bg-background/45 p-4">
        {status.isPatron ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={TIER_STYLES[status.tier] ?? "rounded-full"}
                variant="outline"
              >
                {status.benefits.badge}
              </Badge>
              {status.patronSince ? (
                <span className="text-muted-foreground text-sm">
                  Miembro desde{" "}
                  {format(status.patronSince, "PPP", { locale: es })}
                </span>
              ) : null}
            </div>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              <li className="rounded-xl bg-muted/25 px-3 py-2">
                {status.benefits.adFree
                  ? "Navegación sin anuncios"
                  : "Anuncios activos"}
              </li>
              <li className="rounded-xl bg-muted/25 px-3 py-2">
                {status.benefits.premiumLinks.type === "none"
                  ? "Sin enlaces premium"
                  : "Enlaces premium activos"}
              </li>
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm leading-6">
            No hay una membresía activa sincronizada. Vincula Patreon y usa el
            botón de sincronización para volver a comprobarla.
          </p>
        )}

        {status.lastSyncAt ? (
          <p className="mt-4 text-muted-foreground text-xs">
            Última sincronización:{" "}
            {new Date(status.lastSyncAt).toLocaleString("es", {
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </p>
        ) : null}
      </div>
    </ProfilePanel>
  );
}
