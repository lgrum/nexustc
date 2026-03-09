import {
  Cancel01Icon,
  HelpCircleIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import z from "zod";
import { DiscordLogo } from "@/components/icons/discord";
import { PatreonLogo } from "@/components/icons/patreon";
import { AppearanceSection } from "@/components/profile/appearance-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppForm } from "@/hooks/use-app-form";
import { authClient, getAuthErrorMessage } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
import { authMiddleware } from "@/middleware/auth";

export const Route = createFileRoute("/_main/profile")({
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: "NeXusTC - Perfil",
      },
    ],
  }),
  server: {
    middleware: [authMiddleware],
  },
});

function RouteComponent() {
  const auth = authClient.useSession();
  const queryClient = useQueryClient();

  if (auth.isPending) {
    return <Spinner />;
  }

  if (!auth.data?.user) {
    return <Navigate replace={true} to="/" />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 pb-8">
      <header className="flex items-center justify-between rounded-4xl border border-border bg-card px-5 py-4">
        <div>
          <h1 className="font-black text-2xl">Perfil</h1>
          <p className="text-muted-foreground text-sm">
            Administra tu apariencia, cuentas y seguridad.
          </p>
        </div>
        <Button
          onClick={async () => {
            authClient.signOut();
            await queryClient.invalidateQueries({ queryKey: ["session"] });
          }}
          variant="destructive"
        >
          Cerrar sesión
        </Button>
      </header>

      <Tabs className="w-full" defaultValue="appearance">
        <TabsList className="w-full">
          <TabsTrigger value="appearance">Apariencia</TabsTrigger>
          <TabsTrigger value="account">Cuenta</TabsTrigger>
          <TabsTrigger value="password">Contraseña</TabsTrigger>
        </TabsList>
        <TabsContent value="appearance">
          <AppearanceSection />
        </TabsContent>
        <TabsContent value="account">
          <AccountsSection />
        </TabsContent>
        <TabsContent value="password">
          <div className="rounded-4xl border border-border bg-card p-4">
            <div className="section-title">Cambiar Contraseña</div>
            <div className="mt-4">
              <ChangePasswordForm email={auth.data.user.email} />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AccountsSection() {
  const { data: accounts } = useSuspenseQuery({
    queryKey: ["accounts"],
    queryFn: () => authClient.listAccounts().then((res) => res.data),
    staleTime: 1000 * 60,
  });
  const queryClient = useQueryClient();

  const providers: Record<string, string | null> = {
    patreon: null,
  } as const;

  for (const account of accounts ?? []) {
    if (providers[account.providerId] !== undefined) {
      providers[account.providerId] = account.accountId;
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-4xl border border-border bg-card p-4">
      <div className="section-title">Cuentas Vinculadas</div>

      {accounts?.length === 1 && (
        <p className="text-muted-foreground text-sm">
          No tienes cuentas vinculadas.
        </p>
      )}

      {Object.entries(providers).map(([provider, accountId]) => {
        const providerData = matchProvider(provider);

        if (!accountId) {
          return (
            <Button
              key={provider}
              onClick={() => {
                authClient.linkSocial({ provider, callbackURL: "/profile" });
              }}
            >
              {providerData.Icon}
              Vincular {providerData.label}
            </Button>
          );
        }

        return (
          <div
            className="flex w-full items-center justify-between rounded-2xl border border-border bg-background px-4 py-3"
            key={provider}
          >
            <div className="flex items-center gap-3">
              {providerData.Icon}
              <span className="font-medium text-sm">{providerData.label}</span>
            </div>
            <Button
              onClick={async () => {
                await authClient.unlinkAccount({
                  providerId: provider,
                  accountId,
                });
                queryClient.invalidateQueries({ queryKey: ["accounts"] });
              }}
              size="icon"
              variant="destructive"
            >
              <HugeiconsIcon icon={Cancel01Icon} />
            </Button>
          </div>
        );
      })}

      <PatreonStatusSection />
    </div>
  );
}

function ChangePasswordForm({ email }: { email: string }) {
  const form = useAppForm({
    validators: {
      onSubmit: z.object({
        email: z.string(),
        currentPassword: z.string().min(1, "Requerido"),
        newPassword: z
          .string()
          .min(8, "Debe tener al menos 8 caracteres")
          .max(64, "Debe tener como máximo 64 caracteres"),
        confirmNewPassword: z
          .string()
          .min(8, "Debe tener al menos 8 caracteres")
          .max(64, "Debe tener como máximo 64 caracteres"),
      }),
    },
    defaultValues: {
      email,
      currentPassword: "",
      newPassword: "",
      confirmNewPassword: "",
    },
    onSubmit: async () => {
      const values = form.state.values;

      try {
        const { error } = await authClient.changePassword({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
          revokeOtherSessions: true,
        });

        if (error) {
          toast.error(
            error.code ? getAuthErrorMessage(error.code) : error.message
          );
          return;
        }

        toast.success("Contraseña cambiada exitosamente!");
        form.reset();
      } catch (error) {
        console.error(error);
      }
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <form.AppField name="email">
        {(field) => (
          <field.TextField
            autoComplete="email"
            className="hidden"
            label="Correo Electrónico"
            type="email"
          />
        )}
      </form.AppField>
      <form.AppField name="currentPassword">
        {(field) => (
          <field.TextField
            autoComplete="current-password"
            label="Contraseña Actual"
            type="password"
          />
        )}
      </form.AppField>
      <form.AppField name="newPassword">
        {(field) => (
          <field.TextField
            autoComplete="new-password"
            label="Nueva Contraseña"
            type="password"
          />
        )}
      </form.AppField>
      <form.AppField name="confirmNewPassword">
        {(field) => (
          <field.TextField
            autoComplete="new-password"
            label="Confirmar Nueva Contraseña"
            type="password"
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton>Cambiar Contraseña</form.SubmitButton>
      </form.AppForm>
    </form>
  );
}

function matchProvider(provider: string) {
  const defaultProps = {
    className: "size-6",
  };

  switch (provider) {
    case "discord":
      return { Icon: <DiscordLogo {...defaultProps} />, label: "Discord" };
    case "patreon":
      return { Icon: <PatreonLogo {...defaultProps} />, label: "Patreon" };
    default:
      return {
        Icon: <HugeiconsIcon icon={HelpCircleIcon} {...defaultProps} />,
        label: provider,
      };
  }
}

const TIER_STYLES: Record<string, string> = {
  tier1: "bg-amber-100 text-amber-800 border-amber-200",
  tier2: "bg-purple-100 text-purple-800 border-purple-200",
  tier3:
    "bg-gradient-to-r from-amber-400 to-amber-600 text-white border-amber-500",
};

function PatreonStatusSection() {
  const { data: status } = useSuspenseQuery(
    orpc.patreon.getStatus.queryOptions()
  );
  const syncMutation = useMutation(
    orpc.patreon.syncMembership.mutationOptions()
  );
  const queryClient = useQueryClient();

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync({});
      await queryClient.invalidateQueries({
        queryKey: orpc.patreon.getStatus.queryOptions().queryKey,
      });
      toast.success("Estado de Patreon sincronizado");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al sincronizar"
      );
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <PatreonLogo className="size-5" />
        Estado de Patreon
      </div>

      {status.isPatron ? (
        <>
          <div className="flex items-center gap-2">
            <Badge className={TIER_STYLES[status.tier] ?? ""}>
              {status.benefits.badge}
            </Badge>
            {status.patronSince && (
              <span className="text-muted-foreground text-xs">
                Desde {format(status.patronSince, "PPP", { locale: es })}
              </span>
            )}
          </div>
          <div className="text-sm">
            <p className="mb-2 font-medium">Beneficios:</p>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {status.benefits.badge && <li>Badge: {status.benefits.badge}</li>}
              {status.benefits.adFree && <li>Sin anuncios</li>}
              {status.benefits.premiumLinks.type !== "none" && (
                <li>Enlaces premium</li>
              )}
            </ul>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">
          No eres Patron activo. Vincula tu cuenta de Patreon y sincroniza para
          ver tus beneficios.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={syncMutation.isPending}
          onClick={handleSync}
          size="sm"
          variant="outline"
        >
          {syncMutation.isPending ? (
            <Spinner className="size-4" />
          ) : (
            <HugeiconsIcon className="size-4" icon={RefreshIcon} />
          )}
          Sincronizar
        </Button>
        {status.lastSyncAt && (
          <p className="text-muted-foreground text-xs">
            {new Date(status.lastSyncAt).toLocaleString("es", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>
    </div>
  );
}
