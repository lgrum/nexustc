import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "facehash";
import { toast } from "sonner";
import z from "zod";
import { DiscordLogo } from "@/components/icons/discord";
import { PatreonLogo } from "@/components/icons/patreon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppForm } from "@/hooks/use-app-form";
import { authClient, getAuthErrorMessage } from "@/lib/auth-client";
import "react-image-crop/dist/ReactCrop.css";
import {
  Cancel01Icon,
  HelpCircleIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Suspense } from "react";
import { HoverReveal } from "@/components/hover-reveal";
import { PostCard } from "@/components/landing/post-card";
import { AvatarSection } from "@/components/profile/avatar-section";
import { Spinner } from "@/components/ui/spinner";
import { UserLabel } from "@/components/users/user-label";
import { orpc } from "@/lib/orpc";
import { defaultFacehashProps, getBucketUrl } from "@/lib/utils";
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

  const session = auth.data;

  return (
    <div className="flex w-full flex-col gap-4 pt-4 pb-6 lg:flex-row lg:items-start">
      <div className="lg:w-[min(33%,22rem)] lg:min-w-[16rem] lg:max-w-88 lg:pl-4">
        {/* Profile Card */}
        <div className="relative border border-border bg-card">
          {/* Gradient banner */}
          <div className="h-20 bg-linear-to-r from-secondary/60 via-primary/30 to-accent/40" />

          {/* Avatar + info */}
          <div className="-mt-10 flex flex-col items-center gap-2 px-4 pb-4">
            <Avatar className="size-20 rounded-full border-4 border-card">
              <AvatarImage
                src={
                  session.user.image
                    ? getBucketUrl(session.user.image)
                    : undefined
                }
              />
              <AvatarFallback
                className="rounded-full"
                facehashProps={defaultFacehashProps}
                name={session.user.name}
              />
            </Avatar>
            <UserLabel className="font-bold text-xl" user={session.user} />
            <HoverReveal blur="blur-sm" className="p-1">
              <p className="text-muted-foreground text-sm">
                {session.user.email}
              </p>
            </HoverReveal>
            <Button
              className="mt-2 w-full"
              onClick={async () => {
                authClient.signOut();
                await queryClient.invalidateQueries({ queryKey: ["session"] });
              }}
              variant="destructive"
            >
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:pr-4">
        {/* Tabs section */}
        <div className="px-4 lg:px-0">
          <Tabs className="w-full" defaultValue="account">
            <TabsList className="w-full">
              <TabsTrigger value="account">Cuenta</TabsTrigger>
              <TabsTrigger value="avatar">Avatar</TabsTrigger>
              <TabsTrigger value="password">Contraseña</TabsTrigger>
            </TabsList>
            <TabsContent value="account">
              <AccountsSection />
            </TabsContent>
            <TabsContent value="avatar">
              <AvatarSection />
            </TabsContent>
            <TabsContent value="password">
              <div className="flex flex-col gap-3">
                <div className="section-title">Cambiar Contraseña</div>
                <ChangePasswordForm email={session.user.email} />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Bookmarks */}
        <div className="px-4 lg:px-0">
          <Suspense fallback={<Spinner />}>
            <UserBookmarks />
          </Suspense>
        </div>
      </div>
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
    <div className="flex flex-col gap-4">
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
            className="flex w-full items-center justify-between border border-border bg-card px-4 py-3"
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

      <Suspense fallback={<Spinner />}>
        <PatreonStatusSection />
      </Suspense>
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
      {/* This email field only exists for browser autocomplete accesibility */}
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

function UserBookmarks() {
  const { data } = useSuspenseQuery(orpc.user.getBookmarksFull.queryOptions());

  const posts = data.filter((b) => b.type === "post");
  const comics = data.filter((b) => b.type === "comic");

  return (
    <div className="flex flex-col gap-3">
      <div className="section-title">Tus Favoritos</div>
      <Tabs defaultValue="posts">
        <TabsList className="w-full">
          <TabsTrigger value="posts">
            Juegos {posts.length > 0 && `(${posts.length})`}
          </TabsTrigger>
          <TabsTrigger value="comics">
            Cómics {comics.length > 0 && `(${comics.length})`}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          className="grid grid-cols-2 gap-2.5 md:grid-cols-3"
          value="posts"
        >
          {posts.map((bookmark) => (
            <PostCard key={bookmark.id} post={bookmark} />
          ))}
          {posts.length === 0 && (
            <p className="col-span-2 py-4 text-center text-muted-foreground text-sm">
              No tienes juegos guardados
            </p>
          )}
        </TabsContent>
        <TabsContent
          className="grid grid-cols-2 gap-2.5 md:grid-cols-3"
          value="comics"
        >
          {comics.map((bookmark) => (
            <PostCard key={bookmark.id} post={bookmark} />
          ))}
          {comics.length === 0 && (
            <p className="col-span-2 py-4 text-center text-muted-foreground text-sm">
              No tienes cómics guardados
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
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
    <div className="flex flex-col gap-3 border border-border bg-card p-4">
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
