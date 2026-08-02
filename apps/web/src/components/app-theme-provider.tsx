"use client";

import { APP_THEME_IDS, DEFAULT_APP_THEME_ID } from "@repo/shared/app-theme";
import { useQuery } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { useEffect } from "react";

import { getAppThemeQueryOptions } from "@/lib/app-theme-query";
import { authClient } from "@/lib/auth-client";

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-app-theme"
      defaultTheme={DEFAULT_APP_THEME_ID}
      disableTransitionOnChange
      enableSystem={false}
      themes={[...APP_THEME_IDS]}
    >
      <AppThemeReconciler />
      {children}
    </ThemeProvider>
  );
}

export function AppThemeReconciler() {
  const session = authClient.useSession();
  const userId = session.data?.user.id;
  const { data } = useQuery({
    ...getAppThemeQueryOptions(userId ?? "anonymous"),
    enabled: !session.isPending && Boolean(userId),
    meta: { suppressErrorToast: true },
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });
  const { setTheme } = useTheme();

  useEffect(() => {
    if (session.isPending) {
      return;
    }
    if (!userId) {
      setTheme(DEFAULT_APP_THEME_ID);
      return;
    }
    if (data) {
      setTheme(data.effectiveTheme);
    }
  }, [data, session.isPending, setTheme, userId]);

  return null;
}
