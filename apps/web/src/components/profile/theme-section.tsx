"use client";

import { Image01Icon } from "@hugeicons/core-free-icons";
import { APP_THEME_CATALOG } from "@repo/shared/app-theme";
import type { AppThemeId, AppThemeState } from "@repo/shared/app-theme";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import Link from "next/link";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { getAppThemeQueryOptions } from "@/lib/app-theme-query";
import { orpcClient } from "@/lib/orpc";

import { ProfilePanel, ProfileSectionHeader } from "./profile-section";

type ThemeMutationSnapshot = {
  state: AppThemeState | undefined;
  theme: string | undefined;
};

export function ThemeSection({
  state,
  userId,
}: {
  state: AppThemeState;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const queryOptions = getAppThemeQueryOptions(userId);
  const { setTheme, theme } = useTheme();
  const mutation = useMutation<
    AppThemeState,
    Error,
    AppThemeId,
    ThemeMutationSnapshot
  >({
    mutationFn: (themeId: AppThemeId) =>
      orpcClient.appTheme.select({ themeId }),
    onError: (_error, _themeId, snapshot) => {
      if (snapshot?.state) {
        queryClient.setQueryData(queryOptions.queryKey, snapshot.state);
      }
      setTheme(snapshot?.theme ?? state.effectiveTheme);
      toast.error("No pudimos guardar el tema. Intenta nuevamente.");
    },
    onMutate: async (themeId) => {
      await queryClient.cancelQueries(queryOptions);
      const previousState = queryClient.getQueryData<AppThemeState>(
        queryOptions.queryKey
      );
      const previousTheme = theme ?? previousState?.effectiveTheme;

      setTheme(themeId);
      if (previousState) {
        queryClient.setQueryData<AppThemeState>(queryOptions.queryKey, {
          ...previousState,
          effectiveTheme: themeId,
          selectedTheme: themeId,
        });
      }

      return { state: previousState, theme: previousTheme };
    },
    onSuccess: (nextState, themeId) => {
      queryClient.setQueryData(queryOptions.queryKey, nextState);
      setTheme(nextState.effectiveTheme);
      trackEvent("app_theme_selected", {
        source: "theme_settings",
        themeId,
      });
    },
  });

  return (
    <ProfilePanel className="p-5 sm:p-6">
      <ProfileSectionHeader
        description="Cambia la atmósfera de la aplicación. Tu elección se guarda automáticamente."
        eyebrow="Preferencia privada"
        icon={Image01Icon}
        title="Tema"
      />
      <div
        className="mt-6 grid gap-4 sm:grid-cols-2"
        role="group"
        aria-label="Tema de la aplicación"
      >
        {APP_THEME_CATALOG.map((item) => {
          const locked = item.premium && !state.premiumEligible;
          const selected = state.selectedTheme === item.id;
          const content = (
            <span className="flex w-full items-start gap-3">
              <span
                aria-hidden
                className="flex shrink-0 overflow-hidden rounded-full border border-white/15"
              >
                {item.swatches.map((color) => (
                  <span
                    className="size-4"
                    key={color}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{item.name}</span>
                <span className="mt-1 block text-xs opacity-75">
                  {item.description}
                </span>
              </span>
            </span>
          );

          if (locked) {
            return (
              <div
                aria-label={`${item.name}, tema ${selected ? "seleccionado y bloqueado" : "bloqueado"}`}
                className="flex min-h-28 flex-col items-start gap-3 rounded-lg border border-border bg-background p-4 text-left"
                key={item.id}
                role="group"
              >
                {content}
                <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                  {selected ? "Seleccionado · Bloqueado" : "Bloqueado"}
                </span>
                <Link
                  aria-label={`Ver membresías para desbloquear ${item.name}`}
                  className={buttonVariants({
                    className: "min-h-11",
                    size: "sm",
                    variant: "outline",
                  })}
                  href="/memberships"
                  onClick={() =>
                    trackEvent("app_theme_upgrade_clicked", {
                      source: "theme_settings",
                      themeId: item.id,
                    })
                  }
                >
                  Ver membresías
                </Link>
              </div>
            );
          }

          return (
            <Button
              aria-pressed={selected}
              className="h-auto min-h-28 items-start justify-start whitespace-normal p-4 text-left"
              disabled={mutation.isPending}
              key={item.id}
              onClick={() => mutation.mutate(item.id)}
              variant={selected ? "default" : "outline"}
            >
              {content}
            </Button>
          );
        })}
      </div>
      <p aria-live="polite" className="sr-only" role="status">
        {mutation.isPending ? "Guardando tema…" : ""}
      </p>
    </ProfilePanel>
  );
}
