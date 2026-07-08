"use client";

import { getAdPolicy } from "@repo/shared/constants";
import type { AdPolicy, PatronTier } from "@repo/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";

const EXOCLICK_SCRIPT_ID = "exoclick-ad-provider";
const EXOCLICK_SCRIPT_SRC = "https://a.magsrv.com/ad-provider.js";

declare global {
  interface Window {
    AdProvider?: { serve: Record<string, never> }[];
    __nexustcExoClickServedPath?: string;
  }
}

export function useViewerAdPolicy(): {
  isLoading: boolean;
  policy: AdPolicy;
} {
  const { data: auth, isPending: authPending } = authClient.useSession();
  const patronStatus = useQuery({
    ...orpc.patreon.getStatus.queryOptions(),
    enabled: Boolean(auth?.session),
  });

  if (authPending || (auth?.session && patronStatus.isPending)) {
    return { isLoading: true, policy: "none" };
  }

  const tier = (auth?.session ? patronStatus.data?.tier : "none") ?? "none";

  return {
    isLoading: false,
    policy: getAdPolicy({
      role: auth?.user.role,
      tier: tier as PatronTier,
    }),
  };
}

export function AdSlot({
  className,
  reduced = false,
  zoneId,
}: {
  className: string;
  reduced?: boolean;
  zoneId: string;
}) {
  const { isLoading, policy } = useViewerAdPolicy();

  if (isLoading || policy === "none" || (reduced && policy !== "all")) {
    return null;
  }

  return <ExoClickAd className={className} zoneId={zoneId} />;
}

function ExoClickAd({
  className,
  zoneId,
}: {
  className: string;
  zoneId: string;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (!document.querySelector(`#${EXOCLICK_SCRIPT_ID}`)) {
      const script = document.createElement("script");
      script.async = true;
      script.id = EXOCLICK_SCRIPT_ID;
      script.src = EXOCLICK_SCRIPT_SRC;
      script.type = "application/javascript";
      document.head.append(script);
    }

    if (window.__nexustcExoClickServedPath === pathname) {
      return;
    }

    window.__nexustcExoClickServedPath = pathname;
    window.AdProvider = window.AdProvider || [];
    window.AdProvider.push({ serve: {} });
  }, [pathname]);

  return <ins className={className} data-zoneid={zoneId} />;
}
